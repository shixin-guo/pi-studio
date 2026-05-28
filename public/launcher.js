/**
 * Launcher — project directory picker with visual bubbles
 */

export class Launcher {
  constructor(container, onLaunch) {
    this.container = container;
    this.onLaunch = onLaunch;
    this.projects = [];
    this.menuProjectPath = null;
    this.openProjectPath = null;
    this.pinnedProjects = this.getPinnedProjects();
    this.openTargets = [];
  }

  async load() {
    this.container.innerHTML = '<div class="launcher-loading">Loading projects…</div>';
    try {
      const [projectsRes, openTargetsRes] = await Promise.all([
        fetch('/api/projects'),
        fetch('/api/open-targets').catch(() => null),
      ]);
      const data = await projectsRes.json();
      this.projects = data.projects || [];
      if (openTargetsRes && openTargetsRes.ok) {
        const openTargetsData = await openTargetsRes.json().catch(() => ({}));
        this.openTargets = Array.isArray(openTargetsData.targets) ? openTargetsData.targets : [];
      } else {
        this.openTargets = [
          { id: 'finder', label: 'Finder' },
          { id: 'terminal', label: 'Terminal' },
        ];
      }
      this.render();
    } catch (e) {
      this.container.innerHTML = '<div class="launcher-loading">Failed to load projects</div>';
    }
  }

