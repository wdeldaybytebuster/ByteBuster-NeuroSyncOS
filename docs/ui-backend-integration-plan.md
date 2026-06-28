# UI ↔ Backend Full Integration Plan

**Generated:** 2026-06-26
**Purpose:** Identify every gap between the dashboard UI and the backend API, then provide a task-by-task plan to make all dashboards fully functional with real data from the running backend.

---

## Current Architecture Summary

- **Frontend:** Vite + React + Tailwind CSS 3.4 + @xyflow/react + Lucide icons (port 3742)
- **Backend:** Node.js + Hono + better-sqlite3 + poolifier worker threads (port 3743)
- **Database:** SQLite WAL mode, 10 tables, `system_settings` key-value store for all config
- **Real-time:** SSE via `/api/system/metrics` (CPU, temp, pool) and `/api/scout/events` (task/run status)

---

## Backend API Endpoints (Complete Inventory)

| Endpoint | Method | Status | Notes |
|----------|--------|--------|-------|
| `/api/system/metrics` | GET (SSE) | ✅ Working | CPU utilization, temp, worker pool stats |
| `/api/system/settings` | GET/POST | ✅ Working | Generic key-value store |
| `/api/system/config` | POST | ✅ Working | Sets maxWorkers |
| `/api/system/backup` | GET (SSE) | ✅ Working | Streams backup progress |
| `/api/system/restore` | POST | ✅ Working | Uploads .db file, reboots |
| `/api/projects` | GET/POST | ✅ Working | CRUD for projects |
| `/api/basevault/runs` | GET | ✅ Working | Lists workflow_runs (limit 50) |
| `/api/basevault/run/:runId` | GET | ✅ Working | Run detail + tasks |
| `/api/coreexec/approve` | POST | ✅ Working | Validates + executes a DAG |
| `/api/coreexec/run/:runId/status` | GET | ✅ Working | Run status + task list |
| `/api/coreexec/retry/:runId` | POST | ✅ Working | Re-queues failed tasks |
| `/api/todos` | GET | ✅ Working | Open os_todos |
| `/api/todos/resolve` | POST | ✅ Working | Resolves a todo + unparks task |
| `/api/llm/config` | GET/POST | ✅ Working | Provider config + governor status |
| `/api/llm/usage` | GET | ✅ Working | 24h rolling usage aggregate |
| `/api/cerebro/health` | GET | ✅ Working | Vector count, status, last reflection |
| `/api/cerebro/vector-search` | POST | ✅ Working | Keyword fallback semantic search |
| `/api/cerebro/habituate` | POST | ✅ Working | Triggers reflection cycle |
| `/api/cerebro/learning-approvals` | GET | ✅ Working | Pending approval queue |
| `/api/cerebro/learning-approvals/:id/approve` | POST | ✅ Working | Promotes fact to memory |
| `/api/cerebro/learning-approvals/:id/reject` | POST | ✅ Working | Rejects inference |
| `/api/cerebro/query` | POST | ✅ Working | Raw SQL (admin) |
| `/api/models` | GET | ✅ Working | Available models |
| `/api/scheduler/jobs` | GET | ✅ Working | Cron jobs with next tick |
| `/api/telemetry/metrics` | GET | ✅ Working | Prometheus format |
| `/api/scopelogic/history` | GET | ✅ Working | Interview history |
| `/api/scopelogic/prompt` | POST | ✅ Working | Send interview message |
| `/api/scopelogic/reset` | POST | ✅ Working | Reset session |
| `/api/routeswitch/test` | POST | ✅ Working | Test LLM routing |
| `/api/routeswitch/provider` | POST | ✅ Working | Switch provider type |
| `/api/scout/events` | GET (SSE) | ✅ Working | Task/run status events |

---

## Gap Analysis: UI vs Backend

### 1. BaseVault Dashboard — GAPS

| Widget | Current State | Gap | Fix Required |
|--------|--------------|-----|--------------|
| DB Size (14.8 MB) | Hardcoded | No `/api/basevault/stats` endpoint | Create endpoint that runs `PRAGMA page_count * page_size` |
| Query Latency | Random simulated | No timing endpoint | Measure actual query time server-side |
| Redaction Log | 3 hardcoded strings | No `/api/redaction/log` endpoint | Create endpoint that surfaces recent redaction events from Pino |
| Retention Pruning | All zeros | No pruning history endpoint | Create endpoint or track prune events in a new table |
| Migrations trigger | Simulated 3s delay | No `/api/system/migrate` endpoint | Create endpoint that runs `initDB()` and reports results |
| Project-scoped runs | Ignores `activeProjectId` | `/api/basevault/runs` has no `?project_id=` filter | Add query param to filter by project_id |

### 2. CoreExec Dashboard — GAPS

