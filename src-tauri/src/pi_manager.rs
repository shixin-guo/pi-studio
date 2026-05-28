use std::collections::HashMap;
use std::env;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

struct PiProcess {
    child: Child,
    stdin: ChildStdin,
}

pub struct PiManager {
    processes: Arc<Mutex<HashMap<u16, PiProcess>>>,
    static_dir: PathBuf,
}

struct PiCommandResolution {
    argv: Vec<String>,
    path_env: Option<String>,
    version: String,
}

impl PiManager {
    pub fn new(static_dir: PathBuf) -> Self {
        Self {
            processes: Arc::new(Mutex::new(HashMap::new())),
            static_dir,
        }
    }

    fn build_pi_path_env(explicit_bin: Option<&str>) -> Option<String> {
        let mut paths: Vec<PathBuf> = env::var_os("PATH")
            .map(|value| env::split_paths(&value).collect())
            .unwrap_or_default();
        let mut extras: Vec<PathBuf> = Vec::new();

        #[cfg(not(target_os = "windows"))]
        {
            extras.extend(
                [
                    "/opt/homebrew/bin",
                    "/usr/local/bin",
                    "/usr/bin",
                    "/bin",
                    "/usr/sbin",
                    "/sbin",
                ]
                .into_iter()
                .map(PathBuf::from),
            );

            if let Ok(home) = env::var("HOME") {
                let home_path = Path::new(&home);
                extras.push(home_path.join(".local/bin"));
                extras.push(home_path.join(".cargo/bin"));
                extras.push(home_path.join(".bun/bin"));
            }
        }

        #[cfg(target_os = "windows")]
        {
            if let Ok(appdata) = env::var("APPDATA") {
                extras.push(Path::new(&appdata).join("npm"));
            }
            if let Ok(local_app_data) = env::var("LOCALAPPDATA") {
                extras.push(
                    Path::new(&local_app_data)
                        .join("Microsoft")
                        .join("WindowsApps"),
                );
            }
        }

        if let Some(bin_path) = explicit_bin.filter(|value| !value.trim().is_empty()) {
            if let Some(parent) = Path::new(bin_path.trim()).parent() {
                extras.push(parent.to_path_buf());
            }
        }

        for extra in extras {
            if !paths.iter().any(|path| path == &extra) {
                paths.push(extra);
            }
        }
        if paths.is_empty() {
            return None;
        }
        env::join_paths(paths)
            .ok()
            .map(|joined| joined.to_string_lossy().to_string())
    }

    fn candidate_pi_commands() -> Vec<Vec<String>> {
        let mut candidates: Vec<Vec<String>> = Vec::new();
        if let Ok(explicit) = env::var("PI_BIN") {
            let candidate = explicit.trim();
            if !candidate.is_empty() {
                candidates.push(vec![candidate.to_string()]);
            }
        }

        if let Ok(output) = Command::new("/bin/sh")
            .arg("-lc")
            .arg("command -v pi")
            .output()
        {
            if output.status.success() {
                let p = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !p.is_empty() {
                    candidates.push(vec![p]);
                }
            }
        }

        let common_paths = ["/opt/homebrew/bin/pi", "/usr/local/bin/pi"];
        for candidate in common_paths {
            if Path::new(candidate).exists() {
                candidates.push(vec![candidate.to_string()]);
            }
        }

        // Fallback: local dev path
        let local = dirs::home_dir()
            .unwrap_or_default()
            .join("code/pi/pi-mono/packages/coding-agent/dist/cli.js");
        if local.exists() {
            candidates.push(vec!["node".to_string(), local.to_string_lossy().to_string()]);
        }
        candidates.push(vec!["pi".to_string()]);

        let mut deduped: Vec<Vec<String>> = Vec::new();
        for candidate in candidates {
            if !deduped.iter().any(|value| value == &candidate) {
                deduped.push(candidate);
            }
        }
        deduped
    }

