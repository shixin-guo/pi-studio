function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatUsd(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function formatInt(value) {
  return Number(value || 0).toLocaleString();
}

function formatCompact(value) {
  return new Intl.NumberFormat(undefined, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(Number(value || 0));
}

function formatHourLabel(hour) {
  if (!Number.isFinite(hour)) return "N/A";
  const suffix = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;
  return `${hour12} ${suffix}`;
}

function renderEmpty(target, message = "No data in selected range.") {
  target.innerHTML = `<div class="empty">${escapeHtml(message)}</div>`;
}

function buildStatCard(title, value, tone, extraClass = "") {
  return `
    <article class="infobar-stat-card infobar-card-tone-${tone} ${extraClass}">
      <div class="infobar-stat-title">${escapeHtml(title)}</div>
      <div class="infobar-stat-value">${escapeHtml(value)}</div>
    </article>
  `;
}

function buildRankRows(rows, subtitleBuilder) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return '<div class="empty">No data in selected range.</div>';
  }
  return rows
    .map(
      (row, index) => `
        <div class="infobar-rank-row">
          <div class="infobar-rank-head">
            <div class="infobar-rank-title-group">
              <span class="infobar-rank-index">${index + 1}</span>
              <div>
                <div class="infobar-rank-title">${escapeHtml(row.name || "unknown")}</div>
                <div class="infobar-rank-subtitle">${escapeHtml(subtitleBuilder(row))}</div>
              </div>
            </div>
            <div class="infobar-rank-value">${formatUsd(row.cost)}</div>
          </div>
        </div>
      `,
    )
    .join("");
}

export function renderInfobarOverview(target, overview = {}, usage = {}) {
  const stats = [
    ["Sessions", formatInt(overview.sessions), "blue", ""],
    ["Messages", formatInt(overview.messages), "violet", ""],
    ["Total tokens", formatCompact(overview.totalTokens), "teal", ""],
    ["Active days", formatInt(overview.activeDays), "amber", ""],
    ["Current streak", `${formatInt(overview.currentStreak)}d`, "blue", ""],
    ["Longest streak", `${formatInt(overview.longestStreak)}d`, "violet", ""],
    ["Peak hour", overview.peakHour || "N/A", "amber", "infobar-stat-card-compact"],
    ["Input", formatCompact(usage.inputTokens), "teal", ""],
    ["Output", formatCompact(usage.outputTokens), "green", ""],
    ["Cache Read", formatCompact(usage.cacheRead), "amber", ""],
    ["Cache Write", formatCompact(usage.cacheWrite), "violet", ""],
    ["Tool Calls", formatInt(usage.toolCalls), "rose", ""],
  ];
  target.innerHTML = stats
    .map(([title, value, tone, extraClass]) => buildStatCard(title, value, tone, extraClass))
    .join("");
}

export function renderInfobarModels(target, rows = [], payload = {}) {
  if (!Array.isArray(rows) || rows.length === 0) {
    renderEmpty(target);
    return;
  }
  const modelSummary = buildModelSummary(rows, payload);
  target.innerHTML = `
    <div class="infobar-models-card">
      <div class="infobar-models-chart-wrap">
        <canvas class="infobar-models-chart" width="960" height="320"></canvas>
      </div>
      <div class="infobar-models-legend">
        ${modelSummary.models
          .map((model, index) => {
            const percent = Math.round((model.fraction || 0) * 1000) / 10;
            return `
              <div class="infobar-model-legend-row">
                <div class="infobar-model-legend-main">
                  <span class="infobar-tool-legend-dot infobar-model-color-${index + 1}"></span>
                  <span class="infobar-model-legend-name">${escapeHtml(model.name)}</span>
                </div>
                <div class="infobar-model-legend-meta">
                  <span>${formatCompact(model.inputTokens)} in · ${formatCompact(model.outputTokens)} out</span>
                  <span>${percent}%</span>
                </div>
              </div>
            `;
          })
          .join("")}
      </div>
    </div>
  `;
  renderModelsChart(target.querySelector(".infobar-models-chart"), modelSummary);
}

export function renderInfobarProjects(target, rows = []) {
  if (!Array.isArray(rows) || rows.length === 0) {
    renderEmpty(target);
    return;
  }
  target.innerHTML = `
    <div class="infobar-projects-card">
      <div class="infobar-projects-chart-wrap">
        <canvas class="infobar-projects-chart" width="960" height="360"></canvas>
      </div>
    </div>
  `;
  renderProjectsChart(target.querySelector(".infobar-projects-chart"), rows.slice(0, 8));
}

