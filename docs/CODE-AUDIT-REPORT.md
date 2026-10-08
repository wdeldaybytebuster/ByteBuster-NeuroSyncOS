# NeuroSync Sovereign OS — Code-Only Audit Report

> **Method:** Every claim below is derived strictly from `.ts`/`.tsx` source — no `docs/`, no README, no planning artifacts consulted. Faked numbers are confirmed by line. This document reflects the state of the codebase at the time of generation.

---

## 1. Project Overview

**What it is:** NeuroSync Sovereign OS is a local-first, privacy-first AI workflow orchestrator. A Vite + React frontend talks to a single Hono Node server on port `3743`, which fans commands out to seven "modules" sharing one SQLite database at `.data/neurosync.db`.

**How it's wired:**

- **Frontend** (`src/ui`): React 19 + `@xyflow/react` for DAG visualization + Tailwind. Entry is `src/ui/main.tsx` → `OSLayout` → one of 8 `*Dashboard.tsx` views. All dashboards are hosted in an `AppShell` (top bar, hamburger, sidebar, developer-mode toggle, theme toggle, project filter chip).
- **Backend** (`src/server/index.ts`): Hono on port `3743`, CORS-wide-open, payload-limit 64 KB, naïve 120 req/min per-IP rate limiter that exempts `/health` and `/api/config`. Mounts 10 routers in `routes/`, plus the SSE `scoutRouter` from `core/scoutdaemon/sse.ts`, and the WebSocket terminal at `/api/portgrid/terminal/:projectId`.
- **Storage** (`src/core/basevault/db.ts`): `better-sqlite3` in WAL mode, `sqlite-vec` extension loaded for vector search, ~16 tables: `projects`, `workflows`, `workflow_runs`, `tasks`, `os_todos`, `cerebro_memories_meta`, `cerebro_memories_vec`, `cerebro_learning_approvals`, `system_settings`, `model_benchmarks`, `discovered_models`, `llm_providers`, `llm_routing_rules`, `okf_nodes`, `okf_edges`, `scout_okf_nodes`. Schema migrations handled in-script with idempotent `ALTER TABLE … ADD COLUMN` retries.
- **Background sensing** (`core/scoutdaemon/`): an `EventEmitter` (`scoutEmitter`) pushes RUN_STATUS / TASK_STATUS as SSE; `idleDetector` toggles Cerebro reflection at idle.
- **Scheduler** (`core/coreexec/scheduler.ts` + `server/routes/scheduler-list.ts`): `node-cron` plus `cron-parser` for live `nextTick` computation.

---

## 2. Target Audience

**For:** A solo developer/operator with intermediate-to-advanced comfort in SQLite, Node.js, server processes, API keys, and `lm-studio`-style local GGUF inference. The system assumes the user can:

- Manage per-scope LLM routing chains (global → cerebro → project → agent).
- Operate backup/restore of a SQLite vault.
- Reason about OKF concept graphs on disk.
- Maintain a `neurosync-config.yaml` at the project root.
- Understand sandbox configuration (bubblewrap, network isolation, env stripping).

**Not for:** Non-technical users. The settings surface assumes literacy with terms like "GBNF grammar-constrained decoding," "SSE vs polling scout modalities," "External Calls Enabled," and "P0 Command Sandbox."

---

## 3. What's Fully Functional vs What's Faked

### Fully functional (real, end-to-end)

