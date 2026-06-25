---
title: "Architecture Context"
status: current
owner: "williamdeldaymarketing"
last_updated: "2026-06-26"
review_cadence: "weekly"
source_of_truth: true
---

# Architecture Context

## Architecture Summary

NeuroSync Sovereign OS is engineered as a local-first, single-user, multi-project AI workflow platform. It treats every AI interaction as an atomic, transactional workload with absolute data sovereignty. The system is built as a single-repository, single-process application utilizing a **Node.js 22 / TypeScript / Hono / SQLite** stack, enforcing a rigid "Human-in-the-Loop" approval boundary where AI proposals are strictly draft-only until explicitly approved through the PortGrid canvas cockpit.

The server runs on port **3743** and serves both an API gateway and static UI assets (via `dist/ui` in production).

---

## Stack

| Layer | Technology | Role | Decision Status | Rationale |
| --- | --- | --- | --- | --- |
| Frontend | React 18 + `@xyflow/react` + Tailwind CSS 3.4 | PortGrid canvas UI, dashboards, approval cockpit | Approved | XYFlow provides visual DAG rendering; Tailwind + PostCSS handle dynamic class compilation (CDN script injection is forbidden). |
| Backend | Node.js 22 LTS / TypeScript / Hono | API routing, business logic, HTTP server on port 3743 | Approved | Lightweight, type-friendly, minimal runtime footprint. |
| Database | SQLite (`better-sqlite3`) + `sqlite-vec` extension | BaseVault local persistence, vector search for Cerebro | Approved | Zero-configuration local DB, WAL mode, FK constraints, `busy_timeout = 5000`. |
| Queue / Orchestration | CoreExec DAG Engine | Transactional task queue and DAG state machine | Approved | Durable, recoverable execution; tasks claimed via `BEGIN IMMEDIATE` locks. |
| AI / Models | RouteSwitch (`RouteSwitchEngine`) | Free-tier quota governor, provider routing, Council Mode | Approved | `FreeModeGovernor` enforces 100k-token default quota; falls back to `MockProvider` if offline. |
| Vector Memory | `sqlite-vec` (loaded into same SQLite DB) | Cerebro semantic memory retrieval | Approved | In-process vector search; degrades gracefully to keyword fallback if no embedding is provided. |
| Auth | Local single-user scoping | Workspace partitioning by `project_id` (TEXT PRIMARY KEY) | Approved | Simple, secure local isolation. Multi-tenancy deferred. |
| Observability | `scoutEmitter` (Node.js EventEmitter) + SSE | Real-time task/run status streaming to UI at `/api/scout/events` | Approved | Zero-dependency in-process pub/sub; 15s keep-alive heartbeat. |
| Scheduling | `node-cron` | Cron-based DAG scheduling via `initScheduler()` + `refreshJobs()` | Approved | Polls DB every 60s; validates DAG before registration via `validateDAGTemplate`. |
| Encryption | AES-256-GCM (`crypto.ts`) | API key encryption at rest in `.data/.master.key` | Approved | 32-byte random master key auto-generated on first run; stored in `.data/` (never in source control). |

---

## Module Inventory (Confirmed Source Files)

### `src/core/basevault/` — Data Persistence Layer
| File | Purpose |
| --- | --- |
| `db.ts` | SQLite DB initialization, `initDB()`, schema creation, `sqlite-vec` extension load, WAL + FK pragmas |
| `crypto.ts` | AES-256-GCM `encrypt()` / `decrypt()` using a locally-persisted 32-byte master key |
| `schema.ts` | Zod schemas: `WorkflowRunSchema`, `TaskSchema`, `ProjectSchema`, `partitionBySchema<T>()` helper |

**DB Schema Tables (verified in `db.ts`):**
- `projects` — id, name, workspace_path, created_at
- `workflows` — id, project_id, name, dag_template, cron_schedule, created_at
- `workflow_runs` — id, project_id, dag_layout, status, created_at
- `tasks` — id, run_id, status, claim_lease, output_data (+ composite index on `run_id, status`)
- `os_todos` — id, dag_node_id, severity, escalation_reason, required_action_type, status, created_at
- `cerebro_memories_meta` — id, content, type, last_accessed_at, access_count, created_at
- `cerebro_memories_vec` — virtual table via `vec0`, `embedding float[1536]`
- `cerebro_learning_approvals` — id, fact, confidence, status, source_run_id, created_at
- `system_settings` — key, value
- `model_benchmarks` — model_id, avg_latency_ms, avg_tps, failure_rate, total_runs