    fn check_pi_command(argv: &[String], path_env: Option<&str>) -> Result<String, String> {
        let mut command = Command::new(&argv[0]);
        command.args(&argv[1..]).arg("--version");
        if let Some(path_env) = path_env {
            command.env("PATH", path_env);
        }
        let output = command.output().map_err(|err| err.to_string())?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            return Err(if stderr.is_empty() {
                format!("{} --version exited with {}", argv.join(" "), output.status)
            } else {
                format!(
                    "{} --version exited with {}: {}",
                    argv.join(" "),
                    output.status,
                    stderr
                )
            });
        }
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let version = if !stdout.is_empty() { stdout } else { stderr };
        if version.is_empty() {
            Err(format!("{} --version returned empty output", argv.join(" ")))
        } else {
            Ok(version)
        }
    }

    fn resolve_pi_command() -> Result<PiCommandResolution, String> {
        let candidates = Self::candidate_pi_commands();
        let explicit_bin = env::var("PI_BIN")
            .ok()
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty());
        let path_env = Self::build_pi_path_env(explicit_bin.as_deref());

        let mut errors: Vec<String> = Vec::new();
        for argv in candidates {
            match Self::check_pi_command(&argv, path_env.as_deref()) {
                Ok(version) => {
                    return Ok(PiCommandResolution {
                        argv,
                        path_env: path_env.clone(),
                        version,
                    });
                }
                Err(err) => errors.push(err),
            }
        }

        Err(format!(
            "Unable to locate a working `pi` executable. {}",
            errors.join(" | ")
        ))
    }

    pub fn resolve_pi_version() -> Result<String, String> {
        let resolution = Self::resolve_pi_command()?;
        Ok(resolution.version)
    }

    fn resolve_mirror_extension_path(&self) -> Option<String> {
        if let Ok(explicit) = env::var("PI_STUDIO_EXTENSION") {
            let candidate = explicit.trim();
            if !candidate.is_empty() && Path::new(candidate).exists() {
                return Some(candidate.to_string());
            }
        }

        let mut candidates: Vec<PathBuf> = Vec::new();
        if let Some(parent) = self.static_dir.parent() {
            candidates.push(parent.join("extensions").join("mirror-server.ts"));
        }
        candidates.push(
            PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("..")
                .join("extensions")
                .join("mirror-server.ts"),
        );
        if let Ok(cwd) = env::current_dir() {
            candidates.push(cwd.join("extensions").join("mirror-server.ts"));
        }

        candidates
            .into_iter()
            .find(|candidate| candidate.exists())
            .map(|candidate| candidate.to_string_lossy().to_string())
    }

    pub fn spawn(&self, cwd: &str, port: u16, session_path: Option<&str>) -> Result<(), String> {
        let resolved = Self::resolve_pi_command()?;
        let argv = resolved.argv;
        let static_dir = self.static_dir.to_string_lossy().to_string();

        let mut args: Vec<String> = argv[1..].to_vec();
        if let Some(extension_path) = self.resolve_mirror_extension_path() {
            args.push("--extension".to_string());
            args.push(extension_path);
        } else {
            eprintln!(
                "[pi-desktop] mirror-server extension not found; runtime may not expose /api and /ws"
            );
        }
        args.push("--mode".to_string());
        args.push("rpc".to_string());
        if let Some(session) = session_path {
            args.push("--session".to_string());
            args.push(session.to_string());
        }

        eprintln!(
            "[pi-desktop] spawning pi: argv={:?} args={:?} cwd={} port={} static_dir={}",
            argv, args, cwd, port, static_dir
        );

        let mut child = Command::new(&argv[0]);
        child
            .args(&args)
            .current_dir(cwd)
            .env("PI_STUDIO_STATIC_DIR", &static_dir)
            .env("PI_STUDIO_PORT", port.to_string())
            .stdin(Stdio::piped())
            // Drop stdout: pi emits RPC frames on it that we don't consume here, and
            // letting it fill an unread pipe would eventually block the child.
            .stdout(Stdio::null())
            // Inherit stderr so pi's startup/runtime errors are visible in the same
            // terminal running `npm run dev` — critical for diagnosing failures of
            // new_session / open_workspace that would otherwise be silent.
            .stderr(Stdio::inherit());
        if let Some(path_env) = &resolved.path_env {
            child.env("PATH", path_env);
        }

        let spawn_started_at = Instant::now();
        let mut child = child.spawn().map_err(|e| {
            format!(
                "Failed to spawn pi ({}): {}. Resolved version: {}. Check that `pi` is on PATH or that {} exists.",
                argv.join(" "),
                e,
                resolved.version,
                dirs::home_dir()
                    .unwrap_or_default()
                    .join("code/pi/pi-mono/packages/coding-agent/dist/cli.js")
                    .display()
            )
        })?;
        eprintln!(
            "[pi-desktop] pi process spawned: port={} pid={} elapsed_ms={}",
            port,
            child.id(),
            spawn_started_at.elapsed().as_millis()
        );
        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| "Failed to get pi stdin".to_string())?;

        let mut lock = self.processes.lock().unwrap();
        lock.insert(port, PiProcess { child, stdin });

        Ok(())
    }

    /// Send an RPC command to a pi instance (JSON line on stdin)
    pub fn send_rpc(&self, port: u16, cmd: serde_json::Value) -> Result<(), String> {
        let mut lock = self.processes.lock().unwrap();
        let proc = lock
            .get_mut(&port)
            .ok_or_else(|| format!("No pi instance on port {}", port))?;
        let mut line = cmd.to_string();
        line.push('\n');
        proc.stdin
            .write_all(line.as_bytes())
            .map_err(|e| e.to_string())
    }

    pub fn kill(&self, port: u16) {
        let mut lock = self.processes.lock().unwrap();
        if let Some(mut proc) = lock.remove(&port) {
            let _ = proc.child.kill();
        }
    }

    pub fn kill_all(&self) {
        let mut lock = self.processes.lock().unwrap();
        for (_, mut proc) in lock.drain() {
            let _ = proc.child.kill();
        }
    }

    pub fn next_port(&self) -> u16 {
        let lock = self.processes.lock().unwrap();
        let mut port = 3001u16;
        while lock.contains_key(&port) || is_port_in_use(port) {
            port += 1;
        }
        port
    }
}

pub fn is_port_in_use(port: u16) -> bool {
    std::net::TcpListener::bind(format!("127.0.0.1:{}", port)).is_err()
}

pub async fn wait_for_health(port: u16, timeout_secs: u64) -> Result<(), String> {
    wait_for_endpoint(port, "/api/health", timeout_secs).await
}

/// Wait for a specific HTTP endpoint on the pi instance to respond with a non-5xx status.
/// Useful when we need to confirm the API surface the frontend will hit first (e.g. /api/sessions)
/// is ready before navigating, avoiding cold-start races where /api/health is up but route
/// handlers are still warming.
pub async fn wait_for_endpoint(port: u16, path: &str, timeout_secs: u64) -> Result<(), String> {
    let url = format!("http://localhost:{}{}", port, path);
    let deadline = std::time::Instant::now() + Duration::from_secs(timeout_secs);
    loop {
        if std::time::Instant::now() > deadline {
            return Err(format!("Timed out waiting for {} on port {}", path, port));
        }
        if let Ok(resp) = reqwest::get(&url).await {
            if resp.status().as_u16() < 500 {
                return Ok(());
            }
        }
        tokio::time::sleep(Duration::from_millis(300)).await;
    }
}
