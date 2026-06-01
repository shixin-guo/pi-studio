# Design: Delete All Archived Sessions

**Date:** 2026-06-01  
**Status:** Approved

## Summary

Add a single "Delete All" button to the Archived sessions section header in the sidebar. Clicking it shows a confirmation dialog, then permanently deletes all archived session `.jsonl` files from disk and clears the archived list.

## Architecture

Two files change:

1. **`extensions/embedded-server.ts`** — new HTTP endpoint to batch-delete session files on disk
2. **`public/session-sidebar.js`** — trash icon button in the Archived header; confirmation dialog; calls endpoint; refreshes sidebar

## Backend

### New endpoint

```
POST /api/sessions/delete-batch
Content-Type: application/json
Body: { "filePaths": ["<absolute path>.jsonl", ...] }
Response 200: { "deleted": <number>, "errors": ["<path>", ...] }
Response 400: { "error": "<reason>" }
```

### Security validation

Each path must satisfy all of the following before deletion:
- Is a string
- Ends with `.jsonl`
- Resolves to an absolute path within one of the known pi sessions directories (e.g. `~/.pi/sessions/` or `<workspace>/.pi/sessions/`)
- File exists on disk

Paths that fail validation are added to `errors` and skipped. Valid paths are deleted with `fs.unlink`. A single failure does not abort the rest.

### Cache invalidation

After deletion, remove each successfully deleted path from `globalState.sessionHeaderCache` and `globalState.sessionMetricsCache` (same pattern used elsewhere in the server for session cleanup).

## Frontend

### Button placement

In `buildArchivedGroupHeader()` (inside `render()`), add a trash SVG icon button to the right of the session count badge. The button:
- Uses an inline SVG trash icon (consistent with other sidebar icon buttons)
- Is only rendered when `archivedSessions.length > 0`
- On hover: icon color transitions to red (`--color-error` or `#e53e3e`)
- `stopPropagation()` on click so the header collapse toggle is not triggered

### Interaction flow

1. User clicks 🗑️ button
2. Native `confirm()` dialog: `"Delete ${count} archived session${count === 1 ? '' : 's'} permanently? This cannot be undone."`
3. User cancels → nothing happens
4. User confirms →
   a. Collect all `this.archived` file paths
   b. `POST /api/sessions/delete-batch` with those paths
   c. On success: remove deleted paths from `this.archived`, call `this.saveArchived()`, call `this.loadSessions()` to refresh the sidebar
   d. On network/server error: `console.error` only — no user-facing error toast (matches existing low-noise error pattern)

### Confirmation dialog

Use the browser's native `confirm()`, consistent with the existing pattern in `app.js` (lines 2793, 3068). No custom modal needed.

## Edge Cases

| Case | Handling |
|------|----------|
| Active session is in archived list | File is deleted; sidebar refreshes; app continues with whatever session is active |
| File already missing from disk | `fs.unlink` error is caught, path added to `errors`, rest continue |
| Partial deletion failure (permissions etc.) | Delete as many as possible; remove only successfully deleted paths from `this.archived` |
| Archived list is empty | Button is not rendered |
| User clicks button while sidebar is loading | Button click triggers confirm flow normally; `loadSessions()` at the end reconciles state |

## Testing

- Unit tests in `public/session-sidebar.test.js` (or add to existing test file if one exists):
  - Button renders when archived sessions exist
  - Button is absent when archived list is empty
  - Clicking button and confirming calls `fetch` with correct payload
  - Clicking button and cancelling does nothing
- Manual smoke test: archive 2 sessions, click delete all, confirm files are gone from disk and sidebar is empty
