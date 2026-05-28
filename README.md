# Pi Studio

A local Codex-style desktop app for the [Pi](https://github.com/badlogic/pi-mono) coding agent. No cloud, no account — runs entirely on your machine.

## Upstream and fork status

Pi Studio is a maintained fork of **Tau**, adapted for Pi-first, local development workflows.

It keeps Tau's local-first coding-agent UI philosophy and extends it with stronger multi-project desktop behavior and a smoother Pi-specific experience.

## Purpose and key changes

Pi Studio focuses on practical day-to-day use with Pi:

- Fully local operation for agent runtime, sessions, and files
- Desktop-first multi-project workflow with isolated project windows
- Browser extension mode for terminal-based Pi usage
- Better long-session ergonomics (search, navigation, context controls)

Key additions in this fork include:

- **Tauri-native process manager** (`PiManager`) that runs one `pi --mode rpc` process per project window
- **Dual runtime model**: desktop app + extension/browser mode
- **Pi-focused UX refinements** across chat streaming, session history, model/thinking controls, and file workflows
- **PWA support** in extension mode for installable mobile/desktop access

## Pi Studio vs Tau

| Area | Tau (upstream) | Pi Studio (this repo) |
|------|-----------------|------------------------|
| Scope | Base local coding-agent UI | Pi-focused fork for daily desktop use |
| Process architecture | Upstream default process flow | Per-project `pi --mode rpc` managed by Rust `PiManager` |
| Runtime options | Upstream mode(s) | Native Tauri app + Pi extension/browser mode |
| Multi-project UX | Upstream baseline | Launcher-first parallel windows with isolated session state |
| Pi workflow depth | General upstream integration | Extended Pi UX: chat streaming, session search, model/thinking controls, inline tool-call UX |
| Mobile/browser access | Upstream-dependent setup | Built-in extension mode with PWA install support |

![Pi Studio dark mode](docs/images/dark.png)

![Pi Studio terracotta theme](docs/images/terracotta.png)

## What it does

Pi Studio gives you a full visual interface for Pi. Open any project, chat with the agent, browse sessions and files — all from a native desktop app. Multiple projects run in parallel, each in its own window with its own agent.

- **Multi-project** — each project gets its own window, working directory, session history, and running agent
- **Live chat** — streaming responses, tool-call cards, thinking blocks, inline diffs
- **Session browser** — view and resume any past session, full-text search across history
- **File browser** — lazy-loaded file tree, drag files into the chat
- **No terminal required** — launch, switch, and manage agents entirely from the GUI

## Install

### Desktop app

Download the latest release for macOS.

Or build from source:

```bash
git clone https://github.com/deflating/pi-studio.git
cd pi-studio
npm run build
```

### Pi extension (browser mode)

If you prefer to run Pi in the terminal and access the UI in a browser:

```bash
pi install npm:pi-studio
```

Then open the URL shown in the status bar (default: `http://localhost:3001`).

## Usage

1. Launch **Pi Studio**
2. Click a project bubble to open it (or pick a folder)
3. Start chatting — Pi agent starts automatically

Type `/qr` in the terminal to show a QR code and access from your phone.

## Features

### Chat
- Full markdown rendering with syntax-highlighted code blocks
- Streaming responses with typing indicator
- Image attachments (paste, drag & drop, or button)
- Copy any message with one click
- Inline diff viewer for edit tool calls (red/green lines)
- Scroll-to-bottom button with new message indicator
- Message queuing — type while the agent is working, messages queue and auto-send

### Session Management
- Browse all past sessions grouped by project
- Full-text search across all session history with highlighted snippets
- Sorted by last modified (most recent first)
- Live session marked with a green dot
- Historical sessions are read-only
- Inline session rename
- Favourite sessions, tags, and filtering

### Model & Thinking
- Model picker with search/filter and keyboard support
- Thinking level toggle (off/low/medium/high)
- Token usage percentage with context window visualiser
- Cost tracking per session

### Voice Input
- Mic button in the input area using Web Speech API (on-device dictation)
- Live transcription into the textarea
- Pulses red while recording

### File Browser
- Right sidebar with lazy-loaded file tree
- Navigate directories, open files natively
- Drag files onto the input to insert their path

### Compaction
- Manual context compaction with status display
- Auto-compaction support

### Themes
Six built-in themes: Dusk, Dawn, Midnight, Clean, Terracotta, Sage.

### PWA (browser/extension mode)
- Installable as a standalone app on iOS, Android, and macOS
- Custom app icons
- Service worker with network-first caching

## Configuration (extension mode)

Environment variables (set before starting Pi):

| Variable | Default | Description |
|----------|---------|-------------|
| `PI_STUDIO_PORT` | `3001` | Server port |
| `PI_STUDIO_STATIC_DIR` | *(bundled)* | Override static files path |
| `PI_STUDIO_DISABLED` | `0` | Set to `1` to disable Pi Studio (stays installed but won't start the server) |
| `PI_STUDIO_USER` | *(none)* | HTTP Basic Auth username (both `PI_STUDIO_USER` and `PI_STUDIO_PASS` required to enable) |
| `PI_STUDIO_PASS` | *(none)* | HTTP Basic Auth password |

### Authentication

Supports optional HTTP Basic Auth:

**1. Set credentials** — add to `~/.pi/agent/settings.json`:

```json
{
  "pistudio": {
    "user": "pi",
    "pass": "your-password"
  }
}
```

Or via environment variables: `PI_STUDIO_USER=pi PI_STUDIO_PASS=secret pi`

**2. Toggle on/off** — once credentials are configured, a "Require login" toggle appears in Settings. The setting persists across restarts.

### Start / Stop (extension mode)

```
/studiostop     Stop the Pi Studio server
/studiostart    Start it again
```

To prevent auto-starting:

```bash
PI_STUDIO_DISABLED=1 pi
```

You can still start it manually with `/studiostart` in that session.

## How it works

**Desktop app:** Tauri wraps the web UI. A Rust `PiManager` spawns one `pi --mode rpc` subprocess per workspace, each on its own port. Each project gets its own OS window.

**Extension mode:** `extensions/mirror-server.ts` starts an HTTP + WebSocket server inside the Pi process, subscribes to all Pi events, and forwards them to connected browser clients.

```
Desktop app:
┌─────────────┐     ┌──────────────────────────────┐
│  Pi Studio  │     │  Tauri + PiManager           │
│  (Webview)  │◄───►│    ↳ pi --mode rpc :3001     │
│             │     │    ↳ pi --mode rpc :3002     │
└─────────────┘     └──────────────────────────────┘

Extension mode:
┌─────────────┐     ┌──────────────────────────────┐     ┌─────────────┐
│  Pi TUI     │     │  Pi Process                  │     │  Browser    │
│  (terminal) │◄───►│    ↳ HTTP + WS on :3001      │◄───►│  (Pi Studio)│
└─────────────┘     └──────────────────────────────┘     └─────────────┘
```

## Development

```bash
git clone https://github.com/deflating/pi-studio.git
cd pi-studio
PI_STUDIO_STATIC_DIR=$(pwd)/public pi
```

Edit files in `public/` — refresh the browser to see changes.

For the Tauri desktop app:

```bash
npm run dev
```

## License

MIT