| Widget | Current State | Gap | Fix Required |
|--------|--------------|-----|--------------|
| Run list | Fetches all runs globally | No project filter | Add `?project_id=` to `/api/basevault/runs` |
| Settings load | Reads `max_iterations` | Works but key may not exist | Pre-seed defaults or handle undefined gracefully ✅ Already handled |
| AutonomyDials | Saves to `/api/system/settings` | Works | None — fully wired ✅ |

### 3. RouteSwitch Dashboard — GAPS

| Widget | Current State | Gap | Fix Required |
|--------|--------------|-----|--------------|
| Provider health status | Derived from config.provider | No per-provider healthcheck endpoint | Add `/api/llm/health` that pings each registered provider |
| Routing alerts | Empty array (never populated) | No alerting endpoint | Create `/api/llm/alerts` or derive from governor state |
| "Switch to Local Mock" button | Not wired | Just UI | Wire to `POST /api/routeswitch/provider {type:'mock'}` |
| "Clear Last Provider Error" | Not wired | No error state endpoint | Add error tracking to governor + clear endpoint |
| MCP connections | Hardcoded list | No `/api/mcp/connections` endpoint | Create endpoint that reports active MCP servers |
| Routing priority order | Static list | Not persisted | Save to `system_settings` + re-read on load |

### 4. ScopeLogic Dashboard — GAPS

| Widget | Current State | Gap | Fix Required |
|--------|--------------|-----|--------------|
| Interview pipeline | ✅ Fully wired | Fetches history, sends prompts, resets | None |
| Proposal quarantine | Shows JSON if `data.proposal` exists | Backend doesn't return `proposal` field | Update ScopeLogicSession to emit proposal object when `isComplete` |
| "Approve & Send to CoreExec" | Button exists but not wired | Missing POST to `/api/coreexec/approve` with proposal | Wire button to call approve endpoint |
| Confidence score | Hardcoded 98.4% | No real confidence endpoint | Derive from council.ts disagreementScore or store in session |
| Grammar/Assertion settings | Save to system_settings | Works | None ✅ |

### 5. PortGrid Dashboard — GAPS

| Widget | Current State | Gap | Fix Required |
|--------|--------------|-----|--------------|
| DAG Canvas | Placeholder | Not connected to @xyflow/react | Load workflow DAG from `/api/basevault/run/:id` + render with ReactFlow |
| Tool Telemetry feed | 3 hardcoded entries | No `/api/portgrid/tool-calls` endpoint | Create endpoint tracking tool invocations |
| Confidence badges | Static array | Not computed from real AF-125 scores | Derive from run metadata once available |
| Tool Registry | Static list | No `/api/tools` endpoint | Create CRUD endpoint for tool management |
| Permissions Matrix | Static HTML | No `/api/agents/:id/tools` endpoint | Create endpoint for agent-tool bindings |
| Sandbox allowlist | Static array | Hardcoded — matches actual CommandSandbox allowlist | Consider reading from backend dynamically |
| Settings save | Saves to system_settings | Works | None ✅ |

### 6. ScoutDaemon Dashboard — GAPS

| Widget | Current State | Gap | Fix Required |
|--------|--------------|-----|--------------|
| SSE telemetry | ✅ Connected to `/api/system/metrics` | Works | None |
| Quarantine discoveries | Uses learning-approvals as proxy | Architecturally correct | None — ScoutDaemon drafts surface here ✅ |
| Kill switch | Toggles local state only | No backend signal | Create `/api/scout/terminate` and `/api/scout/restart` endpoints |
| Hardware telemetry | ✅ Live from SSE | Works | None |
| Settings save | Saves to system_settings | Works | None ✅ |

### 7. Cerebro Dashboard — GAPS

| Widget | Current State | Gap | Fix Required |
|--------|--------------|-----|--------------|
| Learning approvals | ✅ Fully wired | Fetches, approves, rejects | None |
| Memory browser | ✅ Vector search wired | Works | None |
| Health stats | ✅ Fetches /api/cerebro/health | Works | None |
| Habituation trigger | ✅ Calls /api/cerebro/habituate | Works | None |
| Decay/prune counts | "Nearing Decay: 0" hardcoded | No endpoint for at-risk memories | Create `/api/cerebro/decay-stats` |
| Retrieval settings | Save to system_settings | Works | None ✅ |
| Global KB docs | 3 hardcoded filenames | No file listing endpoint | Create `/api/cerebro/global-docs` or scan `.data/global/` |

### 8. System View (Master Dashboard) — GAPS

| Widget | Current State | Gap | Fix Required |
|--------|--------------|-----|--------------|
| KPI Strip | ✅ Live SSE | Workers, CPU, tokens, cost, vectors | None |
| Action Center | ✅ NotificationCenter polls /api/todos | Works | None |
| Cerebro Health | ✅ Polls /api/cerebro/health | Works | None |
| Cron Summary | ✅ Polls /api/scheduler/jobs | Works | None |
| Settings save | ✅ All persist to system_settings | Works | None |

