use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::net::{Ipv4Addr, SocketAddrV4};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::mpsc;
use tokio_tungstenite::tungstenite::Message;

const PROTOCOL_VERSION: u8 = 1;

type Tx = mpsc::UnboundedSender<String>;

#[derive(Default)]
struct BrokerInner {
    ui_clients: Mutex<HashMap<u64, Tx>>,
    upstreams: Mutex<HashMap<u16, Tx>>,
    routes: Mutex<HashMap<String, u16>>,
    disabled_ports: Mutex<HashSet<u16>>,
    active_port: Mutex<Option<u16>>,
    next_client_id: AtomicU64,
}

#[derive(Clone)]
pub struct BrokerWs {
    port: u16,
    inner: Arc<BrokerInner>,
}

impl BrokerWs {
    pub fn start() -> Result<Self, String> {
        let std_listener = std::net::TcpListener::bind(SocketAddrV4::new(Ipv4Addr::LOCALHOST, 0))
            .map_err(|e| format!("Failed to bind broker websocket: {}", e))?;
        std_listener
            .set_nonblocking(true)
            .map_err(|e| format!("Failed to configure broker websocket: {}", e))?;
        let port = std_listener
            .local_addr()
            .map_err(|e| format!("Failed to read broker websocket address: {}", e))?
            .port();
        let broker = Self {
            port,
            inner: Arc::new(BrokerInner::default()),
        };
        let server = broker.clone();
        tauri::async_runtime::spawn(async move {
            let listener = match TcpListener::from_std(std_listener) {
                Ok(listener) => listener,
                Err(err) => {
                    log::error!("[broker-ws] failed to create Tokio listener: {}", err);
                    return;
                }
            };
            server.run(listener).await;
        });
        Ok(broker)
    }

    pub fn url(&self) -> String {
        format!("ws://127.0.0.1:{}/ui-ws", self.port)
    }

    pub fn set_active_port(&self, port: u16) {
        *self.inner.active_port.lock().unwrap() = Some(port);
    }

    pub fn register_session(&self, port: u16, session_id: &str) {
        log::info!(
            "[broker-ws] register_session port={} session_id={}",
            port,
            session_id
        );
        self.inner.disabled_ports.lock().unwrap().remove(&port);
        self.set_active_port(port);
        if !session_id.trim().is_empty() {
            self.inner
                .routes
                .lock()
                .unwrap()
                .insert(session_id.to_string(), port);
        }
        self.ensure_upstream(port);
    }

    /// Like `register_session` but does NOT promote this port to active_port.
    /// Use for background/dedicated session processes that should not become
    /// the default command target.
    pub fn track_background_session(&self, port: u16, session_id: &str) {
        self.inner.disabled_ports.lock().unwrap().remove(&port);
        if !session_id.trim().is_empty() {
            self.inner
                .routes
                .lock()
                .unwrap()
                .insert(session_id.to_string(), port);
        }
        self.ensure_upstream(port);
    }

    pub fn unregister_port(&self, port: u16) {
        log::info!("[broker-ws] unregister_port port={}", port);
        self.inner.disabled_ports.lock().unwrap().insert(port);
        self.inner.upstreams.lock().unwrap().remove(&port);
        self.inner
            .routes
            .lock()
            .unwrap()
            .retain(|_, routed| *routed != port);
        let mut active = self.inner.active_port.lock().unwrap();
        if *active == Some(port) {
            *active = None;
        }
    }

    async fn run(self, listener: TcpListener) {
        loop {
            match listener.accept().await {
                Ok((stream, _)) => {
                    let broker = self.clone();
                    tauri::async_runtime::spawn(async move {
                        broker.handle_ui_client(stream).await;
                    });
                }
                Err(err) => {
                    log::warn!("[broker-ws] accept failed: {}", err);
                    tokio::time::sleep(std::time::Duration::from_millis(250)).await;
                }
            }
        }
    }