| Capability | Evidence in code |
|---|---|
| **DAG engine** — claim → dispatch → complete/park, with worktree isolation | `src/core/coreexec/engine.ts`: real `executeRun`, 5-min lease timeouts, claim/dispatch, parking on crash, real SSE updates via `scoutEmitter` |
| **Worker pool** — Thread pool with metrics | `core/coreexec/worker-pool.ts`, exposed read-only via `/api/system/metrics` (`pool.workerNodes`, `idleWorkerNodes/busyWorkerNodes/queuedTasks`) |
| **SQLite + WAL + migrations** | `core/basevault/db.ts`: WAL mode, FK enforcement, busy_timeout, defensive `ALTER TABLE` retries |
| **OKF indexing + sync** | Real fs walk of `*.md` / `*.rst` / `*.adoc` / `*.txt` / `*.mdx`, YAML frontmatter parse, indexing in `core/okf/indexer.ts`; exposed via `/api/okf/{status,scan-project,convert-document,sync,graph}` |
| **Provider registry CRUD** | `src/server/routes/llm.ts`: `encrypt()`/`decrypt()` round trips, per-scope fallback chains, `/providers/:id/test` performs a live call |
| **Encrypt-at-rest LLM keys** | `basevault/crypto.ts` (AES-GCM); verified by `api_key_encrypted` column + `decrypt()` reads |
| **Scope-based routing** | `routeswitch/engine.ts:resolveProviderChain()` walks `agent → project → cerebro → global` and falls back to current provider |
| **Council / multi-model consensus** | `triage.isHighRisk` + `council.executeCouncilMode` — selectable via routing rule. (Mostly untested in this audit.) |
| **Backup / Restore** | `system.ts` uses `db.backup()` with SSE progress; restore overwrites the DB and `process.exit(0)` for the process manager to reboot |
| **Embedded terminal** | `portgrid/terminal-session.ts`: real `node-pty` + custom `bwrap` recipe (ro-bind `/usr`, `--unshare-net`, `--clearenv`, `--die-with-parent`). Human-only, gated on `bwrap` availability. Confirmed containment of `/etc/shadow`, network stripping, etc. |
| **Cerebro chat** | Real `/api/cerebro/chat` with `memory/context-router.ts` pumping a real prompt through RouteSwitch; falls back to canned offline reply if provider absent |
| **ScopeLogic proposal DAG** | `interview.ts` saves a 4-step auto-generated DAG from user messages when the LLM is offline; routes through `/api/scopelogic/prompt`; persists to `system_settings.pending_proposal` |
| **Cron workflow scheduling** | `node-cron` + `cron-parser` (`scheduler-list.ts`) with live `nextTick` |
| **Project CRUD with path validation** | `projects.ts:validateProjectRootPath()` rejects null bytes, traversal, list of forbidden system dirs, requires existence |

### Faked / simulated / dynamically lied (UI side)

| What's lied | File | Mechanism |
|---|---|---|
| **Orchestration Mentrix** stats | `src/ui/views/CoreExecDashboard.tsx` widget B | Hardcoded `"398 Tests"`, `"PASSING"`, `"0"`, `"1.2%"`, `"42ms"` — not fetched, ever |
| **Pino Transaction Log** seed text | `CoreExecDashboard.tsx` initial `useState` of `logs` | Four hardcoded `COREEXEC: Booting / BASEVAULT: WAL / TASK_CLAIM / ROUTESWITCH` lines; *only* subsequent appends are real (on task state change) |
| **DB Stats** latency + WAL checkpoint rate | `BaseVaultDashboard.tsx` | `Math.random() * (1.2 - 0.45) + 0.45` and `Math.floor(Math.random() * (26 - 18) + 18)` — flicker every 3 s, no SQL involved |
| **Global Knowledge Base** file list | `CerebroDashboard.tsx` | Hardcoded `["system-constraints.md", "onboarding-guide.md", "api-reference.md"]` with literal `"3 files"` — the orchestrator widget C |
| **Habituation Decay** counters | `CerebroDashboard.tsx` | `"Nearing Decay: 0"`, `"Pruned (30d): 0"` — never wired |
| **LLM Fleet Health** panel | `RouteSwitchDashboard.tsx` widget B | Three literal rows claiming "Local Mock: ACTIVE / OpenRouter: STANDBY / OpenCode Zen: DISABLED" — driven by a single ternary on `config?.config?.provider` |
| **Effective Confidence** on ScopeLogic | `ScopeLogicDashboard.tsx` | `useState({ score: 98.4, alerts: [] })` — never recomputed |
| **System Prompt Governance** version | `ScopeLogicDashboard.tsx` Set-up tab | Hardcoded `"v3.2.1"`, `"PASSING (398 tests)"` |
| **ScoutDaemon** state-machine seed | `ScoutDaemonDashboard.tsx` | `useState(0.42)` initial `cpuLoad` before first SSE arrives |
| **Verifiable Confidence Badges** | `PortGridDashboard.tsx` widget | Inline literal array of `{label, active, color}` — UI typed |

### Backend-side stubs ("defaults if no row in DB")

These are **intentional** fallbacks in the backend that only activate when no DB record is present. They are not front-end lies, but they masquerade as live data when first viewed:

- **`system.ts`** — default `mcp_connections = [{ sqlite-vec, gitnexus }]`
- **`system.ts`** — default `tool_registry = [read_file, write_file, list_directory, run_command, git_nexus, sqlite_vec]`
- **`system.ts`** — default `agent_permissions.archetypes = [code_execute, research_only, admin_operator]`
- **`providers.ts` → `MockProvider`** (`adapters/mock-provider.ts`) returns `"[MOCK RESPONSE] Acknowledged prompt: …"` — this is what runs when no `/api/llm/providers` row is enabled.

---

## 4. Dashboard-by-Dashboard — What's Real vs Faked

