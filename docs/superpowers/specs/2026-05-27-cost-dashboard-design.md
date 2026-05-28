# Cost Dashboard Design (Standalone Page)

## Background

Pi Studio currently exposes lightweight cost signals in chat header pills (session cost and token usage), but it lacks a dedicated analysis surface. Users cannot efficiently review historical spending or identify optimization opportunities over time.

This design introduces a standalone `Cost Dashboard` page focused on:

- personal cost review over selectable time ranges
- cost-driver analysis (model/tool/session behavior)
- actionable optimization hints for reducing spend

## Goals

- Let a single user answer "where did my money go?" within 30 seconds.
- Let a single user answer "what should I optimize next?" within 2 minutes.
- Support both short-term analysis (7/30 days) and long-term retrospective (custom range).

## Non-Goals

- Team/org-level cost governance and RBAC.
- Billing-source reconciliation with external invoice systems.
- Real-time budget enforcement (hard stops); this design is analysis-first.

## Primary Persona

- Individual Pi Studio user reviewing their own usage and spend.

## Success Criteria

- User can filter by time range and see coherent updates across KPI cards, trend charts, and session tables.
- User can identify top expensive sessions and drill into reasons.
- User can export filtered cost data for offline review.

## Information Architecture

Route:

- `GET /cost` (standalone dashboard)

Entry points:

- Left navigation adds a `Cost` item beside Chat experience.
- Optional contextual link from header cost pill to deep-link into `/cost`.

Page sections (top to bottom):

1. Sticky filter bar
2. KPI overview cards
3. Time trend panel
4. Cost breakdown panel
5. Top expensive sessions panel
6. Optimization insights panel
7. Detailed sessions table

## Filter Model

Global filters:

- Time range: `7d`, `30d`, `90d`, `custom`
- Time granularity: `day`, `week`, `month`
- Workspace scope: `current workspace`, `all workspaces`
- Model filter: multi-select

Defaults:

- Range: `30d`
- Granularity: `day`
- Scope: `current workspace`
- Model filter: all

Persistence:

- Store last-used filters in local storage and restore on dashboard open.

## KPI Definitions (Canonical)

- `Total Cost`: all assistant response costs in selected range (+ tool-specific costs if available).
- `Total Tokens`: aggregate input + output tokens in range.
- `Avg Cost / Session`: `Total Cost / session_count`.
- `Avg Cost / User Message`: `Total Cost / user_message_count`.
- `Token Efficiency`: `output_tokens / total_cost` (higher is better, used as heuristic only).
- `Tool Cost Share`: if direct tool pricing exists, ratio of tool cost to total; otherwise proxy with "responses containing tool calls".

## Panels and Interactions

### 1) Sticky Filter Bar

- Any filter update refreshes all panels.
- `Reset` button returns defaults.
- `Export CSV` exports currently filtered rows.

### 2) KPI Cards

- Display current-period values plus comparison to previous equal-length period.
- Delta styling:
  - Cost increase: warning color
  - Cost decrease with stable output: positive color

### 3) Time Trend Panel

- Primary series: cost over time.
- Optional toggle to switch secondary chart to token trend.
- Clicking a data point filters session table to the selected bucket.

### 4) Cost Breakdown Panel

Breakdowns:

- by model
- by tool usage
- by message type (`input`, `output`, `tool-related`)

Chart style:

- stacked bars or donut + table summary for readability.

### 5) Top Expensive Sessions Panel

- Ranked list by total cost in current filter range.
- Each row: session title, model, token total, cost, last active time.
- Click opens a side detail sheet with cost composition and shortcut to open session.

### 6) Optimization Insights Panel

System generates 3-5 suggestions from simple heuristics.

Example heuristics:

- A model contributes >60% of total cost.
- `Avg Cost / User Message` rises for 3 consecutive buckets.
- One session category repeatedly produces high input-token overhead.

Each suggestion includes:

- observation
- suggested change
- rough expected impact range

### 7) Detailed Sessions Table

Columns:

- time
- session title
- workspace
- model
- total cost
- input tokens
- output tokens
- tool calls
- cost per user message

Features:

- sortable columns
- pagination
- CSV export matches visible/filtered rows

## State Design

Loading state:

- skeleton cards and chart placeholders.

Empty state:

- clear onboarding text and CTA to start chats.

Error state:

- non-blocking top error banner + retry action.

## Data Contract (Frontend-Oriented)

Expected aggregate payload shape (example):

```json
{
  "range": { "from": "2026-04-27", "to": "2026-05-27", "granularity": "day" },
  "summary": {
    "totalCost": 12.34,
    "totalTokens": 456789,
    "sessionCount": 42,
    "userMessageCount": 320
  },
  "series": [{ "bucket": "2026-05-01", "cost": 0.56, "tokens": 18342 }],
  "breakdown": {
    "byModel": [{ "name": "model-a", "cost": 6.12 }],
    "byTool": [{ "name": "read_file", "cost": 1.02 }]
  },
  "sessions": []
}
```

Note: backend can evolve independently; frontend should normalize and guard missing fields.

## Delivery Plan

### Phase 1 (MVP)

- `/cost` route and page shell
- filter bar + KPI cards + cost trend
- top expensive sessions
- detailed sessions table + CSV export

### Phase 2

- automated optimization insights
- anomaly tagging and richer breakdown interactions
- improved per-session drilldown

## Risks and Mitigations

- Inconsistent historical usage data across sessions
  - Mitigation: normalize missing token/cost fields and visibly mark partial data.
- Overly noisy "optimization" recommendations
  - Mitigation: start with conservative, explainable rules and show evidence with each tip.
- Performance on large history ranges
  - Mitigation: aggregate server-side and paginate detail table.

## Open Questions

- Whether "all workspace" should be default for users with many projects.
- Whether tool-level costs are available directly or need proxy logic.
- Whether to include budget targets in v2.