    async fn handle_ui_client(self, stream: TcpStream) {
        let ws = match tokio_tungstenite::accept_async(stream).await {
            Ok(ws) => ws,
            Err(err) => {
                log::warn!("[broker-ws] UI websocket handshake failed: {}", err);
                return;
            }
        };
        let client_id = self.inner.next_client_id.fetch_add(1, Ordering::Relaxed);
        let (mut writer, mut reader) = ws.split();
        let (tx, mut rx) = mpsc::unbounded_channel::<String>();
        self.inner.ui_clients.lock().unwrap().insert(client_id, tx);

        let writer_task = tauri::async_runtime::spawn(async move {
            while let Some(message) = rx.recv().await {
                if writer.send(Message::Text(message)).await.is_err() {
                    break;
                }
            }
        });

        while let Some(item) = reader.next().await {
            match item {
                Ok(Message::Text(text)) => self.route_ui_message(&text),
                Ok(Message::Close(_)) => break,
                Ok(_) => {}
                Err(err) => {
                    log::warn!("[broker-ws] UI websocket read failed: {}", err);
                    break;
                }
            }
        }

        self.inner.ui_clients.lock().unwrap().remove(&client_id);
        writer_task.abort();
    }

    fn route_ui_message(&self, text: &str) {
        let Ok(value) = serde_json::from_str::<Value>(text) else {
            log::warn!("[broker-ws] invalid UI message");
            return;
        };
        let Some(port) = self.resolve_command_port(&value) else {
            log::warn!("[broker-ws] no route for UI command: {}", value);
            return;
        };
        log::info!(
            "[broker-ws] route command={} request_id={:?} session_id={:?} source_port={:?} -> port={}",
            value.pointer("/payload/type").and_then(Value::as_str).unwrap_or_else(|| {
                value.get("type").and_then(Value::as_str).unwrap_or("unknown")
            }),
            value.get("requestId").and_then(Value::as_str),
            value.get("sessionId").and_then(Value::as_str),
            value.get("sourcePort").and_then(Value::as_u64),
            port
        );
        self.ensure_upstream(port);
        let upstream_tx = self.inner.upstreams.lock().unwrap().get(&port).cloned();
        if let Some(tx) = upstream_tx {
            let _ = tx.send(text.to_string());
        } else {
            log::warn!("[broker-ws] upstream {} not connected", port);
        }
    }

    fn resolve_command_port(&self, value: &Value) -> Option<u16> {
        let session_id = value
            .get("sessionId")
            .and_then(Value::as_str)
            .or_else(|| value.pointer("/payload/sessionId").and_then(Value::as_str))
            .or_else(|| {
                value
                    .pointer("/payload/sessionFile")
                    .and_then(Value::as_str)
            })
            .or_else(|| {
                value
                    .pointer("/payload/sessionPath")
                    .and_then(Value::as_str)
            });
        if let Some(session_id) = session_id {
            if let Some(port) = self.inner.routes.lock().unwrap().get(session_id).copied() {
                return Some(port);
            }
        }
        if let Some(source_port) = value
            .get("sourcePort")
            .and_then(Value::as_u64)
            .and_then(|port| u16::try_from(port).ok())
        {
            return Some(source_port);
        }
        *self.inner.active_port.lock().unwrap()
    }

    fn ensure_upstream(&self, port: u16) {
        if self.inner.disabled_ports.lock().unwrap().contains(&port) {
            return;
        }
        // Insert the sender inside the lock before spawning so that a second
        // concurrent call sees the key and returns early — eliminates the
        // TOCTOU window between the contains_key check and the spawn.
        let rx = {
            let mut upstreams = self.inner.upstreams.lock().unwrap();
            if upstreams.contains_key(&port) {
                return;
            }
            let (tx, rx) = mpsc::unbounded_channel::<String>();
            upstreams.insert(port, tx);
            rx
        };
        let broker = self.clone();
        tauri::async_runtime::spawn(async move {
            broker.run_upstream(port, rx).await;
        });
    }