  render() {
    if (!this.projects.length) {
      this.container.innerHTML = `
        <div class="launcher-empty">
          <p>No projects directory configured.</p>
          <p class="hint">Add <code>"tau": { "projectsDir": "~/Projects" }</code> to <code>~/.pi/agent/settings.json</code></p>
        </div>`;
      return;
    }

    // Find max session count for relative sizing
    const maxSessions = Math.max(1, ...this.projects.map(p => p.sessionCount));
    const now = Date.now();

    // Sort: pinned first, then active, then recency
    const sorted = [...this.projects].sort((a, b) => {
      const aPinned = this.pinnedProjects.has(a.path);
      const bPinned = this.pinnedProjects.has(b.path);
      if (aPinned && !bPinned) return -1;
      if (!aPinned && bPinned) return 1;
      if (a.active && !b.active) return -1;
      if (!a.active && b.active) return 1;
      return (b.lastActive || 0) - (a.lastActive || 0);
    });

    const bubbles = sorted.map(p => {
      // Size: scale between 0.7 and 1.3 based on session count
      const sizeRatio = 0.7 + (p.sessionCount / maxSessions) * 0.6;

      // Recency: how fresh is this project (0 = ancient, 1 = today)
      let freshness = 0;
      if (p.lastActive) {
        const ageMs = now - p.lastActive;
        const ageDays = ageMs / (1000 * 60 * 60 * 24);
        freshness = Math.max(0, 1 - (ageDays / 30)); // fades over 30 days
      }
      const isPinned = this.pinnedProjects.has(p.path);

      return `
        <div class="launcher-bubble-shell" data-path="${this.escAttr(p.path)}">
          <button class="launcher-bubble${p.active ? ' active' : ''}"
                  data-path="${this.escAttr(p.path)}"
                  style="--size: ${sizeRatio}; --freshness: ${freshness.toFixed(2)}"
                  title="${this.escAttr(p.path)}${p.active ? ' (running)' : ''}${p.sessionCount ? ` • ${p.sessionCount} session${p.sessionCount !== 1 ? 's' : ''}` : ''}">
            ${isPinned ? '<span class="launcher-bubble-pin">📌</span>' : ''}
            <span class="launcher-bubble-name">${this.escHtml(p.name)}</span>
            ${p.active ? '<span class="launcher-bubble-dot"></span>' : ''}
          </button>
          <button class="launcher-menu-trigger" data-path="${this.escAttr(p.path)}" aria-label="Project actions" title="Project actions">⋯</button>
          <button class="launcher-open-trigger" data-path="${this.escAttr(p.path)}" aria-label="Open workspace with app" title="Open workspace with app">⌄</button>
          <div class="launcher-open-menu${this.openProjectPath === p.path ? ' open' : ''}">
            ${this.openTargets.map((target) => `
              <button class="launcher-menu-item" data-action="open-target" data-target="${this.escAttr(target.id)}" data-path="${this.escAttr(p.path)}">
                ${this.escHtml(target.label)}
              </button>
            `).join('')}
          </div>
          <div class="launcher-menu${this.menuProjectPath === p.path ? ' open' : ''}">
            <button class="launcher-menu-item" data-action="pin" data-path="${this.escAttr(p.path)}">
              ${isPinned ? 'Unpin project' : 'Pin project'}
            </button>
            <button class="launcher-menu-item" data-action="finder" data-path="${this.escAttr(p.path)}">
              Open in Finder
            </button>
            <button class="launcher-menu-item" data-action="worktree" data-path="${this.escAttr(p.path)}">
              Create permanent worktree
            </button>
            <button class="launcher-menu-item" data-action="rename" data-path="${this.escAttr(p.path)}">
              Rename project
            </button>
            <button class="launcher-menu-item" data-action="archive" data-path="${this.escAttr(p.path)}">
              Archive chats
            </button>
            <button class="launcher-menu-item danger" data-action="remove" data-path="${this.escAttr(p.path)}">
              🗃 Archive workspace
            </button>
          </div>
        </div>`;
    }).join('');

    this.container.innerHTML = `
      <div class="launcher-content">
        <div class="launcher-title">Projects</div>
        <div class="launcher-grid">${bubbles}</div>
      </div>`;

    // Bind click handlers
    this.container.querySelectorAll('.launcher-bubble').forEach(btn => {
      btn.addEventListener('click', () => {
        const projectPath = btn.dataset.path;
        if (this.onLaunch) this.onLaunch(projectPath);
      });
    });

    this.container.querySelectorAll('.launcher-menu-trigger').forEach(btn => {
      btn.addEventListener('click', (event) => {
        event.stopPropagation();
        const projectPath = btn.dataset.path;
        this.menuProjectPath = this.menuProjectPath === projectPath ? null : projectPath;
        this.openProjectPath = null;
        this.render();
      });
    });

    this.container.querySelectorAll('.launcher-open-trigger').forEach(btn => {
      btn.addEventListener('click', (event) => {
        event.stopPropagation();
        const projectPath = btn.dataset.path;
        this.openProjectPath = this.openProjectPath === projectPath ? null : projectPath;
        this.menuProjectPath = null;
        this.render();
      });
    });

    this.container.querySelectorAll('.launcher-menu-item').forEach(btn => {
      btn.addEventListener('click', async (event) => {
        event.stopPropagation();
        const action = btn.dataset.action;
        const projectPath = btn.dataset.path;
        const openTarget = btn.dataset.target || null;
        await this.handleMenuAction(action, projectPath, openTarget);
      });
    });

    if (this.menuProjectPath || this.openProjectPath) {
      const closeMenu = (event) => {
        if (!event.target.closest('.launcher-bubble-shell')) {
          this.menuProjectPath = null;
          this.openProjectPath = null;
          this.render();
        }
      };
      setTimeout(() => {
        document.addEventListener('click', closeMenu, { once: true });
      }, 0);
    }
  }

