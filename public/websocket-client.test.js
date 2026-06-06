import { describe, expect, test } from "vitest";
import { WebSocketClient, resolveWebSocketUrl } from "./websocket-client.js";

describe("resolveWebSocketUrl", () => {
  test("uses the Tauri broker URL when available", () => {
    const brokerUrl = "ws://127.0.0.1:49000/ui-ws";

    expect(
      resolveWebSocketUrl({
        location: { protocol: "http:", host: "127.0.0.1:47821" },
        tauriNative: { brokerWsUrl: () => brokerUrl },
      }),
    ).toBe(brokerUrl);
  });

  test("falls back to the page-local pi websocket outside Tauri broker mode", () => {
    expect(
      resolveWebSocketUrl({
        location: { protocol: "https:", host: "studio.local" },
        tauriNative: null,
      }),
    ).toBe("wss://studio.local/ws");
  });
});

describe("WebSocketClient broker routing", () => {
  test("wraps commands with the current session route", () => {
    const sent = [];
    const client = new WebSocketClient("ws://127.0.0.1:49000/ui-ws");
    client.ws = {
      readyState: WebSocket.OPEN,
      send: (message) => sent.push(JSON.parse(message)),
    };
    client.setRoutingContext({
      workspaceId: "workspace:/tmp/project",
      sessionId: "/tmp/project/session-a.jsonl",
    });

    client.send({ type: "mirror_sync_request" });

    expect(sent).toEqual([
      {
        type: "broker_command",
        protocolVersion: 1,
        requestId: "req-1",
        workspaceId: "workspace:/tmp/project",
        sessionId: "/tmp/project/session-a.jsonl",
        payload: { type: "mirror_sync_request" },
      },
    ]);
  });

  test("attaches broker route metadata to unwrapped rpc events", () => {
    const client = new WebSocketClient("ws://127.0.0.1:49000/ui-ws");
    const events = [];
    client.addEventListener("rpcEvent", (event) => events.push(event.detail));

    client.handleMessage({
      type: "broker_event",
      workspaceId: "workspace:/tmp/project",
      sessionId: "/tmp/project/session-b.jsonl",
      sourcePort: 47822,
      payload: {
        type: "event",
        event: { type: "agent_start" },
      },
    });

    expect(events).toEqual([
      {
        type: "agent_start",
        __broker: {
          workspaceId: "workspace:/tmp/project",
          sessionId: "/tmp/project/session-b.jsonl",
          sourcePort: 47822,
        },
      },
    ]);
  });

  test("can clear the current session route for a new active process", () => {
    const sent = [];
    const client = new WebSocketClient("ws://127.0.0.1:49000/ui-ws");
    client.ws = {
      readyState: WebSocket.OPEN,
      send: (message) => sent.push(JSON.parse(message)),
    };
    client.setRoutingContext({
      workspaceId: "workspace:/tmp/project",
      sessionId: "/tmp/project/session-a.jsonl",
    });
    client.setRoutingContext({ sessionId: null });

    client.send({ type: "prompt", message: "hello" });

    expect(sent[0].sessionId).toBeUndefined();
    expect(sent[0].workspaceId).toBe("workspace:/tmp/project");
  });

  test("mirror_sync does not hijack the routing context", () => {
    const sent = [];
    const client = new WebSocketClient("ws://127.0.0.1:49000/ui-ws");
    client.ws = {
      readyState: WebSocket.OPEN,
      send: (message) => sent.push(JSON.parse(message)),
    };
    // User is actively viewing session A on port 47821.
    client.setRoutingContext({
      workspaceId: "workspace:/tmp/project",
      sessionId: "/tmp/project/session-a.jsonl",
      sourcePort: 47821,
    });

    // A background process (session B on port 47822) broadcasts a mirror_sync.
    client.handleMessage({
      type: "broker_event",
      workspaceId: "workspace:/tmp/project",
      sessionId: "/tmp/project/session-b.jsonl",
      sourcePort: 47822,
      payload: { type: "mirror_sync", sessionFile: "/tmp/project/session-b.jsonl" },
    });

    // The next command must still target session A, not the background B.
    client.send({ type: "prompt", message: "hello" });
    expect(sent[0].sessionId).toBe("/tmp/project/session-a.jsonl");
    expect(sent[0].sourcePort).toBe(47821);
  });

  test("mirror_sync surfaces the broker source port to listeners", () => {
    const client = new WebSocketClient("ws://127.0.0.1:49000/ui-ws");
    const syncs = [];
    client.addEventListener("mirrorSync", (event) => syncs.push(event.detail));

    client.handleMessage({
      type: "broker_event",
      sessionId: "/tmp/project/session-b.jsonl",
      sourcePort: 47822,
      payload: { type: "mirror_sync", sessionFile: "/tmp/project/session-b.jsonl" },
    });

    expect(syncs).toHaveLength(1);
    expect(syncs[0].port).toBe(47822);
  });

  test("wraps commands with the active source port", () => {
    const sent = [];
    const client = new WebSocketClient("ws://127.0.0.1:49000/ui-ws");
    client.ws = {
      readyState: WebSocket.OPEN,
      send: (message) => sent.push(JSON.parse(message)),
    };
    client.setRoutingContext({
      workspaceId: "workspace:/tmp/project",
      sessionId: "/tmp/project/session-a.jsonl",
      sourcePort: 47822,
    });

    client.send({ type: "mirror_sync_request" });

    expect(sent[0].sourcePort).toBe(47822);
  });
});