---

### `src/core/coreexec/` — DAG Execution Engine
| File | Purpose |
| --- | --- |
| `engine.ts` | `executeRun(runId)`: DAG traversal, task claiming loop, `workerPool.execute()` dispatch, `scoutEmitter` events, `os_todos` escalation on task failure |
| `queue.ts` | `claimTask()`: atomic `BEGIN IMMEDIATE` lock for task claiming |
| `sandbox.ts` | `CommandSandbox`: executes allowlisted bash commands; exports `ALLOWLIST` (named export consumed by `dispatch.ts`) |
| `dispatch.ts` | `classifyDirective(prompt)`: classifies free-form prompt into `shell | scrape | generic` action; URL detection, bash code-fence extraction, allowlist check |
| `worker.ts` | Worker thread handler: `WorkerInput` union (`kind: "legacy" \| "dag"`), routes to `CommandSandbox`, `StealthScraper`, or metadata echo |
| `worker-pool.ts` | `WorkerPool`: manages worker thread pool, `execute({taskId, prompt})`, `info.executingTasks` for throttling |
| `validateDAG.ts` | `validateDAGTemplate(str)` (scheduler path), `validateDAGProposal(obj)` (approve path), `escalateBlockedDAGToOsTodos()` (FK-safe HIGH sentinel insertion in single `db.transaction()`) |
| `scheduler.ts` | `initScheduler()`, `refreshJobs()` (polls DB every 60s, gates every row through `validateDAGTemplate` before cron registration), `_stopSchedulerLoopForTests()` |
| `memory-sweep.ts` | `sweepOrphanedWorkspaces()`: cleans up orphaned workspace directories on startup |
| `path-validator.ts` | SA-02 path containment validation (prevents directory traversal) |
| `scraping.ts` | `StealthScraper`: Python-based scraping execution |

**Engine Architecture (§2.1 — Three-Layer Separation):**
- `dispatch.ts` → prompt classification (what to do)
- `worker.ts` → action fan-out and exec wiring (how to do it)
- `engine.ts` → DAG traversal and worker pool dispatch (orchestration)

**Governor Integration:** `engine.ts` reads `systemConfig.maxWorkers` from `system.ts` route and throttles `tasksToDispatch = eligibleTasks.slice(0, availableSlots)`.

**Task Status Lifecycle:** `unclaimed` → `claimed` (with lease timestamp) → `completed` | `parked` (on error, creates `os_todos` row) | `failed`

**Run Status Lifecycle:** `pending` → `running` → `completed` | `failed` | `parked` | `blocked-by-validation`

---

### `src/core/scopelogic/` — Requirements Interview & DAG Generation
| File | Purpose |
| --- | --- |
| `interview.ts` | `ScopeLogicSession`: up to 8-round interview loop; `processUserInputAsync()` (LLM-driven) + `processUserInput()` (sync fallback); produces `DAGProposal { id, status: 'draft', nodes: [{id, dependencies, prompt}] }` |
| `validator.ts` | `ValidatorLogic.validate()`: Category A safety checks — SA-01/02 (no destructive SQL/shell), SA-04 (no `type: shell/exec`), SA-05 (agent whitelist), SA-06 (empty node guard), SA-07 (reserved label via `findReservedLabel`) |
| `schemas.ts` | Rationale-first JSON schema definitions |

**Safety Assertions (implemented in `validator.ts`):**
- **SA-01/SA-02:** Forbids `INSERT/UPDATE/DELETE/DROP/ALTER/TRUNCATE/REPLACE` and `bash/sh/zsh/eval/exec/rm -rf/sudo`
- **SA-04:** Forbids `type: shell` or `type: exec` node declarations
- **SA-05:** Whitelist: `['ScopeLogic', 'BaseVault', 'RouteSwitch', 'PortGrid', 'CoreExec', 'ScoutDaemon', 'ExternalAPI', 'SSH']`
- **SA-06:** Rejects empty proposals or nodes with empty prompts
- **SA-07:** Rejects any reference to reserved system-service labels (via `system-reserved.ts`)

