# NeuroSync Sovereign OS — File Manifest

This file lists every documentation file and source module in the NeuroSync Sovereign OS project. Updated to reflect the confirmed implemented state as of Phase 13 (2026-06-26).

---

## Context Files (Agent-Readable — Read First)

| File | Purpose | Status |
| --- | --- | --- |
| `context/project-overview.md` | Product intent, feature set, goals (all ✅ achieved), scope, success criteria | Current |
| `context/architecture.md` | Full module inventory, DB schema, server routes, UI components, system boundaries, invariants | Current — **Source of Truth** |
| `context/code-standards.md` | Coding rules, naming, validation patterns, test standards, prohibited patterns | Current |
| `context/ai-workflow-rules.md` | Agent operating rules, GitNexus workflow, DAG execution rules | Current |
| `context/ui-context.md` | Theme, CSS tokens, component registry (19 components + 7 views), SSE integration | Current |
| `context/progress-tracker.md` | Phase completion (§1.2–§3.4), open questions, architecture decisions | Current |

## Working Copy Files

| File | Purpose |
| --- | --- |
| `context/architecture_working.md` | Change log for architecture.md |
| `context/project-overview_working.md` | Change log for project-overview.md |
| `context/ui-context_working.md` | Change log for ui-context.md |
| `context/ai-workflow-rules_working.md` | Change log for ai-workflow-rules.md |
| `context/code-standards_working.md` | Change log for code-standards.md |
| `context/progress-tracker_working.md` | Append-only session log |

## Implementation Specs

| File | Purpose |
| --- | --- |
| `context/specs/` | Implementation unit specs (one spec per build unit) |

---

## Core Source Modules (`src/core/`)

### BaseVault (`src/core/basevault/`)
| File | Purpose |
| --- | --- |
| `db.ts` | SQLite init, `initDB()`, schema creation, `sqlite-vec` load, WAL pragmas |
| `crypto.ts` | AES-256-GCM `encrypt()` / `decrypt()`, `.data/.master.key` management |
| `schema.ts` | `WorkflowRunSchema`, `TaskSchema`, `ProjectSchema` (Zod), `partitionBySchema<T>()` |

### CoreExec (`src/core/coreexec/`)
| File | Purpose |
| --- | --- |
| `engine.ts` | `executeRun()`, `DAGNode`, `PromptedDAGNode`, `DAGLayout`, worker pool dispatch |
| `queue.ts` | `claimTask()` with `BEGIN IMMEDIATE` lock |
| `sandbox.ts` | `CommandSandbox`, exports `ALLOWLIST` (named export) |
| `dispatch.ts` | `classifyDirective()`: `shell \| scrape \| generic` classification |
| `worker.ts` | Worker thread handler, `WorkerInput` discriminated union |
| `worker-pool.ts` | `WorkerPool`, `execute({taskId, prompt})`, `info.executingTasks` |
| `validateDAG.ts` | `validateDAGTemplate()`, `validateDAGProposal()`, `escalateBlockedDAGToOsTodos()` |
| `scheduler.ts` | `initScheduler()`, `refreshJobs()`, `_stopSchedulerLoopForTests()` |
| `memory-sweep.ts` | `sweepOrphanedWorkspaces()` |
| `path-validator.ts` | SA-02 path containment |
| `scraping.ts` | `StealthScraper` |
| `engine.test.ts` | DAG traversal tests |
| `validateDAG.test.ts` | 26 validator + escalation tests |
| `scheduler.test.ts` | Cron scheduling + FK coverage |
| `worker.test.ts` | 10+ dispatch classification tests |
| `sandbox.test.ts` | Sandbox execution tests |
| `memory-sweep.test.ts` | Sweep tests |
| `queue.test.ts` | Claim tests |

