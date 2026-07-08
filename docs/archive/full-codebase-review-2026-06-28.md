# Full Codebase Review — ByteBuster NeuroSyncOS v1.0

**Date:** 2026-06-28  
**Reviewer:** Kiro (code-only review, no documentation reference)  
**Branch:** looking-back

---

## 1. SYSTEM OVERVIEW — What It Does

NeuroSync Sovereign OS is a **local-first AI workflow orchestration platform** built for hobbyists/freelancers running on modest hardware. It manages the full lifecycle of LLM-powered workflows:

1. **Interview** (ScopeLogic) → gathers requirements via bounded chat
2. **Propose** (ScopeLogic → PortGrid) → compiles a DAG blueprint, persists for visual review
3. **Approve** (PortGrid) → human reviews/edits the visual flowchart then approves
4. **Execute** (CoreExec) → runs the DAG tasks through a worker pool with retries
5. **Monitor** (ScoutDaemon) → background resource sensing, idle detection
6. **Remember** (Cerebro) → long-term memory with decay, vector search, learning approvals
7. **Route** (RouteSwitch) → intelligent LLM provider management with multi-provider fallback
8. **Persist** (BaseVault) → SQLite WAL with encrypted secrets, redaction, backup/restore

---

## 2. ARCHITECTURE — How It Works

### Stack
- **Backend:** Node.js + Hono (port 3743), SQLite via better-sqlite3, WAL mode
- **Frontend:** React + Vite (port 3742), TailwindCSS, Lucide icons, @xyflow/react (ReactFlow)
- **Execution:** Poolifier worker threads, node-cron scheduling
- **Security:** AES-256-GCM encryption (crypto.ts), P0 Command Sandbox (bwrap + allowlist), PathValidator

### Data Flow
```
User → React UI → fetch() → Hono API (port 3743) → SQLite / RouteSwitchEngine / Workers
                                    ↓
                          SSE streams (telemetry, scout events)
```

### Module Map (8 views, all sharing AppShell + NavigationContext)

| Module | Accent Color | Dashboard Purpose | Set-up Purpose |
|--------|-------------|-------------------|----------------|
| UnifiedMaster | Gold | System KPI strip, Cerebro health, Alerts, Cron | Theme, Logging, Polling, Concurrency |
| CoreExec | Cyan | Run monitor, DAG nodes, Mentrix stats, Pino log | Threading, Iterations, Recovery, Cron scheduler |
| RouteSwitch | Amber | 24h telemetry, Fleet health, Alerts | **Provider Registry**, Routing Rules, Governor, MCP |
| ScopeLogic | Cyan | Interview chat, Proposal status, Confidence | Grammar, Prompt versioning, Council, Assertions |
| PortGrid | Teal | DAG Canvas (ReactFlow), HITL queue, Badges, Telemetry | Tools, Permissions, Sandbox, Accessibility |
| BaseVault | Gold | SQLite explorer, Redaction monitor, Retention | Backup/Restore, Redaction, Migrations, Retention |
| ScoutDaemon | Purple | Vanguard monitor, Discovery ledger, Hardware telemetry | AgentStop, Sensing modes, Idle thresholds, Kill switch |
| Cerebro | Teal | Learning approvals, Memory search, Decay monitor | Retrieval config, Habituation scoring, Knowledge base |

### Persistent Components (always visible)
- **CerebroChatbot** — floating purple bot (bottom-right), routes through `POST /api/cerebro/chat`
- **ProjectSwitcher** — right sidebar, CRUD projects with `project_root_path`
- **ModuleRouter** — left sidebar, module navigation with logos

---

## 3. BACKEND ENDPOINT MAP (Complete)

### Inline Routes (server/index.ts)
| Method | Path | UI Consumer |
|--------|------|-------------|
| GET | `/api/scopelogic/history` | ScopeLogicDashboard |
| POST | `/api/scopelogic/prompt` | ScopeLogicDashboard |
| POST | `/api/scopelogic/reset` | ScopeLogicDashboard |
| POST | `/api/routeswitch/test` | *(no UI — dev only)* |
| POST | `/api/routeswitch/provider` | RouteSwitchDashboard (quick-fix button) |
| GET | `/api/basevault/runs` | CoreExecDashboard, PortGridDashboard, BaseVaultDashboard |
| GET | `/api/basevault/run/:runId` | *(no direct UI consumer — detail view)* |