**Reserved DAG Labels (`system-reserved.ts`, 7 labels):** `scopelogic`, `basevault`, `routeswitch`, `scoutdaemon`, `coreexec`, `portgrid`, `cerebro` — detected with word-boundary regex, case-insensitive.

---

### `src/core/routeswitch/` — Model Routing & Quota Enforcement
| File | Purpose |
| --- | --- |
| `governor.ts` | `FreeModeGovernor`: cumulative token quota (`canProceed`), per-call history with provider attribution, `getUsage24h()` (prune-on-read, `UsageAggregate` with `byProvider` breakdown), `ESTIMATED_COST_PER_1K_TOKENS_USD = 0.002` |
| `engine.ts` | `RouteSwitchEngine`: wires `FreeModeGovernor` + `LLMProvider`; triggers `ConsensusSynthesizer.executeCouncilMode()` for high-risk prompts when ≥2 council providers configured; attributes council tokens to synthetic `'council'` provider id |
| `council.ts` | `ConsensusSynthesizer.executeCouncilMode()`: parallel provider execution; length-heuristic disagreement scoring; returns `ConsensusResult { content, confidence: 'High'\|'Medium'\|'Low', disagreementScore }` |
| `triage.ts` | `TriageClassifier.isHighRisk()`: keyword scan (`delete`, `drop`, `database`, `credentials`, `password`, `secret`, `token`, `admin`, `root`, `sudo`, `format`, `truncate`) triggers Council Mode |
| `router.ts` | `executeWithFallback()`: sequential fallback through provider chain (default: `groq/llama3-8b-8192` → `google/gemini-1.5-pro`); reads `ProviderHealthState` to skip exhausted models |
| `interceptor.ts` | `ProviderHealthState`: parses `x-ratelimit-remaining-tokens` / `anthropic-ratelimit-tokens-remaining` headers; marks provider exhausted at `< 1500` tokens; auto-resets via timeout |
| `discovery.ts` | `ModelDiscovery.fetchModels()`: queries OpenRouter for available models on startup |
| `agent-stop.ts` | `AgentStopSupervisor`: token-level logprob evaluation; aborts `AbortController` after N consecutive tokens below threshold H (default H = -1.0, N = 3) |
| `providers.ts` | `LLMProvider` interface, `MockProvider` implementation |
| `adapters/openai-compatible.ts` | `OpenAICompatibleProvider`: OpenAI-compatible HTTP adapter (supports OpenRouter, local LLMs) |
| `adapters/llama-cpp.ts` | `LlamaCppProvider`: local llama.cpp HTTP server adapter |

**Council Mode Trigger:** `TriageClassifier.isHighRisk(prompt)` returns `true` AND `councilProviders.length >= 2`. Council token cost = `estimatedTokens × (councilProviders.length + 1)`.

---

### `src/core/scoutdaemon/` — Real-Time Event Bus
| File | Purpose |
| --- | --- |
| `sse.ts` | `scoutEmitter` (EventEmitter), `scoutRouter` (Hono): SSE endpoint at `/api/scout/events`; 15s heartbeat; `/scout/heartbeat` POST resets idle detector |
| `parser.ts` | AST parser coordinator |
| `gitnexus-worker.ts` | Worker thread AST processing |
| `db-sync.ts` | Micro-batch DB sync |
| `idle.ts` | `idleDetector`: tracks user activity; triggers `ReflectionExecutor` after 30-minute idle threshold |

**SSE Event Types emitted by `scoutEmitter`:**
- `TASK_STATUS` — `{ type, runId, taskId, status, output? }`
- `RUN_STATUS` — `{ type, runId, status }`
- `TODO_ESCALATED` — `{ type, todoId, workflowId, sentinelTaskId, runId, origin, reason, timestamp }`

---