### RouteSwitch (`src/core/routeswitch/`)
| File | Purpose |
| --- | --- |
| `governor.ts` | `FreeModeGovernor`, `getUsage24h()`, `ESTIMATED_COST_PER_1K_TOKENS_USD = 0.002` |
| `engine.ts` | `RouteSwitchEngine`, Council Mode trigger, provider wiring |
| `council.ts` | `ConsensusSynthesizer.executeCouncilMode()`, disagreement scoring |
| `triage.ts` | `TriageClassifier.isHighRisk()`, HIGH_RISK_KEYWORDS |
| `router.ts` | `executeWithFallback()`, sequential fallback chain |
| `interceptor.ts` | `ProviderHealthState`, rate-limit header parsing, exhaustion + auto-reset |
| `discovery.ts` | `ModelDiscovery.fetchModels()` (OpenRouter) |
| `agent-stop.ts` | `AgentStopSupervisor`, logprob threshold abort |
| `providers.ts` | `LLMProvider` interface, `MockProvider` |
| `adapters/openai-compatible.ts` | `OpenAICompatibleProvider` |
| `adapters/llama-cpp.ts` | `LlamaCppProvider` |
| `governor.test.ts` | 10 governor tests |
| `router.test.ts` | Fallback chain tests |
| `council.test.ts` | Council mode tests |
| `agent-stop.test.ts` | AgentStop tests |
| `routeswitch.test.ts` | Integration tests |
| `governor.test.ts` | Governor tests |

### ScopeLogic (`src/core/scopelogic/`)
| File | Purpose |
| --- | --- |
| `interview.ts` | `ScopeLogicSession` (8-round), `DAGProposal`, `GenerateFn` |
| `validator.ts` | `ValidatorLogic.validate()` — SA-01–SA-07 |
| `schemas.ts` | Rationale-first JSON schema definitions |

### ScoutDaemon (`src/core/scoutdaemon/`)
| File | Purpose |
| --- | --- |
| `sse.ts` | `scoutEmitter`, `scoutRouter`, SSE endpoint, heartbeat |
| `idle.ts` | `idleDetector`, 30-min idle threshold |
| `parser.ts` | AST parser coordinator |
| `gitnexus-worker.ts` | Worker thread AST |
| `db-sync.ts` | Micro-batch DB sync |

### ScoutLogic (`src/core/scoutlogic/`)
| File | Purpose |
| --- | --- |
| `benchmarker.ts` | `Benchmarker.recordRun()`, EMA latency/TPS in `model_benchmarks` |
| `classifier.ts` | `classifyComplexity()`: `trivial \| logical \| complex` |
| `dynamic-router.ts` | `selectOptimalModel()`: complexity × priority scoring |

### Memory / Cerebro (`src/core/memory/cerebro/`)
| File | Purpose |
| --- | --- |
| `vector.ts` | `CerebroVectorStore`: `insert()`, `search()`, vector KNN + keyword fallback |
| `reflection.ts` | `ReflectionExecutor`: idle daemon, preference extraction, duplicate suppression |
| `habituation.ts` | Access-frequency habituation |
| `vector.test.ts` | Vector store tests |
| `reflection.test.ts` | Reflection tests |
| `habituation.test.ts` | Habituation tests |

### System (`src/core/`)
| File | Purpose |
| --- | --- |
| `system-reserved.ts` | `RESERVED_DAG_LABELS` (7), `findReservedLabel()`, `isReservedDAGPrompt()` |
| `system-reserved.test.ts` | 15 label detection tests |

---

## Server (`src/server/`)

| File | Route | Purpose |
| --- | --- | --- |
| `index.ts` | — | Hono app, singleton init, inline `/api/basevault/*` + ScopeLogic + RouteSwitch routes |
| `routes/system.ts` | `/api/system` | Settings, telemetry, `systemConfig.maxWorkers` |
| `routes/todos.ts` | `/api/todos` | `os_todos` CRUD |
| `routes/projects.ts` | `/api/projects` | Project CRUD |
| `routes/llm.ts` | `/api/llm` | `POST /config`, `GET /usage` |
| `routes/cerebro.ts` | `/api/cerebro` | `GET /health`, learning approvals |
| `routes/models.ts` | `/api/models` | Model list |
| `routes/scheduler-list.ts` | `/api/scheduler` | `GET /jobs` (cron schedule list + next tick) |
| `routes/coreexec-router.ts` | `/api/coreexec` | `POST /approve`, `GET /run/:runId/status`, `POST /retry/:runId` |

---

## UI (`src/ui/`)

