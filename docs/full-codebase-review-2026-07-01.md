# ByteBuster NeuroSync Sovereign OS — Full Codebase Review
**Date:** 2026-07-01 | **Branch:** OKF-Shift | **Build:** ✅ 0 TypeScript errors

---

## 1. ARCHITECTURE OVERVIEW

**Stack:**
- Backend: Node.js 24 LTS, Hono (port 3743), SQLite via better-sqlite3 in WAL mode
- Frontend: React 19, Vite (port 3742), TailwindCSS, @xyflow/react, Lucide icons
- Execution: Poolifier worker threads, node-cron scheduling, node-pty terminal
- Security: AES-256-GCM (crypto.ts), bwrap sandbox, PathValidator, GBNF grammar enforcement

**21 SQLite Tables:**
`projects`, `workflows`, `workflow_runs`, `tasks`, `os_todos`, `cerebro_memories_meta`, `cerebro_memories_vec` (virtual), `cerebro_learning_approvals`, `cerebro_prune_log`, `council_decisions`, `dag_proposals`, `system_settings`, `model_benchmarks`, `discovered_models`, `llm_providers`, `llm_routing_rules`, `okf_nodes`, `okf_edges`, `scout_okf_nodes`, `sqlite_sequence`

**8 Module Dashboards** (all using AppShell + NavigationContext):
CoreExec, RouteSwitch, ScopeLogic, PortGrid, BaseVault, ScoutDaemon, Cerebro, UnifiedMaster

**New since last review (major additions):**
- OKF Knowledge Graph (full pipeline: scan → convert → index → mindmap)
- PortGrid Embedded Terminal (bwrap-sandboxed, node-pty, auto-scan on close)
- DeveloperMode / ModeLabel system (Hobbyist ↔ Developer UI labels)
- Tri-Modal Context Router (OKF + GitNexus + Vector)
- Deference UI with confidence-gated approval queue
- Per-project ScopeLogic session isolation
- Global OKF seed bootstrap
- Structured observability logger (respects system_settings.log_level)
- OpenCode + OpenRouter provider adapters
- Crash recovery (resumeInProgressRuns at boot)
- Completed_at timestamps on workflow_runs
- dag_proposals table replacing system_settings blob

---

## 2. COMPLETE BACKEND ENDPOINT MAP

### server/index.ts (inline)
| Method | Path | Consumer | Status |
|--------|------|----------|--------|
| POST | `/api/routeswitch/test` | None (dev only) | ⚠ Dead UI |
| POST | `/api/routeswitch/provider` | RouteSwitchDashboard quick-fix | ✅ |
| GET | `/api/basevault/runs?projectId=` | CoreExec, PortGrid, BaseVault | ✅ Fixed (now project-scoped) |
| GET | `/api/basevault/run/:runId` | None direct | ⚠ No UI consumer |
| WS | `/api/portgrid/terminal/:projectId` | PortGrid EmbeddedTerminal | ✅ |

### routes/llm.ts
| Method | Path | Consumer |
|--------|------|----------|
| GET | `/api/llm/config` | RouteSwitchDashboard Dashboard |
| POST | `/api/llm/config` | Legacy (superseded) |
| GET | `/api/llm/usage` | RouteSwitchDashboard, UnifiedMaster |
| POST | `/api/llm/clear-error` | RouteSwitchDashboard |
| GET | `/api/llm/providers` | RouteSwitchDashboard Set-up |
| POST | `/api/llm/providers` | RouteSwitchDashboard Set-up |
| PUT | `/api/llm/providers/:id` | RouteSwitchDashboard Set-up |
| DELETE | `/api/llm/providers/:id` | RouteSwitchDashboard Set-up |
| POST | `/api/llm/providers/:id/test` | RouteSwitchDashboard Set-up |
| GET | `/api/llm/routing-rules` | RouteSwitchDashboard Set-up |
| PUT | `/api/llm/routing-rules` | RouteSwitchDashboard Set-up |
| DELETE | `/api/llm/routing-rules/:id` | RouteSwitchDashboard Set-up |

### routes/okf.ts
| Method | Path | Consumer |
|--------|------|----------|
| GET | `/api/okf/nodes?tier&type&projectId` | CerebroDashboard |
| GET | `/api/okf/nodes/:id` | None direct |
| POST | `/api/okf/search` | CerebroDashboard |
| POST | `/api/okf/index` | CerebroDashboard |
| POST | `/api/okf/generate/document` | None direct (internal) |
| POST | `/api/okf/generate/chat` | None direct (internal) |
| GET | `/api/okf/scout-drafts` | ScoutDaemonDashboard |
| POST | `/api/okf/scout-drafts/:id/promote` | ScoutDaemonDashboard |
| POST | `/api/okf/scout-drafts/:id/reject` | ScoutDaemonDashboard |
| GET | `/api/okf/status?projectId=` | OKFWorkspaceWidget |
| POST | `/api/okf/scan-project` | OKFWorkspaceWidget |
| POST | `/api/okf/convert-document` | OKFWorkspaceWidget |
| POST | `/api/okf/sync` | OKFWorkspaceWidget |
| GET | `/api/okf/graph?tier&projectId` | OKFMindmap |
| GET | `/api/okf/file-content?nodeId=` | OKFMindmap |
| GET | `/api/okf/global-files` | CerebroDashboard Set-up |

