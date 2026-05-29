// Multi-task model
// ──────────────────
// "New session" in Pi Studio always spawns a *new* pi process in a *new* OS
// window — even when the target cwd already has a running pi.
//
// Rationale: a `pi --mode rpc` process can only drive ONE active session at
// a time. `new_session` / `switch_session` / fork inside an existing process
// just *replace* the active session — the previous session's .jsonl stays on
// disk and can be reloaded later, but it stops being the live, running
// session in that process. So any concurrently-running session structurally
// needs its own pi process. We map that 1:1 onto OS windows: each "new
// session" gets its own isolated pi process and its own window. Switching
// back to a previous task is just clicking that other window (or reopening
// it from the launcher / sidebar via the running-instance list).
//
// "Open project" / "Open folder" entry points still attach to an existing pi
// instance for the same cwd when one exists — those actions are about
// *finding* the project, not starting a new task.

async function spawnWorkspaceWindow({ targetCwd, tauriNative, renderError }) {
  try {
    // openWorkspace allocates a fresh port and opens a new OS window.
    // forceNewSession=false because a freshly-spawned pi already boots into
    // a brand-new session; sending an extra new_session RPC would just force
    // a redundant extension reload (see the original timing-perf comment in
    // git history).
    await tauriNative.openWorkspace(targetCwd, {
      forceNewSession: false,
      openWindow: true,
      waitForSessions: false,
    });
    return true;
  } catch (e) {
    if (renderError) renderError(`Failed to start new session: ${e}`);
    return false;
  }
}

// "Attach to workspace" flow used by Open Project / Open Folder. Reuses an
// existing pi instance for the same cwd when present, otherwise spawns a
// windowless pi and navigates the *current* window to it.
async function attachToWorkspace({
  targetCwd,
  tauriNative,
  fetchInstances,
  getCurrentPort,
  navigate,
  renderError,
}) {
  const instances = await fetchInstances();
  const currentPort = getCurrentPort();
  const current = instances.find((i) => i.port === currentPort);

  if (current && current.cwd === targetCwd) {
    return { samePort: true, port: currentPort };
  }

  const existing = instances.find((i) => i.cwd === targetCwd);
  let targetPort = existing?.port;

  if (!targetPort) {
    try {
      targetPort = await tauriNative.openWorkspace(targetCwd, {
        forceNewSession: false,
        openWindow: false,
        waitForSessions: false,
      });
    } catch (e) {
      if (renderError) renderError(`Failed to attach to workspace: ${e}`);
      return null;
    }
  }

  navigate(`http://localhost:${targetPort}/`);
  return { samePort: false, port: targetPort };
}

// "+ New Session" button in the current window's header.
// Always spawns a fresh pi process in a new OS window so the current task
// keeps running undisturbed in this window.
export async function startInWindowNewSession({
  tauriNative,
  getCurrentCwd,
  fetchInstances,
  getCurrentPort,
  renderError,
}) {
  if (!tauriNative) {
    renderError('New session is only supported in Tauri mode.');
    return false;
  }

  let targetCwd = null;
  if (typeof getCurrentCwd === 'function') {
    try {
      targetCwd = getCurrentCwd();
    } catch {
      targetCwd = null;
    }
  }

  if (!targetCwd && fetchInstances && getCurrentPort) {
    try {
      const instances = await fetchInstances();
      const port = getCurrentPort();
      targetCwd = instances.find((i) => i.port === port)?.cwd || null;
    } catch {
      targetCwd = null;
    }
  }

  if (!targetCwd) {
    renderError('Failed to start new session: current workspace path is unavailable');
    return false;
  }

  return spawnWorkspaceWindow({ targetCwd, tauriNative, renderError });
}

function resolveProjectCwd(project) {
  return project?.sessions?.find((session) => session?.cwd)?.cwd || project?.path;
}

// Sidebar / project "start new chat" entry point.
// Always spawns a fresh pi process + new window for the project's cwd, even
// if there's already a pi running for that project. This is what enables
// "multiple agents on the same project at the same time".
export async function startNewProjectChat({
  project,
  tauriNative,
  renderError,
}) {
  if (!tauriNative) {
    renderError('Project new chat is only supported in Tauri mode.');
    return false;
  }

  const targetCwd = resolveProjectCwd(project);
  if (!targetCwd) {
    renderError('Failed to start new chat: project path is unavailable');
    return false;
  }

  return spawnWorkspaceWindow({ targetCwd, tauriNative, renderError });
}

// Launcher bubble / "Open Folder" entry point. Does NOT spawn a parallel
// pi if one is already running for that cwd — opening a project is about
// *finding* it, not starting a new task. The user can still hit "+ New
// Session" inside the workspace window to fork a parallel agent.
export async function openProjectWorkspace({
  project,
  tauriNative,
  fetchInstances,
  getCurrentPort,
  navigate,
  renderError,
}) {
  if (!tauriNative) {
    renderError('Open project is only supported in Tauri mode.');
    return false;
  }

  const targetCwd = resolveProjectCwd(project);
  if (!targetCwd) {
    renderError('Failed to open project: project path is unavailable');
    return false;
  }

  try {
    const result = await attachToWorkspace({
      targetCwd,
      tauriNative,
      fetchInstances,
      getCurrentPort,
      navigate,
      renderError,
    });
    return result !== null;
  } catch (e) {
    renderError(`Failed to open project: ${e}`);
    return false;
  }
}

export async function openFolderAsWorkspace({
  tauriNative,
  fetchInstances,
  getCurrentPort,
  navigate,
  renderError,
}) {
  if (!tauriNative) {
    renderError('Open folder is only supported in Tauri mode.');
    return false;
  }

  try {
    const selectedPath = await tauriNative.pickFolder();
    if (!selectedPath) return false;

    const result = await attachToWorkspace({
      targetCwd: selectedPath,
      tauriNative,
      fetchInstances,
      getCurrentPort,
      navigate,
      renderError,
    });
    return result !== null;
  } catch (e) {
    renderError(`Failed to open folder: ${e}`);
    return false;
  }
}
