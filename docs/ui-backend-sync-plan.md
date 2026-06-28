# UI ↔ Backend Synchronization Plan

## Purpose

This document identifies gaps between the rebuilt UI dashboards and the backend API, then provides a prioritized action plan to achieve full functional synchronization — ensuring every button, slider, and data widget in the frontend correctly communicates with the appropriate backend endpoint.

---

## Current State Summary

- **Backend:** Hono server on port 3743. 12 route files. 10 DB tables. All §1.2–§3.4 implementation phases shipped and tested (165 tests passing).
- **Frontend:** 8 dashboard views rebuilt using shared `AppShell` architecture with top nav + hideable left/right bars. Each module has Dashboard View (project-scoped) + Set-up View (global).
- **Phase:** 13 (Free-tier LLM testing). Beta-stable.

---

## Gap Analysis: What Each Dashboard Calls vs. What the Backend Provides

### 1. CoreExec Dashboard

| UI Action | Endpoint Called | Backend Status | Gap? |
|-----------|---------------|----------------|------|
| Fetch workflow runs | `GET /api/basevault/runs` | ✅ Exists | No |
| Fetch run tasks (polling) | `GET /api/coreexec/run/:runId/status` | ✅ Exists | No |
| Save max_iterations to settings | `POST /api/system/settings` | ✅ Exists | No |
| Save auto_requeue toggle | `POST /api/system/settings` | ✅ Exists | No |
| AutonomyDials (budget/autonomy) | `GET/POST /api/system/settings` | ✅ Exists | No |
| NotificationCenter (os_todos) | `GET /api/todos` | ✅ Exists | No |
| Resolve todo | `POST /api/todos/resolve` | ✅ Exists | No |
| CronSummary | `GET /api/scheduler/jobs` | ✅ Exists | No |

**Verdict:** ✅ Fully synced.

---

### 2. BaseVault Dashboard

| UI Action | Endpoint Called | Backend Status | Gap? |
|-----------|---------------|----------------|------|
| Fetch workflow runs (SQLite Explorer) | `GET /api/basevault/runs` | ✅ Exists | No |
| Backup via SSE | `GET /api/system/backup` | ✅ Exists | No |
| Restore via file upload | `POST /api/system/restore` | ✅ Exists | No |
| Save redaction_level | `POST /api/system/settings` | ✅ Exists | No |
| Save retention limits | `POST /api/system/settings` | ✅ Exists | No |
| Schema migration trigger | None (simulated locally) | ⚠️ No backend endpoint | **GAP: No `/api/system/migrate` endpoint** |
| Data Sanitization Monitor (live log) | None | ⚠️ No backend feed | **GAP: Redaction events not streamed** |
| Retention/Pruning stats | None | ⚠️ No backend endpoint | **GAP: No prune stats endpoint** |

**Verdict:** ⚠️ 3 gaps. Core backup/restore/settings work. Migration and redaction monitoring are presentational only.

---

### 3. RouteSwitch Dashboard

| UI Action | Endpoint Called | Backend Status | Gap? |
|-----------|---------------|----------------|------|
| Fetch LLM config | `GET /api/llm/config` | ✅ Exists | No |
| Fetch 24h usage (polling) | `GET /api/llm/usage` | ✅ Exists | No |
| Save provider config | `POST /api/llm/config` | ✅ Exists | No |
| Save governor limits (daily ceiling) | `POST /api/system/settings` | ✅ Exists | No |
| "Inject Mock Request" test | `POST /api/routeswitch/test` | ✅ Exists | No |
| Quick-fix: "Switch to Local Mock" | `POST /api/routeswitch/provider` | ✅ Exists | No |
| Quick-fix: "Clear Provider Error" | None | ⚠️ No backend endpoint | **GAP: No error-clear endpoint** |
| MCP connection management | None | ⚠️ No backend endpoint | **GAP: No `/api/mcp` CRUD** |
| Routing priority drag-and-drop save | `POST /api/system/settings` | ✅ (can store as JSON) | No |