### routes/system.ts
| Method | Path | Consumer |
|--------|------|----------|
| GET | `/api/system/metrics` (SSE) | UnifiedMaster, ScoutDaemon |
| GET | `/api/system/settings` | All Set-up views |
| POST | `/api/system/settings` | All Set-up views |
| POST | `/api/system/config` | AutonomyDials component |
| GET | `/api/system/backup` (SSE) | BaseVaultDashboard |
| POST | `/api/system/restore` | BaseVaultDashboard |
| GET | `/api/system/redaction-log` | BaseVaultDashboard |
| POST | `/api/system/daemon/kill` | ScoutDaemonDashboard |
| POST | `/api/system/daemon/restart` | ScoutDaemonDashboard |
| POST | `/api/system/migrate` | BaseVaultDashboard |
| GET | `/api/system/retention-stats` | BaseVaultDashboard |
| GET | `/api/system/mcp/connections` | RouteSwitchDashboard |
| POST | `/api/system/mcp/connections` | ⚠ No UI save button |
| GET | `/api/system/tools` | PortGridDashboard Set-up |
| GET | `/api/system/agents/permissions` | PortGridDashboard Set-up |
| GET | `/api/system/proposals/pending` | PortGridDashboard, ScopeLogic |
| POST | `/api/system/proposals/stage` | ScopeLogicDashboard |
| POST | `/api/system/proposals/resolve` | PortGridDashboard |
| POST | `/api/system/proposals/reject` | PortGridDashboard |
| DELETE | `/api/system/proposals/pending` | Legacy fallback |
| POST | `/api/system/browse-directory` | PathBrowser component |
| GET | `/api/system/proof-badges?projectId=` | PortGridDashboard |

### routes/cerebro.ts
| Method | Path | Consumer |
|--------|------|----------|
| GET | `/api/cerebro/health` | CerebroDashboard, UnifiedMaster |
| POST | `/api/cerebro/query` | ⚠ No UI (admin SQL) |
| POST | `/api/cerebro/habituate` | CerebroDashboard |
| POST | `/api/cerebro/vector-search` | CerebroDashboard |
| GET | `/api/cerebro/learning-approvals` | CerebroDashboard, ScoutDaemon |
| POST | `/api/cerebro/learning-approvals/:id/approve` | CerebroDashboard |
| POST | `/api/cerebro/learning-approvals/:id/reject` | CerebroDashboard |
| POST | `/api/cerebro/pin-high-confidence` | CerebroDashboard |
| POST | `/api/cerebro/chat` | CerebroChatbot |
| GET | `/api/cerebro/decay-stats` | CerebroDashboard |
| GET | `/api/cerebro/prune-history` | CerebroDashboard |
| GET | `/api/cerebro/prune-preview` | CerebroDashboard |
| POST | `/api/cerebro/prune-confirm` | CerebroDashboard |

### routes/scopelogic-router.ts
| Method | Path | Consumer |
|--------|------|----------|
| GET | `/api/scopelogic/history?projectId=` | ScopeLogicDashboard |
| POST | `/api/scopelogic/prompt` | ScopeLogicDashboard |
| POST | `/api/scopelogic/reset` | ScopeLogicDashboard |
| GET | `/api/scopelogic/prompt-info` | ScopeLogicDashboard Set-up |

### routes/coreexec-router.ts
| Method | Path | Consumer |
|--------|------|----------|
| POST | `/api/coreexec/approve` | PortGridDashboard |
| GET | `/api/coreexec/run/:runId/status` | CoreExecDashboard, PortGrid |
| POST | `/api/coreexec/retry/:runId` | ⚠ No UI button |

### routes/projects.ts
| Method | Path | Consumer |
|--------|------|----------|
| GET | `/api/projects` | ProjectSwitcher, RouteSwitch Set-up |
| POST | `/api/projects` | ProjectSwitcher |
| PUT | `/api/projects/:id` | ProjectSwitcher edit |

### routes/todos.ts
| Method | Path | Consumer |
|--------|------|----------|
| GET | `/api/todos` | PortGridDashboard, ScoutDaemon |
| POST | `/api/todos/resolve` | PortGridDashboard |
| POST | `/api/todos/reject` | PortGridDashboard |
| POST | `/api/todos/resolve-bulk` | PortGridDashboard (Deference UI) |
| POST | `/api/todos/reject-bulk` | PortGridDashboard (Deference UI) |
| POST | `/api/todos/promote` | ScoutDaemonDashboard |

