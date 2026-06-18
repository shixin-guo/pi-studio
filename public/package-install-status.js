export function summarizePackageError(err) {
  const raw = String(err?.message || err || "unknown error");
  if (raw.includes("EACCES") || raw.includes("permission denied")) {
    return "Permission denied in ~/.pi/agent/npm (check owner/permissions).";
  }
  return raw;
}

export function renderPackageInstallFailure(status, err) {
  if (!status) return;
  const fullMessage = String(err?.message || err || "unknown error");
  status.hidden = false;
  status.classList.add("is-error");
  status.title = "";
  status.replaceChildren();

  const title = document.createElement("div");
  title.className = "settings-extension-status-title";
  title.textContent = "Install failed";
  status.appendChild(title);

  const npmNote = document.createElement("div");
  npmNote.className = "settings-extension-status-note";
  npmNote.textContent =
    "This extension requires npm. Make sure npm is installed and available to Pi Studio, then try again.";
  status.appendChild(npmNote);

  const detail = document.createElement("div");
  detail.className = "settings-extension-status-detail";
  detail.textContent = summarizePackageError(fullMessage);
  status.appendChild(detail);
}