**Verdict:** ⚠️ 2 gaps. Core routing and config work. MCP management and error-clear are UI-only stubs.

---

### 4. ScopeLogic Dashboard

| UI Action | Endpoint Called | Backend Status | Gap? |
|-----------|---------------|----------------|------|
| Load interview history | `GET /api/scopelogic/history` | ✅ Exists | No |
| Send interview message | `POST /api/scopelogic/prompt` | ✅ Exists | No |
| Reset interview | `POST /api/scopelogic/reset` | ✅ Exists | No |
| "Approve & Send to CoreExec" | `POST /api/coreexec/approve` | ✅ Exists | **Not wired — button present but no onClick to approve route** |
| Save grammar/consensus settings | `POST /api/system/settings` | ✅ Exists | No |

**Verdict:** ⚠️ 1 gap. The Approve button in the Draft Proposal Quarantine needs to POST the proposal to `/api/coreexec/approve`.

---

### 5. PortGrid Dashboard

| UI Action | Endpoint Called | Backend Status | Gap? |
|-----------|---------------|----------------|------|
| Fetch approval queue (os_todos) | `GET /api/todos` | ✅ Exists | No |
| Approve todo | `POST /api/todos/resolve` | ✅ Exists | No |
| Interactive DAG Canvas (@xyflow) | `GET /api/basevault/runs` for data | ✅ Exists | **GAP: Canvas is placeholder — not rendering real DAG data** |
| Tool Registry management | None | ⚠️ No `/api/tools` endpoint | **GAP: No tool CRUD backend** |
| Agent-Tool Permissions save | None | ⚠️ No endpoint | **GAP: No permissions backend** |
| Save sandbox/a11y settings | `POST /api/system/settings` | ✅ Exists | No |
| Active Tool Telemetry feed | None | ⚠️ No live tool call stream | **GAP: Presentational only** |

**Verdict:** ⚠️ 4 gaps. HITL approval works. DAG canvas is placeholder. Tool registry/permissions are UI-only.

---

### 6. ScoutDaemon Dashboard

| UI Action | Endpoint Called | Backend Status | Gap? |
|-----------|---------------|----------------|------|
| Live system metrics (SSE) | `GET /api/system/metrics` | ✅ Exists | No |
| Fetch os_todos | `GET /api/todos` | ✅ Exists | No |
| Fetch learning approvals (discoveries) | `GET /api/cerebro/learning-approvals` | ✅ Exists | No |
| Save AgentStop/sensing/idle settings | `POST /api/system/settings` | ✅ Exists | No |
| Kill Switch (terminate daemon) | None | ⚠️ No SIGKILL endpoint | **GAP: No daemon termination API** |
| "Send to PortGrid" button | None | ⚠️ No transfer mechanism | **GAP: No approval promotion endpoint** |
| "Force SSE Ping" | `POST /api/scout/heartbeat` | ✅ Exists | **Not wired — button has no onClick** |

**Verdict:** ⚠️ 3 gaps. Metrics and discovery fetching work. Kill switch, PortGrid transfer, and SSE ping button need wiring.

---

### 7. Cerebro Dashboard

| UI Action | Endpoint Called | Backend Status | Gap? |
|-----------|---------------|----------------|------|
| Fetch learning approvals | `GET /api/cerebro/learning-approvals` | ✅ Exists | No |
| Approve/reject learning | `POST /api/cerebro/learning-approvals/:id/approve\|reject` | ✅ Exists | No |
| Vector search | `POST /api/cerebro/vector-search` | ✅ Exists | No |
| Fetch health | `GET /api/cerebro/health` | ✅ Exists | No |
| Trigger consolidation sweep | `POST /api/cerebro/habituate` | ✅ Exists | No |
| Save retrieval/habituation settings | `POST /api/system/settings` | ✅ Exists | No |
| "Pin All High-Confidence" | None | ⚠️ No pin endpoint | **GAP: No memory pinning API** |

**Verdict:** ⚠️ 1 small gap. Core memory operations work. Pinning is UI-only.

---

### 8. System View (Unified Master Dashboard)