### `src/core/scoutlogic/` — Model Intelligence & Benchmarking
| File | Purpose |
| --- | --- |
| `benchmarker.ts` | `Benchmarker.recordRun()`: EMA-style latency/TPS tracking via `model_benchmarks` table (online incremental average) |
| `classifier.ts` | `classifyComplexity(prompt)`: heuristic returning `'trivial' \| 'logical' \| 'complex'` based on keyword + length |
| `dynamic-router.ts` | `selectOptimalModel()`: scores models by complexity × priority (`speed \| cost \| intelligence`) using `model_benchmarks` data |

---

### `src/core/memory/cerebro/` — Long-Term Memory Substrate
| File | Purpose |
| --- | --- |
| `vector.ts` | `CerebroVectorStore`: `insert()` (meta + optional `float[1536]` embedding into `sqlite-vec`), `search()` (vector KNN if embedding provided; keyword fallback engine otherwise: `similarity = 0.7 + matchCount × 0.05`) |
| `reflection.ts` | `ReflectionExecutor`: background idle daemon (30-min threshold, checks every 5 min); runs reflection cycle extracting user preferences from chat history; duplicate suppression via `similarity > 0.85` check |
| `habituation.ts` | Access-frequency habituation logic |

**Cerebro Memory Pipeline:** `insert()` → `cerebro_memories_meta` + (optionally) `cerebro_memories_vec` → `search()` dispatches to `_vectorSearch()` or `_keywordFallbackSearch()` → `ReflectionExecutor` consolidates during idle.

---

### `src/server/` — HTTP Gateway (Hono, port 3743)
| Route Prefix | File | Endpoints |
| --- | --- | --- |
| `/api/scout` | `scoutdaemon/sse.ts` | `GET /events` (SSE), `POST /heartbeat` |
| `/api/system` | `routes/system.ts` | Settings, telemetry, `systemConfig.maxWorkers` (used by engine throttle) |
| `/api/todos` | `routes/todos.ts` | `os_todos` CRUD |
| `/api/projects` | `routes/projects.ts` | Project CRUD |
| `/api/llm` | `routes/llm.ts` | `POST /config`, `GET /usage` (24h aggregate from `FreeModeGovernor.getUsage24h()`) |
| `/api/cerebro` | `routes/cerebro.ts` | `GET /health` (memory count + staleness), learning approvals |
| `/api/models` | `routes/models.ts` | Available model list |
| `/api/scheduler` | `routes/scheduler-list.ts` | `GET /jobs` (cron-scheduled workflows + next tick probe) |
| `/api/coreexec` | `routes/coreexec-router.ts` | `POST /approve` (validator-gated), `GET /run/:runId/status`, `POST /retry/:runId` |
| `/api/basevault/runs` | `server/index.ts` (inline) | `GET` runs list with `partitionBySchema` validation |
| `/api/basevault/run/:runId` | `server/index.ts` (inline) | `GET` run detail + tasks with schema partition |
| `/api/scopelogic/*` | `server/index.ts` (inline) | `GET /history`, `POST /prompt`, `POST /reset` |
| `/api/routeswitch/*` | `server/index.ts` (inline) | `POST /test`, `POST /provider` |

**Architectural Enforcement:** `coreexecRouter` is mounted via `app.route()` (precedence over inline handlers). Inline `/api/coreexec/*` handlers are explicitly forbidden in `server/index.ts` comments because they would bypass `validateDAGProposal`.

---