### UnifiedMasterDashboard — "System View"

| Widget | Real? | Notes |
|---|---|---|
| KPI Strip (Workers, CPU Load, Tokens 24h, Cost, Memory Vectors) | **Real** | SSE `EventSource('/api/system/metrics')` + `setInterval 10s` poll of `/api/llm/usage` and `/api/cerebro/health`. CPU util comes from `os.cpus()` times on backend. |
| Action Center & Escalations | **Real** | Delegates to `<NotificationCenter />` (real `os_todos` table) |
| Cerebro Health & Habituation | **Real** | Live `lastReflection` from `/api/cerebro/health` |
| Scheduled Workflows | **Real** | `<CronSummary />` reads `/api/scheduler/jobs` |

Set-up view toggles (SmartTips, Reduced Motion, log_level, polling_interval, max_concurrent, claim_batch_size) save to `system_settings` but **none have consumers** that re-read them — they persist without affecting runtime behavior.

### CoreExecDashboard ("Orchestrator")

| Widget | Real? | Notes |
|---|---|---|
| Active Workflow Runs list | **Real** | `GET /api/basevault/runs` (real; partition-by-Zod schema active) |
| DAG Nodes (status icons) | **Real** | `GET /api/coreexec/run/:id/status` |
| Worker Pool Telemetry | **Real** | `<AgentKPIStrip />` reads SSE telemetry |
| Escalation & Alerts Ledger | **Real** | `<NotificationCenter />` against `os_todos` |
| Workflow Cron Scheduler | **Real** | CRUD against `/api/scheduler/jobs` |
| **Orchestration Mentrix** | **FAKED** | "398 Tests PASSING / Duplicates 0 / Retry 1.2% / Latency 42ms" — hand-typed in JSX, never fetched |
| **Pino Transaction Log** | **PARTIAL** | First 4 lines hardcoded; later appends real-time on task status changes |
| Engine Tuning sliders (Budget/Autonomy) | **PARTIAL** | Save to `system_settings`; no consumer in core code |

### BaseVaultDashboard (SQLite/storage)

| Widget | Real? | Notes |
|---|---|---|
| Run explorer | **Real** | Same list query as CoreExec |
| Live backup (SSE progress) | **Real** | `db.backup()` over SSE, file path returned |
| Restore (file upload) | **Real** | Drains worker pool, closes DB, copies file, `process.exit(0)` |
| Retention & Pruning stats | **Real** | `/api/system/retention-stats` queries `workflow_runs` and `tasks` |
| Schema Migration button | **Real** | Calls `initDB()` (idempotent CREATE IF NOT EXISTS) |
| **Data Sanitization Monitor** | **REAL BACKEND, SPARSE UI** | `SensitiveDataRedactor.getRecentEvents()` runs; only lights up if redaction events accumulate |
| **DB Size / Latency / WAL Checkpoints** | **FAKED** | Initial `dbStats.size: '14.8 MB'` literal; `latency` and `walCheckpoints` are `Math.random()` running on `setInterval(3000)` |

### PortGridDashboard (Proposals / Tools / Terminal)

| Widget | Real? | Notes |
|---|---|---|
| Interactive DAG Canvas (proposal) | **Real** | Fetches `/api/system/proposals/pending`; passes through `validateDAGProposal` gate |
| Approve & Execute | **Real** | POSTs to `/api/coreexec/approve` |
| Attention Required (HITL queue) | **Real** | `os_todos` with confidence `<0.70` |
| Deference UI pill bar | **Real** | Real `/api/todos/resolve-bulk` |
| Embedded Terminal | **REAL** | `node-pty` → WebSocket `/api/portgrid/terminal/:projectId` → hardened `bwrap` |
| OKF Workspace Widget | **Real** | Disk-vs-DB sync view, project doc scan + convert |
| OKF Knowledge Mindmap | **Real** | ReactFlow graph from `/api/okf/graph` |
| **Tool Registry** list | **FAKED IF DB EMPTY** | Defaults from `system.ts` |
| **Agent Permissions matrix** | **FAKED IF DB EMPTY** | 3-row hardcoded archetype list |
| **P0 Command Sandbox toggles** | **HALF-REAL** | Save to `system_settings`; `CommandSandbox` bwrap flags are hardcoded in source |
| **Verifiable Confidence Badges** | **FAKED** | Inline literal array |

### RouteSwitchDashboard (LLM Providers)