| UI Action | Endpoint Called | Backend Status | Gap? |
|-----------|---------------|----------------|------|
| Live KPI (SSE) | `GET /api/system/metrics` | ✅ Exists | No |
| Fetch 24h usage | `GET /api/llm/usage` | ✅ Exists | No |
| Fetch cerebro health | `GET /api/cerebro/health` | ✅ Exists | No |
| NotificationCenter (os_todos) | `GET /api/todos` | ✅ Exists | No |
| CronSummary | `GET /api/scheduler/jobs` | ✅ Exists | No |
| Trigger memory sweep | `POST /api/cerebro/habituate` | ✅ Exists | No |
| Save global settings | `POST /api/system/settings` | ✅ Exists | No |
| Theme toggle | `useTheme()` (local state) | ✅ (Client-side) | No |

**Verdict:** ✅ Fully synced.

---

## Priority Action Plan

### P0 — Critical (Backend exists but UI not wired)

| # | Module | Issue | Fix |
|---|--------|-------|-----|
| 1 | ScopeLogic | "Approve & Send to CoreExec" button has no onClick handler | Wire to `POST /api/coreexec/approve` with the proposal payload |
| 2 | ScoutDaemon | "Force SSE Ping" button has no onClick handler | Wire to `POST /api/scout/heartbeat` |

### P1 — Important (UI functional but data is simulated/static)

| # | Module | Issue | Fix |
|---|--------|-------|-----|
| 3 | PortGrid | DAG Canvas is placeholder — doesn't render actual workflow data | Load selected project's runs from `/api/basevault/runs` and render nodes from `dag_layout` JSON |
| 4 | BaseVault | Redaction Monitor shows static log entries | Either stream from a new SSE endpoint or populate from recent Pino log entries |
| 5 | ScoutDaemon | Kill Switch doesn't actually terminate anything | Create `POST /api/system/daemon/kill` endpoint or wire to existing process control |
| 6 | ScoutDaemon | "Send to PortGrid" doesn't promote discoveries | Create a transfer mechanism (e.g., create an os_todo with `required_action_type: 'APPROVE_PROPOSAL'`) |

### P2 — Nice-to-Have (No backend exists — requires new endpoints)

| # | Module | Issue | Required New Endpoint |
|---|--------|-------|-----------------------|
| 7 | BaseVault | Schema migration trigger is simulated | `POST /api/system/migrate` — run `initDB()` idempotently |
| 8 | BaseVault | No prune/retention stats | `GET /api/system/retention-stats` |
| 9 | RouteSwitch | MCP connection management is static | `GET/POST/DELETE /api/mcp/connections` |
| 10 | RouteSwitch | "Clear Provider Error" button is presentational | `POST /api/llm/clear-error` |
| 11 | PortGrid | Tool Registry is hardcoded | `GET/POST/DELETE /api/tools` |
| 12 | PortGrid | Agent permissions matrix is static | `GET/POST /api/agents/:id/tools` |
| 13 | PortGrid | Tool telemetry feed is static | Wire to ScoutDaemon SSE or create `/api/tools/telemetry` |
| 14 | Cerebro | "Pin All High-Confidence" is presentational | `POST /api/cerebro/pin-high-confidence` |

---

## Execution Order

1. **Fix P0 items first** (2 items) — Quick wiring fixes, no backend changes needed.
2. **Fix P1 items** (4 items) — Moderate effort, some require new backend endpoints.
3. **Address P2 items** (8 items) — New endpoint development, can be phased incrementally.

---

## Constraints

- Do NOT combine unrelated scopes in one unit (per ai-workflow-rules.md).
- Do NOT add paid/cloud dependencies.
- All new endpoints must validate input with Zod at boundary.
- All `_working.md` updates are append-only (newest first, under `===`).
- System resource limits apply (sequential execution, NODE_OPTIONS memory cap).
- Human-in-the-loop gate must be preserved — no auto-execution.

---

## Document History

| Date | Author | Change |
|------|--------|--------|
| 2026-06-26 | Kiro | Initial plan created from full documentation + codebase audit |