### Other routes
- `/api/scheduler/jobs` GET/POST/DELETE — CoreExecDashboard, CronSummary
- `/api/models` GET — ⚠ No UI consumer
- `/api/telemetry/metrics` GET — ⚠ Prometheus only, no in-app visualization
- `/api/scout/events` SSE — PortGridDashboard, ScoutDaemon
- `/api/scout/heartbeat` POST — ScoutDaemonDashboard

---

## 3. CURRENT GAPS & DISCONNECTIONS

### A. Endpoints with NO Frontend Consumer (confirmed dead UI)

| Endpoint | Severity | Fix Needed |
|----------|----------|------------|
| `POST /api/routeswitch/test` | Low | Dev endpoint, safe to leave |
| `GET /api/basevault/run/:runId` | Low | CoreExec uses `/coreexec/run/:id/status` instead |
| `POST /api/coreexec/retry/:runId` | **Medium** | No retry button on failed runs in CoreExec Dashboard |
| `POST /api/system/mcp/connections` | **Medium** | MCP section is read-only, no add/remove UI |
| `GET /api/models` | **Medium** | OpenRouter model list fetched but never displayed |
| `POST /api/cerebro/query` | Low | Admin SQL — intentional |
| `GET /api/telemetry/metrics` | Low | Prometheus scrape — intentional |
| `POST /api/llm/config` | Low | Legacy, superseded by provider registry |

### B. Frontend Calls With Confirmed Problems

| Component | Issue | Severity |
|-----------|-------|----------|
| `OKFWorkspaceWidget` — convert-document | **LLM returns non-JSON** (FreeLLMAPI 401 / Gemma4 stub). OKF files never created. Documents incorrectly marked processed (now fixed — only marks on success). | **P0** |
| `RouteSwitchDashboard` (Dashboard view) | Fleet Health widget shows **3 hardcoded provider rows** ("Local Mock", "OpenRouter Free", "OpenCode Zen") instead of pulling from `/api/llm/providers`. The Set-up view is correct; Dashboard is stale. | **P1** |
| `BaseVaultDashboard` — DB Stats (latency, WAL checkpoints) | **Randomly generated** by `Math.random()` every 3 seconds. Not real data. No backend endpoint provides these values. | **P1** |
| `CoreExecDashboard` — Orchestration Mentrix | **All values hardcoded**: "398 Tests PASSING", "0 Duplicates", "1.2% Retry", "42ms Latency". None are live. | **P1** |
| `ScopeLogicDashboard` — Confidence score | **Hardcoded at 98.4%**. Not derived from any backend calculation. | P2 |
| `CerebroDashboard` — "Nearing Decay" + "Pruned (30d)" | These now call **new endpoints that may not exist** yet: `/api/cerebro/decay-stats`, `/api/cerebro/prune-history`, `/api/cerebro/prune-preview`, `/api/cerebro/prune-confirm`. These are consumed by CerebroDashboard but their existence in routes/cerebro.ts is **unconfirmed** — they may be missing, causing silent 404s. | **P0** |

### C. OKF Conversion Pipeline — Root Cause Confirmed

The core issue with OKF conversion not working:

1. **FreeLLMAPI → 401** (no API key configured). Should fall through to Gemma4.
2. **Gemma4 LlamaCppProvider** is a stub. When `schema` is passed, it returns one generic mock concept `[{"type":"capability","title":"Local analysis of: ..."}]`. This IS valid JSON.
3. **The `_extractConcepts` catch block** had `JSON.parse(raw)` with no fence-stripping before the recent fix. Now has fence-stripping.
4. **The 113KB BBR Pipeline doc** gets truncated to 4000 chars before being sent.
5. **The Gemma4 stub mock returns a title starting with** `"Local analysis of: You are a knowledge..."` which slug-generates to a very long filename — but the file should still be created.
6. **Most likely remaining issue**: The BBR Pipeline project's routing rule has only FreeLLMAPI (`["prov_558ffc6ef771"]`) — no Gemma4 fallback. When FreeLLMAPI returns 401, the engine marks it as failed, tries the next in chain, but there IS no next provider for that project scope.

**Fix**: Add Gemma4 to the BBR Pipeline project's routing chain in RouteSwitch Set-up.

### D. Core Logic Not Exposed to UI