export function renderInfobarUsage(target, usage = {}) {
  const summaryCards = [
    ["Total Tokens", formatCompact(usage.totalTokens), "blue"],
    ["Input", formatCompact(usage.inputTokens), "teal"],
    ["Output", formatCompact(usage.outputTokens), "green"],
    ["Cache Read", formatCompact(usage.cacheRead), "amber"],
    ["Cache Write", formatCompact(usage.cacheWrite), "violet"],
    ["Tool Calls", formatInt(usage.toolCalls), "rose"],
  ];

  target.innerHTML = `
    <div class="infobar-usage-grid">
      ${summaryCards.map(([title, value, tone]) => buildStatCard(title, value, tone)).join("")}
    </div>
  `;
}

export function renderInfobarToolCost(target, usage = {}, metaTarget = null) {
  const tools = Array.isArray(usage.tools) ? usage.tools : [];
  if (metaTarget) {
    metaTarget.textContent = `${formatInt(tools.length)} tracked`;
  }
  target.innerHTML = `
    <div class="infobar-tool-cost-card">
      ${
        tools.length > 0
          ? `
        <div class="infobar-tool-chart-layout">
          <div class="infobar-tool-chart-wrap">
            <canvas class="infobar-tool-chart" width="240" height="240"></canvas>
          </div>
          <div class="infobar-tool-legend">
            ${tools
              .slice(0, 6)
              .map((row, index) => {
                const percent = Math.round((row.fraction || 0) * 100);
                return `
                  <div class="infobar-tool-legend-row">
                    <div class="infobar-tool-legend-main">
                      <span class="infobar-tool-legend-dot" data-tool-color="${index}"></span>
                      <div>
                        <div class="infobar-tool-legend-title">${escapeHtml(row.name || "unknown")}</div>
                        <div class="infobar-tool-legend-subtitle">${formatInt(row.count)} sessions</div>
                      </div>
                    </div>
                    <div class="infobar-tool-legend-values">
                      <span>${formatUsd(row.cost)}</span>
                      <span>${percent}%</span>
                    </div>
                  </div>
                `;
              })
              .join("")}
          </div>
        </div>
      `
          : '<div class="empty">No tool usage in selected range.</div>'
      }
    </div>
  `;

  if (tools.length > 0) {
    renderToolCostChart(target.querySelector(".infobar-tool-chart"), tools.slice(0, 6));
  }
}

function getCssVar(name, fallback) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function buildSessionCard(session) {
  return `
    <article class="infobar-session-card">
      <div class="infobar-session-head">
        <div class="infobar-session-title">${escapeHtml(session.title || "Untitled")}</div>
        <div class="infobar-session-cost">${formatUsd(session.totalCost)}</div>
      </div>
      <div class="infobar-session-meta">
        <span>${escapeHtml(session.model || "unknown")}</span>
        <span>${formatCompact(session.totalTokens)} tokens</span>
        <span>${formatInt(session.toolCalls)} tools</span>
      </div>
      <div class="infobar-session-workspace">${escapeHtml(session.workspace || "")}</div>
    </article>
  `;
}

function renderSessionsPanel(target, sessions = []) {
  if (!Array.isArray(sessions) || sessions.length === 0) {
    renderEmpty(target, "No recent sessions in selected range.");
    return;
  }
  target.innerHTML = `
    <div class="infobar-session-list">
      ${sessions.map(buildSessionCard).join("")}
    </div>
  `;
}

function formatRangeLabel(range = "30d") {
  if (range === "7d") return "7d";
  if (range === "90d") return "90d";
  return "30d";
}

function formatScopeLabel(scope = "all") {
  return scope === "current" ? "Current Project" : "All Projects";
}