### `src/ui/` — PortGrid React Frontend
| Path | Component | Purpose |
| --- | --- | --- |
| `App.tsx` | Root app | `@xyflow/react` canvas, ScopeLogic chat, run history, SSE subscription, DAG injection, approve/reset flow, NodeOutputInspector, SettingsModal |
| `components/ApprovalCockpit.tsx` | ApprovalCockpit | Human-in-the-loop approve/reject for pending DAG proposals |
| `components/AgentKPIStrip.tsx` | AgentKPIStrip | Live KPI metrics via `/api/system/metrics` SSE |
| `components/AutonomyDials.tsx` | AutonomyDials | Autonomy level controls |
| `components/CerebroHealthWidget.tsx` | CerebroHealthWidget | Polls `/api/cerebro/health` every 10s; shows memory count + staleness status |
| `components/CronSummary.tsx` | CronSummary | Polls `/api/scheduler/jobs`; shows scheduled workflows + next tick |
| `components/GovernorUI.tsx` | GovernorUI | Governor quota + worker throttle controls |
| `components/IntentPreview.tsx` | IntentPreview | DAG proposal intent preview |
| `components/LearningApprovalsQueue.tsx` | LearningApprovalsQueue | Cerebro learning approval queue |
| `components/NodeOutputInspector.tsx` | NodeOutputInspector | Task output viewer, retry/edit-rerun actions |
| `components/NotificationCenter.tsx` | NotificationCenter | `os_todos` escalation surface; `TODO_ESCALATED` events |
| `components/ProjectManager.tsx` | ProjectManager | Project workspace CRUD |
| `components/RouteSwitchConfig.tsx` | RouteSwitchConfig | Provider configuration form |
| `components/RoutingDials.tsx` | RoutingDials | Routing priority controls (speed/cost/intelligence) |
| `components/RunHistory.tsx` | RunHistory | Run list polling `/api/basevault/runs`; handles `blocked-by-validation` status |
| `components/ScopeLogicChat.tsx` | ScopeLogicChat | Interview chat interface → produces `DAGProposalPayload` |
| `components/SettingsModal.tsx` | SettingsModal | Settings overlay |
| `components/Statusline.tsx` | Statusline | Live run status indicator |
| `components/ThemeContext.tsx` | ThemeContext | Theme provider (light/dark) |
| `components/ThemeToggle.tsx` | ThemeToggle | Theme toggle button |
| `views/UnifiedMasterDashboard.tsx` | UnifiedMasterDashboard | Top-level dashboard: KPI strip + 2×2 grid (Action Center, CoreExec+Governor, Cerebro Health, Cron Summary, Exec Ledger) |
| `views/BaseVaultDashboard.tsx` | BaseVaultDashboard | SQLite schema and run history view |
| `views/CerebroDashboard.tsx` | CerebroDashboard | Cerebro memory management |
| `views/CoreExecDashboard.tsx` | CoreExecDashboard | DAG execution monitoring |
| `views/RouteSwitchDashboard.tsx` | RouteSwitchDashboard | Provider config, 24h usage (5s poll), cost estimate |
| `views/ScopeLogicDashboard.tsx` | ScopeLogicDashboard | Interview session + proposal management |
| `views/ScoutDaemonDashboard.tsx` | ScoutDaemonDashboard | ScoutDaemon event stream view |

---

## System Boundaries

| Boundary | Owns | Must Not Own | Public Interface |
| --- | --- | --- | --- |
| `src/core/coreexec` | DAG workflow execution, task queue, retries, scheduler, worker pool, path validation, sandbox | Model selection, UI rendering, DB schema definitions | `executeRun()`, `validateDAGTemplate()`, `validateDAGProposal()`, `escalateBlockedDAGToOsTodos()` |
| `src/core/basevault` | SQLite schema, data persistence, Zod schemas, `partitionBySchema`, AES-256-GCM encryption | Model API calls, task scheduling, routing rules | `db`, `initDB()`, `encrypt()`, `decrypt()`, `partitionBySchema()` |
| `src/core/routeswitch` | Provider adapters, quota governor, council mode, fallback cascade, rate-limit interception | DB storage, DAG execution state | `RouteSwitchEngine.execute()`, `FreeModeGovernor`, `executeWithFallback()` |
| `src/core/scopelogic` | Requirements interview, DAG proposal generation, Category A safety validation | Model routing, DB writes, task execution | `ScopeLogicSession`, `ValidatorLogic.validate()` |
| `src/core/scoutdaemon` | SSE event bus, idle detection, AST parsing, DB sync | Business logic, model calls | `scoutEmitter`, `scoutRouter` |
| `src/core/scoutlogic` | Model benchmarking, task complexity classification, optimal model selection | UI rendering, DB schema definitions | `Benchmarker`, `classifyComplexity()`, `selectOptimalModel()` |
| `src/core/memory/cerebro` | Long-term memory storage, vector/keyword search, idle reflection | Task execution, model routing | `CerebroVectorStore`, `ReflectionExecutor` |
| `src/ui` | React frontend, PortGrid canvas, dashboards | Raw DB queries, SQLite driver imports | React component tree |
| `src/server` | HTTP routing (Hono), API gateway, singleton initialization | Core business logic (delegated to `src/core/*`) | Hono app on port 3743 |