### routes/llm.ts
| Method | Path | UI Consumer |
|--------|------|-------------|
| GET | `/api/llm/config` | RouteSwitchDashboard (Dashboard) |
| POST | `/api/llm/config` | *(legacy — superseded by provider registry)* |
| GET | `/api/llm/usage` | RouteSwitchDashboard, UnifiedMasterDashboard |
| POST | `/api/llm/clear-error` | RouteSwitchDashboard (quick-fix button) |
| GET | `/api/llm/providers` | RouteSwitchDashboard (Set-up) |
| POST | `/api/llm/providers` | RouteSwitchDashboard (Set-up) |
| PUT | `/api/llm/providers/:id` | RouteSwitchDashboard (Set-up) |
| DELETE | `/api/llm/providers/:id` | RouteSwitchDashboard (Set-up) |
| POST | `/api/llm/providers/:id/test` | RouteSwitchDashboard (Set-up) |
| GET | `/api/llm/routing-rules` | RouteSwitchDashboard (Set-up) |
| PUT | `/api/llm/routing-rules` | RouteSwitchDashboard (Set-up) |
| DELETE | `/api/llm/routing-rules/:id` | RouteSwitchDashboard (Set-up) |

### routes/coreexec-router.ts
| Method | Path | UI Consumer |
|--------|------|-------------|
| POST | `/api/coreexec/approve` | PortGridDashboard (approve proposal) |
| GET | `/api/coreexec/run/:runId/status` | CoreExecDashboard, PortGridDashboard |
| POST | `/api/coreexec/retry/:runId` | *(no UI button yet)* |

### routes/system.ts
| Method | Path | UI Consumer |
|--------|------|-------------|
| GET | `/api/system/metrics` (SSE) | UnifiedMasterDashboard, ScoutDaemonDashboard |
| GET | `/api/system/settings` | All Set-up views |
| POST | `/api/system/settings` | All Set-up views |
| POST | `/api/system/config` | *(no direct UI — maxWorkers dial uses AutonomyDials component)* |
| GET | `/api/system/backup` (SSE) | BaseVaultDashboard (Set-up) |
| POST | `/api/system/restore` | BaseVaultDashboard (Set-up) |
| GET | `/api/system/redaction-log` | BaseVaultDashboard |
| POST | `/api/system/daemon/kill` | ScoutDaemonDashboard |
| POST | `/api/system/daemon/restart` | ScoutDaemonDashboard |
| POST | `/api/system/migrate` | BaseVaultDashboard (Set-up) |
| GET | `/api/system/retention-stats` | BaseVaultDashboard |
| GET | `/api/system/mcp/connections` | RouteSwitchDashboard (Set-up) |
| POST | `/api/system/mcp/connections` | *(no UI save button for MCP yet)* |
| GET | `/api/system/tools` | PortGridDashboard (Set-up) |
| GET | `/api/system/agents/permissions` | PortGridDashboard (Set-up) |
| GET | `/api/system/proposals/pending` | PortGridDashboard, ScopeLogicDashboard |
| POST | `/api/system/proposals/stage` | ScopeLogicDashboard |
| DELETE | `/api/system/proposals/pending` | PortGridDashboard, ScopeLogicDashboard |

### routes/cerebro.ts
| Method | Path | UI Consumer |
|--------|------|-------------|
| GET | `/api/cerebro/health` | CerebroDashboard, UnifiedMasterDashboard |
| POST | `/api/cerebro/query` | *(no UI — raw SQL explorer, admin only)* |
| POST | `/api/cerebro/habituate` | CerebroDashboard, UnifiedMasterDashboard |
| POST | `/api/cerebro/vector-search` | CerebroDashboard |
| GET | `/api/cerebro/learning-approvals` | CerebroDashboard, ScoutDaemonDashboard |
| POST | `/api/cerebro/learning-approvals/:id/approve` | CerebroDashboard |
| POST | `/api/cerebro/learning-approvals/:id/reject` | CerebroDashboard |
| POST | `/api/cerebro/pin-high-confidence` | CerebroDashboard |
| POST | `/api/cerebro/chat` | CerebroChatbot (floating) |

### routes/projects.ts
| Method | Path | UI Consumer |
|--------|------|-------------|
| GET | `/api/projects` | ProjectSwitcher, RouteSwitchDashboard (Set-up) |
| POST | `/api/projects` | ProjectSwitcher |
| PUT | `/api/projects/:id` | ProjectSwitcher (edit) |

### routes/todos.ts
| Method | Path | UI Consumer |
|--------|------|-------------|
| GET | `/api/todos` | PortGridDashboard, ScoutDaemonDashboard |
| POST | `/api/todos/resolve` | PortGridDashboard (approve button) |
| POST | `/api/todos/promote` | ScoutDaemonDashboard (Send to PortGrid) |