---

## Priority-Ordered Fix Plan

### Phase A: Critical Wiring (Make buttons do real things)

| # | Task | Dashboard | Effort |
|---|------|-----------|--------|
| A1 | Wire "Approve & Send to CoreExec" in ScopeLogic to POST `/api/coreexec/approve` | ScopeLogic | Small |
| A2 | Wire "Switch to Local Mock" button in RouteSwitch to POST `/api/routeswitch/provider` | RouteSwitch | Small |
| A3 | Add `?project_id=` filter to `/api/basevault/runs` backend endpoint | BaseVault, CoreExec | Small |
| A4 | Pass `activeProjectId` in runs fetch calls across dashboards | All | Small |
| A5 | Wire ScoutDaemon kill switch to a real backend endpoint (new `/api/scout/terminate`) | ScoutDaemon | Medium |

### Phase B: Replace Hardcoded Data with Real Endpoints

| # | Task | Dashboard | Effort |
|---|------|-----------|--------|
| B1 | Create `/api/basevault/stats` (db file size via PRAGMA, actual WAL checkpoint count) | BaseVault | Small |
| B2 | Create `/api/llm/alerts` endpoint (surfaces governor state + last provider errors) | RouteSwitch | Medium |
| B3 | Track redaction events in memory/table + expose `/api/redaction/log` | BaseVault | Medium |
| B4 | Update ScopeLogicSession to emit `proposal` JSON when interview completes | ScopeLogic | Medium |
| B5 | Create `/api/cerebro/decay-stats` (count memories nearing retention limit) | Cerebro | Small |
| B6 | Derive real confidence score from council.ts disagreementScore | ScopeLogic | Medium |

### Phase C: New Backend Endpoints for Uncovered Features

| # | Task | Dashboard | Effort |
|---|------|-----------|--------|
| C1 | Create `/api/scout/terminate` + `/api/scout/restart` endpoints | ScoutDaemon | Medium |
| C2 | Create `/api/mcp/connections` to list active MCP servers | RouteSwitch | Medium |
| C3 | Create `/api/tools` CRUD for tool registry | PortGrid | Large |
| C4 | Create `/api/agents/:id/tools` for agent-tool permission bindings | PortGrid | Large |
| C5 | Create `/api/portgrid/tool-calls` to log and surface tool invocations | PortGrid | Medium |
| C6 | Create `/api/system/migrate` for explicit migration trigger | BaseVault | Small |
| C7 | Expose `/api/cerebro/global-docs` to list files in GLOBAL scope | Cerebro | Small |

### Phase D: Enhanced Integration (Polish)

| # | Task | Dashboard | Effort |
|---|------|-----------|--------|
| D1 | Integrate @xyflow/react into PortGrid DAG Canvas with real run data | PortGrid | Large |
| D2 | Compute Verifiable Confidence Badges from real AF-125 scores | PortGrid | Medium |
| D3 | Add real-time tool call logging via SSE to PortGrid telemetry | PortGrid | Medium |
| D4 | Persist routing priority order in system_settings | RouteSwitch | Small |
| D5 | Add retention/pruning event tracking table + expose counts | BaseVault | Medium |
| D6 | Per-provider healthcheck pings for fleet health monitor | RouteSwitch | Medium |

---

## Summary of What's Already Working (No Changes Needed)

- ✅ System View: All 4 widgets fully live (SSE + polling)
- ✅ CoreExec: DAG run monitor + tasks + alerts + cron + all settings
- ✅ Cerebro: Learning approvals + vector search + health + habituate + all settings
- ✅ ScoutDaemon: SSE telemetry + quarantine staging + hardware metrics + all settings
- ✅ ScopeLogic: Full interview pipeline (history/prompt/reset) + all settings
- ✅ RouteSwitch: 24h usage polling + config load/save + grammar toggle
- ✅ BaseVault: Runs list + backup SSE + restore upload + redaction level + retention settings
- ✅ All "Commit Configuration" buttons persist to `/api/system/settings`
- ✅ Sidebar state persists across module navigation
- ✅ Theme toggle (dark/light/system) works globally
- ✅ Project switching works via ProjectSwitcher

---

## Estimated Total Effort

- **Phase A (Critical Wiring):** ~4-6 hours
- **Phase B (Replace Hardcoded):** ~6-8 hours
- **Phase C (New Endpoints):** ~10-14 hours
- **Phase D (Polish):** ~12-16 hours
- **TOTAL:** ~32-44 hours of focused engineering

---

## Recommendation

Start with **Phase A** — it makes the biggest functional difference with minimal effort. Every button that currently does nothing will do something real. Then move to **Phase B** to eliminate the remaining hardcoded placeholder data. Phases C and D can be deferred to a future sprint.