| Widget | Real? | Notes |
|---|---|---|
| 24h Telemetry & Quota Ledger | **Real** | `governor.getUsage24h()` |
| Provider Registry CRUD | **REAL** | Full form, model-path browser, encrypt + persist |
| Provider Test | **REAL** | Round-trip `generate` call with latency measurement |
| Default & Fallback Chain (per-scope) | **REAL** | Real `llm_routing_rules` CRUD |
| Free Mode Governor Limits (cost ceiling, GBNF) | **PARTIAL** | Settings persist; `grammar_constrained` is read but GBNF is not actually enforced by `MockProvider`/OpenAI adapter |
| **LLM Fleet Health rows** | **FAKED** | Hardcoded "Local Mock: ACTIVE / OpenRouter: STANDBY / OpenCode Zen: DISABLED" |
| **MCP Connection Manager** | **FAKED IF DB EMPTY** | Defaults from `system.ts` |
| **Routing Alerts panel** | **REAL BUT RARELY POPULATES** | Only `ProviderHealthState` events; the `alerts` array is only fed on actual fetch failures |

### ScopeLogicDashboard (Interview → DAG)

| Widget | Real? | Notes |
|---|---|---|
| Bounded Interview Pipeline | **REAL** | `/api/scopelogic/prompt` runs through `RouteSwitch` if LLM configured, falls back to 7 hardcoded static questions (`interview.ts`) |
| Stage proposal to PortGrid | **REAL** | Posts to `/api/system/proposals/stage` and auto-navigates |
| Verify Validator pass | **REAL** | `ValidatorLogic.validate()` blocks unsafe shell-exec prompts |
| **Confidence & Triage Ledger** | **FAKED INITIAL** | `useState({ score: 98.4, alerts: [] })` — never recomputed |
| **System Prompt Governance** | **FAKED** | Hardcoded `"v3.2.1"`, `"PASSING (398 tests)"` |
| Behavioral Assertion toggles | **PARTIAL** | Visual state only; no behavioral enforcement |
| Council Mode thresholds | **PARTIAL** | Saved to settings; Council-mode wiring is thin |

### ScoutDaemonDashboard (Background Sensing)

| Widget | Real? | Notes |
|---|---|---|
| SSE-driven Ambient state (passive / active / quarantine / sleeping) | **REAL** | Derives from `data.utilization` of `/api/system/metrics` |
| Hardware Telemetry (CPU %, Temp °C, Load, State) | **REAL** | `si.cpuTemperature()` on backend |
| Promote → PortGrid | **REAL** | `/api/todos/promote` inserts sentinel project/run/task + `os_todos` row |
| Scout Research Drafts (OKF Quarantine) | **REAL** | `/api/okf/scout-drafts` + promote/reject |
| Kill Switch (maxWorkers=0 / restore) | **REAL** | Direct API calls |
| Predictive Early Termination (AgentStop) | **PARTIAL** | Threshold slider saved; `AgentStopSupervisor` default `thresholdH: -1.0` (effectively never triggers by config); only fires on heuristic "low token count" output |
| Sensory modalities (SSE / polling / manual) | **PARTIAL** | Save only |

### CerebroDashboard (Memory)

| Widget | Real? | Notes |
|---|---|---|
| Learning Approvals queue | **REAL** | `/api/cerebro/learning-approvals` approve/reject |
| Vector Browser & Topology search | **REAL** | `/api/cerebro/vector-search` falls back to keyword scoring when no embeddings configured |
| Cerebro Health status | **REAL** | `vector_count` from SQLite, status derived from `lastReflection` age |
| Pin high-confidence memories | **REAL** | Updates `last_accessed_at` for `access_count ≥ 3` |
| OKF Knowledge Graph / Mindmap | **REAL** | Same search → ReactFlow graph as PortGrid |
| **Habituation Decay** | **FAKED COUNTERS** | "Nearing Decay: 0", "Pruned (30d): 0" hardcoded |
| **Global Knowledge Base** | **FAKED LIST** | 3 hardcoded doc names |
| Retrieval Fallback Configuration | **PARTIAL** | Slider values saved; `keywordFallback`, `minSimilarity` are read inline in `vector-search` route, but `keywordBaseScore` / `keywordMatchBoost` are **not** referenced in `core/memory/cerebro/vector.ts` |

---

## 5. Functional Gaps (Promised But Not Yet Wired)