function deriveOverviewMetrics(payload, overview) {
  const sessions = Array.isArray(payload.sessions) ? payload.sessions : [];
  const dayCounts = new Map();
  const hourCounts = new Map();
  const modelCounts = new Map();

  for (const session of sessions) {
    const time = new Date(session.time);
    if (!Number.isFinite(time.getTime())) continue;
    const dayKey = time.toISOString().slice(0, 10);
    dayCounts.set(dayKey, (dayCounts.get(dayKey) || 0) + 1);
    hourCounts.set(time.getHours(), (hourCounts.get(time.getHours()) || 0) + 1);
    if (session.model) {
      modelCounts.set(session.model, (modelCounts.get(session.model) || 0) + 1);
    }
  }

  const sortedDays = Array.from(dayCounts.keys()).sort();
  let longestStreak = 0;
  let currentStreak = 0;
  let streak = 0;
  let previousDate = null;

  for (const key of sortedDays) {
    const currentDate = new Date(`${key}T00:00:00`);
    if (previousDate) {
      const diffDays = Math.round((currentDate - previousDate) / 86400000);
      streak = diffDays === 1 ? streak + 1 : 1;
    } else {
      streak = 1;
    }
    longestStreak = Math.max(longestStreak, streak);
    previousDate = currentDate;
  }

  if (sortedDays.length > 0) {
    const todayKey = new Date().toISOString().slice(0, 10);
    let cursor = new Date(`${todayKey}T00:00:00`);
    while (dayCounts.has(cursor.toISOString().slice(0, 10))) {
      currentStreak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
  }

  const peakHourEntry =
    Array.from(hourCounts.entries()).sort((a, b) => b[1] - a[1] || a[0] - b[0])[0] || null;
  const favoriteModelEntry =
    Array.from(modelCounts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] ||
    null;

  return {
    sessions: overview.sessionCount || sessions.length,
    messages: overview.messageCount || 0,
    totalTokens: payload.summary?.totalTokens || 0,
    activeDays: overview.daysActive || sortedDays.length,
    currentStreak,
    longestStreak,
    peakHour: peakHourEntry ? formatHourLabel(peakHourEntry[0]) : "N/A",
    favoriteModel: favoriteModelEntry?.[0] || "N/A",
  };
}

function buildActivityDays(payload) {
  const from = payload.range?.from ? new Date(payload.range.from) : null;
  const to = payload.range?.to ? new Date(payload.range.to) : null;
  const sessions = Array.isArray(payload.sessions) ? payload.sessions : [];
  const intensityByDay = new Map();

  for (const session of sessions) {
    const time = new Date(session.time);
    if (!Number.isFinite(time.getTime())) continue;
    const key = time.toISOString().slice(0, 10);
    intensityByDay.set(key, (intensityByDay.get(key) || 0) + Number(session.totalTokens || 0));
  }

  if (!from || !to || !Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime())) {
    return [];
  }

  const days = [];
  const cursor = new Date(from);
  cursor.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(0, 0, 0, 0);
  while (cursor <= end) {
    const key = cursor.toISOString().slice(0, 10);
    days.push({ key, value: intensityByDay.get(key) || 0 });
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

function renderActivityPanel(target, payload) {
  const days = buildActivityDays(payload);
  if (days.length === 0) {
    renderEmpty(target);
    return;
  }
  const max = Math.max(...days.map((day) => day.value), 0);
  const weekColumns = Math.max(1, Math.ceil(days.length / 7));
  target.innerHTML = `
    <div class="infobar-activity-grid" style="--activity-columns:${weekColumns}">
      ${days
        .map((day) => {
          let level = 0;
          if (max > 0) {
            const ratio = day.value / max;
            if (ratio >= 0.75) level = 4;
            else if (ratio >= 0.5) level = 3;
            else if (ratio >= 0.25) level = 2;
            else if (ratio > 0) level = 1;
          }
          return `<div class="infobar-activity-cell level-${level}" title="${day.key} · ${formatCompact(day.value)} tokens"></div>`;
        })
        .join("")}
    </div>
  `;
}

function renderOverviewNote(target, totalTokens) {
  const warAndPeaceTokens = 587000;
  const ratio = Math.max(1, Math.round(Number(totalTokens || 0) / warAndPeaceTokens));
  target.textContent = `You've used ~${ratio}x more tokens than War and Peace.`;
}

function buildModelSummary(rows, payload) {
  const sessions = Array.isArray(payload.sessions) ? payload.sessions : [];
  const topModels = rows.slice(0, 3).map((row) => ({
    name: row.name || "unknown",
    fraction: Number(row.fraction || 0),
    inputTokens: 0,
    outputTokens: 0,
  }));
  const modelNames = new Set(topModels.map((model) => model.name));
  const byDay = new Map();

  for (const session of sessions) {
    const modelName = session.model || "unknown";
    if (!modelNames.has(modelName)) continue;
    const time = new Date(session.time);
    if (!Number.isFinite(time.getTime())) continue;
    const dayKey = time.toISOString().slice(0, 10);
    let day = byDay.get(dayKey);
    if (!day) {
      day = Object.create(null);
      byDay.set(dayKey, day);
    }
    day[modelName] = (day[modelName] || 0) + Number(session.totalTokens || 0);
    const summary = topModels.find((model) => model.name === modelName);
    if (summary) {
      summary.inputTokens += Number(session.inputTokens || 0);
      summary.outputTokens += Number(session.outputTokens || 0);
    }
  }

  const labels = Array.from(byDay.keys()).sort();
  return {
    labels,
    models: topModels,
    series: topModels.map((model) => ({
      name: model.name,
      data: labels.map((label) => Number(byDay.get(label)?.[model.name] || 0)),
    })),
  };
}

function getModelChartPalette() {
  return ["#4f8ff7", "#67c587", "#f3a64f"];
}

function getStackSegmentRadius(seriesList, datasetIndex, dataIndex) {
  const activeIndices = seriesList
    .map((series, index) => ({ index, value: Number(series.data?.[dataIndex] || 0) }))
    .filter((entry) => entry.value > 0)
    .map((entry) => entry.index);

  if (activeIndices.length === 0 || !activeIndices.includes(datasetIndex)) {
    return 0;
  }

  const first = activeIndices[0];
  const last = activeIndices[activeIndices.length - 1];

  if (first === last) {
    return { topLeft: 6, topRight: 6, bottomLeft: 6, bottomRight: 6 };
  }

  if (datasetIndex === first) {
    return { topLeft: 0, topRight: 0, bottomLeft: 6, bottomRight: 6 };
  }

  if (datasetIndex === last) {
    return { topLeft: 6, topRight: 6, bottomLeft: 0, bottomRight: 0 };
  }

  return 0;
}

function renderModelsChart(canvas, modelSummary) {
  if (!canvas || !modelSummary) return;
  const colors = getModelChartPalette();
  if (typeof window.Chart === "function") {
    const previous = canvas._modelsChart;
    if (previous && typeof previous.destroy === "function") {
      previous.destroy();
    }
    canvas._modelsChart = new window.Chart(canvas, {
      type: "bar",
      data: {
        labels: modelSummary.labels,
        datasets: modelSummary.series.map((series, index) => ({
          label: series.name,
          data: series.data,
          backgroundColor: colors[index] || colors[colors.length - 1],
          borderRadius(context) {
            return getStackSegmentRadius(modelSummary.series, index, context.dataIndex);
          },
          borderSkipped: false,
          maxBarThickness: 30,
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false,
          },
          tooltip: {
            callbacks: {
              label(context) {
                return `${context.dataset.label}: ${formatCompact(context.raw)} tokens`;
              },
            },
          },
        },
        scales: {
          x: {
            stacked: true,
            grid: {
              display: false,
            },
            border: {
              display: false,
            },
            ticks: {
              color: "#8f959e",
              maxRotation: 0,
              autoSkip: true,
              maxTicksLimit: 8,
            },
          },
          y: {
            stacked: true,
            grid: {
              color: "rgba(255,255,255,0.08)",
            },
            border: {
              display: false,
            },
            ticks: {
              color: "#8f959e",
              callback(value) {
                return formatCompact(value);
              },
            },
          },
        },
      },
    });
    return;
  }

  canvas.replaceWith(
    Object.assign(document.createElement("div"), {
      className: "empty",
      textContent: "Chart unavailable in this environment.",
    }),
  );
}

function getToolChartPalette() {
  return ["#4f8ff7", "#67c587", "#f3a64f", "#8c7cf7", "#ef6b73", "#4fc3d9"];
}

function renderProjectsChart(canvas, rows) {
  if (!canvas || !Array.isArray(rows) || rows.length === 0) return;
  if (typeof window.Chart === "function") {
    const previous = canvas._projectsChart;
    if (previous && typeof previous.destroy === "function") {
      previous.destroy();
    }
    canvas._projectsChart = new window.Chart(canvas, {
      type: "bar",
      data: {
        labels: rows.map((row) => row.name || "unknown"),
        datasets: [
          {
            data: rows.map((row) => Number(row.cost || 0)),
            backgroundColor: "#4f8ff7",
            borderRadius: 8,
            borderSkipped: false,
            barThickness: 14,
          },
        ],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false,
          },
          tooltip: {
            callbacks: {
              label(context) {
                return `${formatUsd(context.raw)}`;
              },
            },
          },
        },
        scales: {
          x: {
            grid: {
              color: "rgba(255,255,255,0.08)",
            },
            border: {
              display: false,
            },
            ticks: {
              color: "#8f959e",
              callback(value) {
                return formatUsd(value);
              },
            },
          },
          y: {
            grid: {
              display: false,
            },
            border: {
              display: false,
            },
            ticks: {
              color: "#8f959e",
            },
          },
        },
      },
    });
    return;
  }

  canvas.replaceWith(
    Object.assign(document.createElement("div"), {
      className: "empty",
      textContent: "Chart unavailable in this environment.",
    }),
  );
}

function renderToolCostChart(canvas, tools) {
  if (!canvas || !Array.isArray(tools) || tools.length === 0) return;
  const labels = tools.map((tool) => tool.name || "unknown");
  const data = tools.map((tool) => Number(tool.cost || 0));
  const colors = getToolChartPalette().slice(0, tools.length);

  if (typeof window.Chart === "function") {
    const previous = canvas._toolCostChart;
    if (previous && typeof previous.destroy === "function") {
      previous.destroy();
    }
    canvas._toolCostChart = new window.Chart(canvas, {
      type: "doughnut",
      data: {
        labels,
        datasets: [
          {
            data,
            backgroundColor: colors,
            borderWidth: 0,
            hoverOffset: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "62%",
        plugins: {
          legend: {
            display: false,
          },
          tooltip: {
            callbacks: {
              label(context) {
                return `${context.label}: ${formatUsd(context.raw)}`;
              },
            },
          },
        },
      },
    });
    return;
  }

  const total = data.reduce((sum, value) => sum + value, 0);
  const conicStops = data.reduce(
    (parts, value, index) => {
      const start = parts.offset;
      const end = total > 0 ? start + (value / total) * 360 : start;
      parts.values.push(`${colors[index]} ${start}deg ${end}deg`);
      parts.offset = end;
      return parts;
    },
    { values: [], offset: 0 },
  );

  canvas.replaceWith(
    Object.assign(document.createElement("div"), {
      className: "infobar-tool-chart-fallback",
      style: `background: conic-gradient(${conicStops.values.join(", ")});`,
    }),
  );
}

export function renderCostInfobar(section, payload = {}) {
  if (!section) return;
  const overviewEl = section.querySelector("#infobar-overview-grid");
  const activityEl = section.querySelector("#infobar-activity-panel");
  const overviewNoteEl = section.querySelector("#infobar-overview-note");
  const modelsEl = section.querySelector("#infobar-models-list");
  const toolCostEl = section.querySelector("#infobar-tool-cost-panel");
  const toolCostMetaEl = section.querySelector("#infobar-tool-cost-meta");
  const projectsEl = section.querySelector("#infobar-projects-list");
  const sessionsEl = section.querySelector("#infobar-sessions-panel");
  const metaEl = section.querySelector("#infobar-range-meta");
  const titleEl = section.querySelector("#infobar-page-title");

  if (
    !overviewEl ||
    !activityEl ||
    !overviewNoteEl ||
    !modelsEl ||
    !toolCostEl ||
    !projectsEl ||
    !sessionsEl ||
    !metaEl
  ) {
    return;
  }

  const infobar = payload.infobar || payload || {};
  const overview = infobar.overview || {};
  const hasData = Number(overview.sessionCount || 0) > 0;
  if (titleEl) {
    titleEl.textContent = "Pi Stats";
  }
  if (!hasData) {
    renderEmpty(overviewEl);
    renderEmpty(activityEl);
    overviewNoteEl.textContent = "";
    renderEmpty(modelsEl);
    renderEmpty(toolCostEl);
    renderEmpty(projectsEl);
    renderEmpty(sessionsEl);
    metaEl.textContent = "No data";
    if (toolCostMetaEl) toolCostMetaEl.textContent = "0 tracked";
    return;
  }

  const rangeLabel = formatRangeLabel(payload.range?.range);
  const scopeLabel = formatScopeLabel(payload.range?.scope);
  const overviewMetrics = deriveOverviewMetrics(payload, overview);
  metaEl.textContent = `${rangeLabel} · ${scopeLabel} · ${formatInt(overview.sessionCount)} sessions`;
  renderInfobarOverview(overviewEl, overviewMetrics, infobar.usage || {});
  renderActivityPanel(activityEl, payload);
  renderOverviewNote(overviewNoteEl, overviewMetrics.totalTokens);
  renderInfobarModels(modelsEl, infobar.models || [], payload);
  renderInfobarToolCost(toolCostEl, infobar.usage || {}, toolCostMetaEl);
  renderInfobarProjects(projectsEl, infobar.projects || []);
  renderSessionsPanel(sessionsEl, payload.sessions || payload.topSessions || []);
}