### Components (`src/ui/components/`)
| File | Component | Notes |
| --- | --- | --- |
| `AgentKPIStrip.tsx` | AgentKPIStrip | SSE metrics |
| `ApprovalCockpit.tsx` | ApprovalCockpit | DAG approve/reject |
| `AutonomyDials.tsx` | AutonomyDials | Autonomy controls |
| `CerebroHealthWidget.tsx` | CerebroHealthWidget | Memory health poll |
| `CronSummary.tsx` | CronSummary | Scheduled jobs |
| `GovernorUI.tsx` | GovernorUI | Governor + worker throttle |
| `IntentPreview.tsx` | IntentPreview | DAG intent display |
| `LearningApprovalsQueue.tsx` | LearningApprovalsQueue | Cerebro approvals |
| `NodeOutputInspector.tsx` | NodeOutputInspector | Task output + retry |
| `NotificationCenter.tsx` | NotificationCenter | os_todos / escalation surface |
| `ProjectManager.tsx` | ProjectManager | Project CRUD |
| `RouteSwitchConfig.tsx` | RouteSwitchConfig | Provider config form |
| `RoutingDials.tsx` | RoutingDials | Routing priority |
| `RunHistory.tsx` | RunHistory | Run list (polls /api/basevault/runs) |
| `ScopeLogicChat.tsx` | ScopeLogicChat | Interview chat |
| `SettingsModal.tsx` | SettingsModal | Settings overlay |
| `Statusline.tsx` | Statusline | Run status bar |
| `ThemeContext.tsx` | ThemeContext | Theme provider |
| `ThemeToggle.tsx` | ThemeToggle | Sun/Moon toggle |

### Views (`src/ui/views/`)
| File | View |
| --- | --- |
| `UnifiedMasterDashboard.tsx` | Master dashboard (KPI strip + 2×2 grid) |
| `BaseVaultDashboard.tsx` | DB schema + run history |
| `CerebroDashboard.tsx` | Memory management |
| `CoreExecDashboard.tsx` | DAG execution monitor |
| `RouteSwitchDashboard.tsx` | Provider config + 24h usage |
| `ScopeLogicDashboard.tsx` | Interview session |
| `ScoutDaemonDashboard.tsx` | SSE event stream |

---

## Root Configuration

| File | Purpose |
| --- | --- |
| `package.json` | Node.js dependencies and scripts |
| `tsconfig.json` | TypeScript strict config |
| `vite.config.ts` | Vite build config |
| `tailwind.config.js` | Tailwind CSS 3.4 config |
| `postcss.config.js` | PostCSS config |
| `.env.example` | Example env vars (NEUROSYNC_LLM_BASE_URL, NEUROSYNC_LLM_API_KEY, NEUROSYNC_LLM_MODEL) |
| `AGENTS.md` | Root project AI agent instructions (GitNexus rules, system resource rules) |
| `CLAUDE.md` | Claude Code entry file |
| `.gitnexus/` | GitNexus local graph (1358 symbols, 2205 relationships) |
| `.data/` | Runtime data directory: `neurosync.db`, `.master.key` (gitignored) |
| `Logos/` | Brand logos: `PORTGRIDLogo.png`, etc. |
| `public/` | Static assets |

---

## Documentation (deeper planning)

| Folder | Purpose |
| --- | --- |
| `docs/docs/00-foundation/` | Master index, project charter, research foundation |
| `docs/docs/01-product/` | Problem statement, personas, requirements, MVP |
| `docs/docs/02-architecture/` | Architecture blueprint, C4 views, data model |
| `docs/docs/03-engineering/` | Codebase standards, API contracts, environment config |
| `docs/docs/04-security/` | Security model, threat model, access control |
| `docs/docs/05-delivery/` | Milestone roadmap, release plan |
| `docs/docs/06-quality/` | Test strategy, acceptance checklists |
| `docs/docs/07-operations/` | Runbook, observability, incident response |
| `docs/docs/08-research/` | Research logs, cost model, vendor evaluation |
| `docs/docs/09-governance/` | Decision log, risk register, assumption log |
| `docs/templates/` | ADR, RFC, review checklists |
| `docs/grammar/` | GBNF grammar files |
| `docs/Phase9/` | Phase 9 planning artifacts |