1. **Council / multi-model consensus** — backend exists (`triage.ts`, `council.ts`), but only `MockProvider` and the test mocks show consistent results in production shapes.
2. **AgentStopSupervisor** — quality heuristic counts output `< 10 tokens` as failure; configurable threshold has no effective default.
3. **GBNF grammar-constrained decoding** — `OKF_CONCEPT_EXTRACTION_GBNF` grammar exists; `MockProvider` ignores it; `OpenAICompatibleProvider` post-hoc tries `JSON.parse` after extracting the first `[ … ]` block (`okf/generator.ts`). True token-level masking is not actually applied.
4. **Agent permission archetypes** — defined functionally in code? read by anyone in the worker's `dispatch.ts`? **No enforcement path verified.** Only the Setting UI reads/writes them.
5. **PathBrowser for `llama-cpp` model paths** — works for projects; no equivalent guard for `llama-cpp` model paths (just a byte/text field with a browser).
6. **Tri-Modal Context Router** — `memory/context-router.ts` works for `gitnexus` and `vector`; an empty result on `gitnexus` silently degrades. The README/plan mentioned a real GitNexus MCP; only the adapter stub (`gitnexus-client.ts:queryCodeStructure`) is exercised here.
7. **SSE management** — many dashboards open multiple `EventSource` connections and never abort them on unmount (e.g., `RunHistory` polls but does not close between active run selections).
8. **Developer-mode enforcement** — `DeveloperModeContext` saves a toggle but only a handful of components gate output on it (`ScopeLogicDashboard`, `NodeOutputInspector`, `IntentPreview`, `SettingsModal`). The bulk of the UI ignores it.

---

## 6. Bottom Line

- **The skeleton is real:** SQLite, SSE, Docker-grade `bwrap` terminal, real DAG execution, real provider CRUD, real OKF indexing, real backup/restore, real scheduling. There is a *real* product here.
- **Many dashboard numbers are theatre:** Mentrix scores, decay counters, fleet health rows, governance test pass counts, the "3 global docs" list are hand-typed to look finished. They'll fool a casual observer; they'll fail scrutiny the moment someone tries to act on them.
- **`MockProvider` is your friend and your enemy:** every dashboard static is roughly what you'd see if you launched with *no LLM configured* — green, populated, completely detached from real model behavior. The first thing on your hardening list is gating ANY of these fakes on `process.env.NEUROSYNC_LLM_BASE_URL` presence so they can't masquerade as real telemetry.

### Recommended first hardening sweep

1. Replace `Math.random()` jitter in `BaseVaultDashboard.tsx` with real `EXPLAIN`-timed SQLite queries.
2. Replace hardcoded Mentrix in `CoreExecDashboard.tsx` with a real test-count query (`vitest --json --reporter=stream` parse).
3. Make ScopeLogic's `useState({ score: 98.4 })` recompute from `validateDAGProposal` / lint results.
4. Replace Cerebro's hardcoded global-doc list with a real `dirsync` over `~/.neurosync/global_okf/`.
5. Add a single Developer-Mode "reality overlay" that, when on, annotates every faked widget in red with the file path + line where the lie is hardcoded.

---

## Appendix: Audit Method

Files read for this report (all under `src/`):

- Entry: `package.json`, `vite.config.ts`, `tsconfig.json`, `vitest.config.ts`, `tailwind.config.js`, `postcss.config.js`, `src/ui/main.tsx`, `src/ui/App.tsx`, `src/ui/index.css`, `src/server/index.ts`
- Server routes (10): `src/server/routes/{telemetry,system,todos,projects,llm,cerebro,models,scheduler-list,coreexec-router,okf}.ts`
- Layout: `src/ui/layouts/OSLayout.tsx`
- Dashboards (8): `src/ui/views/{UnifiedMasterDashboard,CoreExecDashboard,BaseVaultDashboard,PortGridDashboard,RouteSwitchDashboard,ScopeLogicDashboard,ScoutDaemonDashboard,CerebroDashboard}.tsx`
- Components (~22): every file under `src/ui/components/`
- Core modules: `src/core/{basevault/db,coreexec/engine,scopelogic/interview,routeswitch/engine,routeswitch/providers,okf/generator,scoutdaemon/sse,portgrid/terminal-session,memory/context-router}.ts`

Pattern searches run:

- `Math.random|Math.floor(Math.random` across `src/ui/**` → 2 hits in `BaseVaultDashboard.tsx`
- `setInterval|setTimeout` across `src/ui/views/**` → 7 hits (all legitimate polling/refresh timers; no faking)
- `hardcoded|PASSING|398|1.2%|42ms` across `src/ui/views/**` → 5 hits in `ScopeLogicDashboard.tsx` and `CoreExecDashboard.tsx`
- `MOCK|mock|fake|stub` across `src/core/routeswitch/**` → all legitimate test fixtures + the real `MockProvider` fallback chain
- `TODO|FIXME|XXX|HACK` across `src/**` → 6 hits, all unit-test fixtures describing the `TODO_ESCALATED` SSE event, no orphan developer TODOs