  getPinnedProjects() {
    try {
      const raw = localStorage.getItem('pi-studio-pinned-projects');
      const parsed = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) return new Set();
      return new Set(parsed.filter((entry) => typeof entry === 'string'));
    } catch {
      return new Set();
    }
  }

  persistPinnedProjects() {
    localStorage.setItem('pi-studio-pinned-projects', JSON.stringify(Array.from(this.pinnedProjects)));
  }

  async callProjectApi(endpoint, payload, errorMessage) {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 409) throw new Error(data.error || 'Workspace is running. Please stop it first.');
      throw new Error(data.error || errorMessage);
    }
    return data;
  }

  async handleMenuAction(action, projectPath, openTarget = null) {
    if (!projectPath) return;

    switch (action) {
      case 'pin': {
        if (this.pinnedProjects.has(projectPath)) this.pinnedProjects.delete(projectPath);
        else this.pinnedProjects.add(projectPath);
        this.persistPinnedProjects();
        this.menuProjectPath = null;
        this.openProjectPath = null;
        this.render();
        return;
      }
      case 'finder': {
        try {
          await fetch('/api/open', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filePath: projectPath }),
          });
        } finally {
          this.menuProjectPath = null;
          this.openProjectPath = null;
          this.render();
        }
        return;
      }
      case 'open-target': {
        try {
          await fetch('/api/open', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filePath: projectPath, target: openTarget }),
          });
        } finally {
          this.menuProjectPath = null;
          this.openProjectPath = null;
          this.render();
        }
        return;
      }
      case 'worktree': {
        window.alert('Create permanent worktree is coming soon.');
        this.menuProjectPath = null;
        this.openProjectPath = null;
        this.render();
        return;
      }
      case 'rename':
        await this.renameProject(projectPath);
        return;
      case 'archive':
        await this.archiveChats(projectPath);
        return;
      case 'remove':
        await this.archiveWorkspace(projectPath);
        return;
      default:
        return;
    }
  }

  async renameProject(projectPath) {
    const project = this.projects.find((p) => p.path === projectPath);
    const oldName = project?.name || '';
    const newName = window.prompt('Rename project', oldName);
    if (!newName || newName.trim() === '' || newName.trim() === oldName) {
      this.menuProjectPath = null;
      this.openProjectPath = null;
      this.render();
      return;
    }

    try {
      const data = await this.callProjectApi(
        '/api/projects/rename',
        { path: projectPath, newName: newName.trim() },
        'Failed to rename project'
      );
      if (this.pinnedProjects.has(projectPath)) {
        this.pinnedProjects.delete(projectPath);
        this.pinnedProjects.add(data.newPath);
        this.persistPinnedProjects();
      }
      this.menuProjectPath = null;
      this.openProjectPath = null;
      await this.load();
    } catch (error) {
      this.menuProjectPath = null;
      this.openProjectPath = null;
      this.render();
      window.alert(error?.message || String(error));
    }
  }

  async archiveChats(projectPath) {
    const projectName = this.projects.find((p) => p.path === projectPath)?.name || projectPath;
    const confirmed = window.confirm(
      `Archive all chats for "${projectName}"?\n\nChats will be moved to ~/.pi/agent/sessions-archive and removed from the sidebar.`
    );
    if (!confirmed) {
      this.menuProjectPath = null;
      this.openProjectPath = null;
      this.render();
      return;
    }

    try {
      await this.callProjectApi(
        '/api/projects/archive-chats',
        { path: projectPath },
        'Failed to archive chats'
      );
      this.menuProjectPath = null;
      this.openProjectPath = null;
      await this.load();
    } catch (error) {
      this.menuProjectPath = null;
      this.openProjectPath = null;
      this.render();
      window.alert(error?.message || String(error));
    }
  }

  async archiveWorkspace(projectPath) {
    const projectName = this.projects.find((p) => p.path === projectPath)?.name || projectPath;
    const confirmed = window.confirm(
      `Archive workspace "${projectName}"?\n\nThis will move:\n- The workspace folder to projects archive\n- Its Pi session history to ~/.pi/agent/sessions-archive`
    );
    if (!confirmed) {
      this.menuProjectPath = null;
      this.openProjectPath = null;
      this.render();
      return;
    }

    try {
      await this.callProjectApi(
        '/api/projects/archive-workspace',
        { path: projectPath },
        'Failed to archive workspace'
      );
      this.pinnedProjects.delete(projectPath);
      this.persistPinnedProjects();
      this.menuProjectPath = null;
      this.openProjectPath = null;
      await this.load();
    } catch (error) {
      this.menuProjectPath = null;
      this.openProjectPath = null;
      this.render();
      window.alert(error?.message || String(error));
    }
  }

  escHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  escAttr(s) {
    return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  }
}