    async fn run_upstream(self, port: u16, mut rx: mpsc::UnboundedReceiver<String>) {
        let url = format!("ws://127.0.0.1:{}/ws", port);

        loop {
            if self.inner.disabled_ports.lock().unwrap().contains(&port) {
                self.inner.upstreams.lock().unwrap().remove(&port);
                return;
            }
            match tokio_tungstenite::connect_async(&url).await {
                Ok((ws, _)) => {
                    log::info!("[broker-ws] connected upstream port {}", port);
                    let (mut writer, mut reader) = ws.split();
                    let mut shutdown_check =
                        tokio::time::interval(std::time::Duration::from_millis(500));
                    loop {
                        tokio::select! {
                            _ = shutdown_check.tick() => {
                                if self.inner.disabled_ports.lock().unwrap().contains(&port) {
                                    self.inner.upstreams.lock().unwrap().remove(&port);
                                    return;
                                }
                            }
                            Some(outbound) = rx.recv() => {
                                if writer.send(Message::Text(outbound)).await.is_err() {
                                    break;
                                }
                            }
                            inbound = reader.next() => {
                                match inbound {
                                    Some(Ok(Message::Text(text))) => {
                                        if let Some(message) = self.wrap_upstream_message(port, &text) {
                                            self.broadcast(&message);
                                        }
                                    }
                                    Some(Ok(Message::Close(_))) | None => break,
                                    Some(Ok(_)) => {}
                                    Some(Err(err)) => {
                                        log::warn!("[broker-ws] upstream {} read failed: {}", port, err);
                                        break;
                                    }
                                }
                            }
                        }
                    }
                    log::warn!(
                        "[broker-ws] upstream port {} disconnected; reconnecting",
                        port
                    );
                }
                Err(err) => {
                    log::warn!("[broker-ws] upstream {} connect failed: {}", port, err);
                }
            }
            tokio::time::sleep(std::time::Duration::from_millis(750)).await;
        }
    }

    fn wrap_upstream_message(&self, port: u16, text: &str) -> Option<String> {
        let Ok(payload) = serde_json::from_str::<Value>(text) else {
            return None;
        };
        if let Some(session_id) = extract_session_id(&payload) {
            log::debug!(
                "[broker-ws] learn route session_id={} -> port={}",
                session_id,
                port
            );
            self.inner
                .routes
                .lock()
                .unwrap()
                .insert(session_id.to_string(), port);
        }
        let workspace_id = payload.get("workspaceId").cloned().unwrap_or(Value::Null);
        let session_id = payload.get("sessionId").cloned().unwrap_or(Value::Null);
        Some(
            json!({
                "type": "broker_event",
                "protocolVersion": PROTOCOL_VERSION,
                "workspaceId": workspace_id,
                "sessionId": session_id,
                "sourcePort": port,
                "payload": payload,
            })
            .to_string(),
        )
    }

    fn broadcast(&self, message: &str) {
        let mut stale = Vec::new();
        let clients = self.inner.ui_clients.lock().unwrap();
        for (id, tx) in clients.iter() {
            if tx.send(message.to_string()).is_err() {
                stale.push(*id);
            }
        }
        drop(clients);
        if !stale.is_empty() {
            let mut clients = self.inner.ui_clients.lock().unwrap();
            for id in stale {
                clients.remove(&id);
            }
        }
    }
}

fn extract_session_id(payload: &Value) -> Option<&str> {
    payload
        .get("sessionId")
        .and_then(Value::as_str)
        .or_else(|| payload.get("sessionFile").and_then(Value::as_str))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extract_session_id_prefers_route_metadata() {
        let payload = json!({
            "sessionId": "session-id",
            "sessionFile": "session-file"
        });

        assert_eq!(extract_session_id(&payload), Some("session-id"));
    }

    #[test]
    fn command_routes_by_session_id_before_active_port() {
        let broker = BrokerWs {
            port: 49000,
            inner: Arc::new(BrokerInner::default()),
        };
        broker.set_active_port(47821);
        broker.register_session(47822, "/tmp/session-b.jsonl");

        let command = json!({
            "type": "broker_command",
            "sessionId": "/tmp/session-b.jsonl",
            "payload": { "type": "mirror_sync_request" }
        });

        assert_eq!(broker.resolve_command_port(&command), Some(47822));
    }

    #[test]
    fn command_falls_back_to_active_port_without_route() {
        let broker = BrokerWs {
            port: 49000,
            inner: Arc::new(BrokerInner::default()),
        };
        broker.set_active_port(47821);

        assert_eq!(
            broker.resolve_command_port(&json!({ "type": "broker_command" })),
            Some(47821)
        );
    }

    #[test]
    fn command_routes_by_source_port_when_session_route_is_unknown() {
        let broker = BrokerWs {
            port: 49000,
            inner: Arc::new(BrokerInner::default()),
        };
        broker.set_active_port(47821);

        assert_eq!(
            broker.resolve_command_port(&json!({
                "type": "broker_command",
                "sessionId": "/tmp/unknown-session.jsonl",
                "sourcePort": 47824,
                "payload": { "type": "mirror_sync_request" }
            })),
            Some(47824)
        );
    }
}