---

## Storage Model

| Data Type | Table | Owner | Retention | Notes |
| --- | --- | --- | --- | --- |
| Projects | `projects` | BaseVault | Indefinite | workspace_path stored here |
| Workflow Templates | `workflows` | BaseVault/CoreExec | Indefinite | dag_template + cron_schedule |
| Workflow Runs | `workflow_runs` | CoreExec | Indefinite | dag_layout snapshot; WAL mode |
| Tasks | `tasks` | CoreExec | Per run | Composite index on (run_id, status) |
| Escalation Todos | `os_todos` | CoreExec | Until resolved | FK → tasks → workflow_runs |
| Cerebro Memory Meta | `cerebro_memories_meta` | Cerebro | Decays on access count | Keyword indexed |
| Cerebro Memory Vectors | `cerebro_memories_vec` (virtual) | Cerebro | Paired with meta | `float[1536]` via sqlite-vec |
| Learning Approvals | `cerebro_learning_approvals` | Cerebro | Until approved/rejected | Human-gated |
| System Settings | `system_settings` | System | Indefinite | key/value pairs |
| Model Benchmarks | `model_benchmarks` | ScoutLogic | Indefinite | EMA latency/TPS/failure_rate |

---

## Auth and Access Model

- **Authentication:** Local single-user session. No cloud credentials. No password storage.
- **Authorization:** All requests implicitly scoped to local filesystem.
- **Ownership:** All workflows, runs, and tasks carry a `project_id` FK to `projects.id`.
- **Secrets Security:** API keys encrypted at rest with AES-256-GCM (`.data/.master.key`). Never stored in plaintext in DB, logs, or source control.
- **Privileged actions:** DAG approval, schema migration, external model configuration require explicit human action in PortGrid.

---

## Architecture Invariants

> These rules must not be violated without a documented ADR.

1. **Human-in-the-Loop:** AI proposals are strictly `status: 'draft'`; no AI-generated node executes without human confirmation via `/api/coreexec/approve`.
2. **Strict Project Isolation:** Every run, task, todo, and memory node must carry a validated `project_id` FK.
3. **Transactional Task Claims:** `claimTask()` uses `BEGIN IMMEDIATE` locks to prevent race conditions.
4. **Offline-First Sovereignty:** System functions entirely offline. `MockProvider` is the default; LLM keys are optional.
5. **Secrets Security:** API keys must use `encrypt()`/`decrypt()` from `crypto.ts`. Never log, store plaintext, or expose in HTTP responses.
6. **Immutable Execution Snapshots:** `dag_layout` in `workflow_runs` is an immutable snapshot. Retries re-validate `dag_layout` via `validateDAGTemplate` before executing.
7. **Single Validator Gate:** Both `refreshJobs()` (cron path) and `/api/coreexec/approve` (interactive path) call through `validateDAGTemplate` / `validateDAGProposal`. No bypass allowed — inline coreexec handlers in `server/index.ts` are explicitly forbidden.
8. **Schema-as-Truth:** `WorkflowRunSchema` / `TaskSchema` (Zod, `src/core/basevault/schema.ts`) are the single source of truth for status enums. HTTP endpoints use `partitionBySchema<T>()` — no open-coding of safeParse loops.
9. **Reserved Label Prohibition:** System service labels (`scopelogic`, `basevault`, `routeswitch`, `scoutdaemon`, `coreexec`, `portgrid`, `cerebro`) cannot appear in DAG node prompts. Enforced by `ValidatorLogic` (server) and `App.tsx handleProposal` (client defense-in-depth).

---

## Validation Architecture (§3.4)

```
DAG Input (template string or parsed object)
    ↓
validateDAGTemplate() — parse → validateDAGProposal()   [scheduler path]
validateDAGProposal()                                    [approve path]
    ↓
ValidatorLogic.validate() — SA-01..SA-07 checks
    ↓
PASS → register cron / create workflow_run + tasks
FAIL → escalateBlockedDAGToOsTodos()
         └─ db.transaction(): INSERT projects(sentinel) + workflow_runs(blocked) + tasks(blocked) + os_todos(HIGH)
         └─ scoutEmitter.emit('TODO_ESCALATED', ...)
```