### routes/scheduler-list.ts
| Method | Path | UI Consumer |
|--------|------|-------------|
| GET | `/api/scheduler/jobs` | CoreExecDashboard (Set-up), CronSummary component |
| POST | `/api/scheduler/jobs` | CoreExecDashboard (Set-up) |
| DELETE | `/api/scheduler/jobs/:id` | CoreExecDashboard (Set-up) |

### routes/telemetry.ts
| Method | Path | UI Consumer |
|--------|------|-------------|
| GET | `/api/telemetry/metrics` | *(no UI — Prometheus scrape endpoint)* |

### routes/models.ts
| Method | Path | UI Consumer |
|--------|------|-------------|
| GET | `/api/models` | *(no UI consumer — was intended for model discovery display)* |

### ScoutDaemon SSE (core/scoutdaemon/sse.ts)
| Method | Path | UI Consumer |
|--------|------|-------------|
| GET | `/api/scout/events` (SSE) | PortGridDashboard (tool telemetry) |
| POST | `/api/scout/heartbeat` | ScoutDaemonDashboard (Decision Node Audit button) |

---

## 4. GAPS & DISCONNECTIONS

### A. Backend Endpoints with NO Frontend Consumer

| Endpoint | Why It's Disconnected | Severity |
|----------|----------------------|----------|
| `POST /api/routeswitch/test` | Dev-only test endpoint. No UI calls it. | Low |
| `GET /api/basevault/run/:runId` (detail) | Returns full DAG layout + task output. No UI uses this — CoreExec uses `/coreexec/run/:id/status` instead. | Low |
| `POST /api/coreexec/retry/:runId` | Retry a failed run. **No retry button exists in CoreExec Dashboard.** | **Medium** |
| `POST /api/system/config` | Sets maxWorkers. The `AutonomyDials` component may use it but it's not confirmed. | Low |
| `POST /api/system/mcp/connections` | Save MCP connections. **The MCP section in RouteSwitch has no save/add button.** | **Medium** |
| `POST /api/cerebro/query` | Raw SQL execution. No UI for it (intentional — admin-only). | Low |
| `GET /api/telemetry/metrics` | Prometheus scrape endpoint. No in-app visualization. | Low |
| `GET /api/models` | OpenRouter model discovery list. **No UI shows available models.** | **Medium** |
| `POST /api/llm/config` | Legacy single-provider config. Superseded by provider registry but still functional. | Low |

### B. Frontend Calls to Endpoints That May Not Work Properly

| UI Component | Calls | Issue |
|-------------|-------|-------|
| RouteSwitchDashboard (Dashboard) | Hardcoded 3 provider rows | **Shows "Local Mock", "OpenRouter", "OpenCode Zen" regardless of actual registered providers. Should pull from `/api/llm/providers`.** |
| CoreExecDashboard | `GET /api/basevault/runs` | Works but returns ALL runs globally — **not filtered by activeProjectId despite the UI implying project scoping.** |
| BaseVaultDashboard | `GET /api/basevault/runs` | Same issue — not project-filtered. |
| CoreExecDashboard | Orchestration Mentrix widget | **All values are hardcoded (398 tests, 0 duplicates, 1.2% retry, 42ms latency). No backend endpoint provides these.** |
| BaseVaultDashboard | DB Stats (latency, WAL checkpoints) | **Latency and WAL checkpoint values are randomly generated in the frontend (`Math.random()`). Not real data.** |
| ScopeLogicDashboard | Confidence score | **Hardcoded at 98.4%. Not derived from any backend calculation.** |
| PortGridDashboard (Set-up) | `GET /api/system/tools` | Returns hardcoded defaults from system_settings. **No real tool discovery — list is static.** |
| PortGridDashboard (Set-up) | `GET /api/system/agents/permissions` | Returns hardcoded permission matrix. **No real enforcement — display only.** |
| ScoutDaemonDashboard | `POST /api/scout/heartbeat` | Endpoint exists in SSE router but **may not have a handler** — needs verification. |

### C. Core Backend Logic Not Exposed to UI