| Feature | Status |
|---------|--------|
| `WorktreeIsolation` — .nexus_worktrees/ | Created on run start, but **no UI to view/apply/discard** drafted changes |
| `commandSandbox.resolveCwd()` | Functional, never surfaced to UI |
| `ModelDiscovery.fetchModels()` | Fetches on boot, results in `discovered_models` table, **no UI display** |
| `ConsensusSynthesizer` Council Mode | Runs silently, **no UI indicator** when active |
| `AgentStopSupervisor` | Terminates low-quality responses silently, **no UI log entry** |
| `context-router.ts` tri-modal routing | Working but **CerebroChatbot doesn't call it** — it builds prompts directly |
| `write-queue.ts` | Exists but unclear if wired anywhere |
| `reflection-worker.ts` | Worker thread for reflection — unclear if used vs ReflectionExecutor |
| `db-sync.ts` (scoutdaemon) | Exists, unclear consumer |

### E. New Features Since Last Review — Verification Needed

| Feature | Location | Status |
|---------|----------|--------|
| Cerebro decay/prune endpoints | `routes/cerebro.ts` | Need to verify these 4 endpoints exist |
| Cerebro vector-search project scoping | `vector.ts` | `CerebroVectorStore.search()` now accepts `projectId` param |
| `todos/reject`, `todos/resolve-bulk`, `todos/reject-bulk` | `routes/todos.ts` | PortGrid calls these — need to verify they exist |
| `system/proposals/resolve` + `system/proposals/reject` | `routes/system.ts` | PortGrid calls these — need to verify they exist |
| `system/proof-badges` | `routes/system.ts` | PortGrid calls this — need to verify it exists |
| `portgrid/sandbox.ts` | `core/portgrid/` | Separate from `coreexec/sandbox.ts` — unclear relationship |
| `gitnexus-client.ts` | `core/memory/` | GitNexus integration — unclear if functional |
| `scoutdaemon/parser.ts` | `core/scoutdaemon/` | Unknown — not previously seen |

---

## 4. PRIORITY FIXES

### P0 — Breaks Core User Workflows

1. **OKF conversion fails silently**: BBR Pipeline project routing rule only has FreeLLMAPI (401 error), no Gemma4 fallback. User must add Gemma4 to the BBR Pipeline project chain in RouteSwitch Set-up → Fallback Chain → Project tab.

2. **Cerebro decay/prune/proof-badges endpoints may be missing**: CerebroDashboard and PortGridDashboard call endpoints that weren't in the previous route file. Need verification.

### P1 — Visible Fake Data / Broken Displays

3. **RouteSwitch Dashboard Fleet Health**: Shows hardcoded provider names instead of live registry. Fix: replace hardcoded rows with `GET /api/llm/providers`.

4. **BaseVaultDashboard DB Stats**: Latency and WAL checkpoint values are `Math.random()`. Fix: create a real `GET /api/system/db-stats` endpoint returning actual SQLite metrics.

5. **CoreExecDashboard Mentrix**: All 4 stats (tests, duplicates, retry rate, latency) are hardcoded. Fix: compute real values from `workflow_runs` and `tasks` tables.

### P2 — Missing but Non-Breaking

6. **No retry button for failed workflow runs** (`POST /api/coreexec/retry/:runId` exists, no UI).

7. **No model discovery browser** (models fetched but never shown).

8. **CerebroChatbot doesn't use tri-modal context router** — only routes through OKF via RouteSwitchEngine. Could benefit from GitNexus code context.

9. **WorktreeIsolation UI** — .nexus_worktrees/ created but no way to view/apply/discard.

---

## 5. WHAT WORKS WELL (VERIFIED)

1. **Full ScopeLogic → PortGrid → CoreExec pipeline** with dag_proposals table, per-project sessions, confidence gating
2. **LLM Provider Registry** — CRUD, encrypted keys, scope-aware fallback chains, live engine sync
3. **OKF knowledge graph infrastructure** — tables, parser, indexer, graph query, context injection into every LLM call
4. **OKF Mindmap** — ReactFlow with tier tabs, zoom/pan/minimap, click-to-read file preview
5. **OKF Workspace Widget** — project doc scanning, convert button, sync, drift detection
6. **PortGrid Embedded Terminal** — bwrap-sandboxed, opens CLI tools (claude, codex), auto-scans on close
7. **Deference UI** — confidence-gated approval with bulk approve/reject
8. **DeveloperMode / ModeLabel** — full Hobbyist ↔ Developer label switching
9. **Cerebro floating chatbot** — navigation guidance, LLM-routed, offline fallback
10. **BaseVault backup/restore** — SSE streaming progress, file upload restore
11. **Cron scheduling** — create/delete/list with next-tick probing
12. **Zero-Trust DAG validation** — both cron and interactive paths gated
13. **Per-project basevault/runs** — now actually project-scoped
14. **Structured logging** — respects UI log level setting in real time
15. **Boot crash recovery** — resumeInProgressRuns restarts stale workflow_runs
16. **Active project persistence** — localStorage survives page refresh
17. **Global OKF seed** — ships base knowledge on first run