---

## Known Architectural Risks

| Risk | Impact | Likelihood | Mitigation |
| --- | --- | --- | --- |
| Concurrent DB lock collision | High | Low | WAL + `busy_timeout = 5000` + `BEGIN IMMEDIATE` claims |
| API key leakage in logs | Critical | Low | AES-256-GCM `encrypt()` at rest; Pino redaction at log boundary |
| Context bleed between projects | Critical | Low | FK-validated `project_id` on all workflow/task writes |
| Schema-dirty DB rows corrupting UI | High | Low | `partitionBySchema<T>()` at every `/api/basevault/*` boundary |
| Malicious DAG template bypassing validator | High | Low | Both cron and interactive paths converge on `validateDAGProposal`; inline bypass handlers forbidden by enforced comment |
| Worker thread OOM | Medium | Low | `NODE_OPTIONS="--max-old-space-size=1024"` + `UV_THREADPOOL_SIZE=3` per system rules |

---

## Integration Model

| Integration | Direction | Protocol | Auth | Failure Mode | Fallback |
| --- | --- | --- | --- | --- | --- |
| OpenRouter | Outbound | HTTPS JSON | `OPENROUTER_API_KEY` (optional) | 429 rate limit or missing key | `MockProvider` (offline mode) |
| Local llama.cpp | Outbound | HTTP JSON | None (local) | Server not running | `MockProvider` |
| `sqlite-vec` extension | In-process | Loaded via `sqliteVec.load(db)` | N/A | Extension not found | Keyword fallback search |
| ScoutDaemon SSE | Inbound (browser) | SSE `text/event-stream` | None (local) | Client disconnect | Auto-reconnect by browser |

---

## Implementation Log (Phase Summary)

| Section | Description | Status |
| --- | --- | --- |
| §1.2 | Reserved-label detection (`system-reserved.ts` + SA-07 in `validator.ts`) | ✅ Complete |
| §2.1 | Engine-to-Sandbox wiring: `dispatch.ts` classifyDirective, `worker.ts` union dispatch, `engine.ts` PromptedDAGNode | ✅ Complete |
| §3.1 | Master dashboard widgets: AgentKPIStrip, CronSummary, CerebroHealthWidget, UnifiedMasterDashboard refactor | ✅ Complete |
| §3.2 | RouteSwitch 24h token/cost counters: `getUsage24h()`, `/api/llm/usage`, RouteSwitchDashboard live poll | ✅ Complete |
| §3.3 | Runtime parse gate: `partitionBySchema<T>()`, `/api/basevault/runs` + `/api/basevault/run/:runId` validation | ✅ Complete |
| §3.4 | Shared DAG validator gate: `validateDAG.ts`, `coreexec-router.ts`, scheduler validator gate, `blocked-by-validation` sentinel FK chain | ✅ Complete |

---

## Change Log

| Date | Agent | Change |
| --- | --- | --- |
| 2026-06-26 | Buffy | §3.4 — validateDAG.ts shared gate; escalateBlockedDAGToOsTodos; coreexec-router.ts; scheduler validator gate |
| 2026-06-26 | Buffy | §3.3 — partitionBySchema; /api/basevault/* runtime-parse; schema.ts canonical Zod schemas |
| 2026-06-26 | Buffy | §3.2 — FreeModeGovernor getUsage24h; /api/llm/usage; RouteSwitchDashboard live poll |
| 2026-06-26 | Buffy | §3.1 — AgentKPIStrip, CronSummary, CerebroHealthWidget, UnifiedMasterDashboard refactor |
| 2026-06-26 | Buffy | §2.1 — dispatch.ts classifyDirective; worker.ts union; engine.ts PromptedDAGNode |
| 2026-06-26 | Buffy | §1.2 — system-reserved.ts; SA-07 in validator.ts; findReservedLabel word-boundary regex |
| 2026-06-26 | Doc Agent | Full architecture audit and rewrite to match confirmed source files |