| Backend Feature | Where It Lives | What's Missing |
|----------------|----------------|----------------|
| `executeWithFallback()` (OpenRouter direct) | `core/routeswitch/router.ts` | **Dead code — 0 callers. Superseded by engine fallback loop.** Safe to delete. |
| `WorktreeIsolation` | `core/coreexec/worktree.ts` | Creates `.nexus_worktrees/` dirs but **no UI shows worktree status or lets user apply/discard drafted changes.** |
| `CommandSandbox.resolveCwd()` | `core/coreexec/sandbox.ts` | Functional but **never called from the UI directly. Only triggered when a DAG node contains a shell command.** |
| `ModelDiscovery.fetchModels()` | `core/routeswitch/discovery.ts` | Fetches OpenRouter model list but **nothing triggers it from the UI and no display renders the results.** |
| `ConsensusSynthesizer` (Council Mode) | `core/routeswitch/council.ts` | Functional when triage triggers it, but **no UI shows council mode is active or its results.** |
| `AgentStopSupervisor` | `core/routeswitch/agent-stop.ts` | Runs post-generation quality check but **no UI indicator shows when AgentStop aborted a response.** |
| `validateDAGProposal` / `escalateBlockedDAGToOsTodos` | `core/coreexec/validateDAG.ts` | Functional — blocks unsafe DAGs. But **no UI feedback shows WHY a proposal was rejected** (just a generic error). |
| `SensitiveDataRedactor.getRecentEvents()` | `core/basevault/redactor.ts` | Backend tracks events but **the redaction monitor in BaseVault Dashboard will be empty until the redactor is actively intercepting data during inference.** |
| `project_root_path` | `projects` table | Stored and validated, but **not yet used by Cerebro/GitNexus for AST parsing** (future integration). |
| `FreeModeGovernor.assertCanProceedDAG()` | `core/routeswitch/governor.ts` | Blocks execution when token budget exceeded — but **no UI shows the user WHY their workflow was blocked.** Only returns a generic error from /approve. |

### D. Known UX Gaps (Not Code Bugs)

1. **No "Retry" button for failed workflow runs** in CoreExec Dashboard — endpoint exists (`POST /api/coreexec/retry/:runId`) but no UI surfaces it.
2. **RouteSwitch Dashboard view still shows hardcoded providers** instead of pulling from the live registry. The Set-up view is correct; the Dashboard view is stale.
3. **Project-scoped queries not actually filtered** — `GET /api/basevault/runs` returns all 50 most recent runs regardless of which project is selected in the Right Bar.
4. **No way to see/manage worktrees** — the `.nexus_worktrees/` isolation is created but there's no UI to view, apply, or discard drafted changes.
5. **No model discovery browser** — OpenRouter models are fetched by the backend but never shown to the user when selecting models in the provider setup.
6. **MCP connections section is read-only** — you can see connections but can't add/remove them from the UI.

---

## 5. WHAT WORKS WELL (Fully Wired End-to-End)

1. **ScopeLogic Interview → PortGrid Approval → CoreExec Execution** — Complete flow with persistence, visual ReactFlow, and human approval gate.
2. **LLM Provider Registry** — Full CRUD with encrypted keys, live engine sync, per-scope fallback chains, test connectivity.
3. **Cerebro Chatbot** — Floating assistant with LLM routing, navigation buttons, graceful offline fallback.
4. **ScoutDaemon telemetry** — SSE-based live CPU/temp monitoring, daemon kill/restart.
5. **BaseVault backup/restore** — SSE progress streaming, file upload restore with process restart.
6. **Cron Scheduling** — Full create/delete/list with next-tick probing via cron-parser.
7. **System Settings** — All Set-up views correctly read/write via the shared `system_settings` KV table.
8. **Project Management** — CRUD with `project_root_path` validation, workspace provisioning, project-scoped context switching.
9. **Cerebro Learning Approvals** — Approve/reject facts, promote to substantiated graph, vector search.
10. **Zero-Trust DAG Validation** — Both cron and interactive paths validate proposals before execution.

---

## 6. RECOMMENDED PRIORITY FIXES

| Priority | Fix | Effort |
|----------|-----|--------|
| P0 | Wire `/api/basevault/runs` to filter by `project_id` when `activeProjectId` is set | 15 min |
| P0 | Replace hardcoded providers in RouteSwitch Dashboard view with live data from `/api/llm/providers` | 30 min |
| P1 | Add "Retry" button to CoreExec Dashboard for failed/parked runs | 20 min |
| P1 | Add project_id query param to basevault/runs endpoint for project scoping | 15 min |
| P1 | Show Governor block reason in UI when /approve returns 400 | 20 min |
| P2 | Add model discovery browser (fetch from `/api/models` → show in provider setup) | 1 hr |
| P2 | Add MCP connection add/remove UI controls | 1 hr |
| P2 | Create worktree management UI (view/apply/discard) in PortGrid | 2 hr |
| P2 | Replace random DB stats in BaseVault with real metrics from an endpoint | 30 min |
| P3 | Delete dead `executeWithFallback()` in router.ts | 5 min |
| P3 | Add Council Mode indicator to RouteSwitch Dashboard when active | 30 min |
| P3 | Surface AgentStop abort events in the Pino log | 20 min |
