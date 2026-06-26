---
title: "Project Overview"
status: current
owner: "williamdeldaymarketing"
last_updated: "2026-06-26"
review_cadence: "weekly"
source_of_truth: true
---

# NeuroSync Sovereign OS

## Overview

NeuroSync Sovereign OS is a **local-first, single-user, multi-project AI workflow cockpit** designed to execute transactional AI workloads without cloud dependencies. Designed for privacy-first operators, beginner hobbyists, and freelancers who prioritize absolute data sovereignty and zero infrastructure costs, the system manages AI actions as discrete, auditable units of work — claimed, executed, recorded, recoverable, and auditable within a strict project scope.

The system is fully operational as a **Vite + React frontend** (PortGrid canvas) + **Node.js/Hono backend** (API gateway on port 3743) + **SQLite** (BaseVault persistence). It is not a mock; all modules listed in this document are implemented and verified against source files.

## One-Sentence Product Definition

> `NeuroSync Sovereign OS helps privacy-first operators execute zero-cost, data-sovereign AI workflows by treating every AI interaction as a transactional SQLite-backed DAG workload, with human-in-the-loop approval gates and an offline fallback model, without cloud dependencies or financial token burden.`

---

## Goals

| # | Goal | Measure | Target | Status |
| ---: | --- | --- | --- | --- |
| 1 | Local-first single-user multi-project AI workflow cockpit | 100% offline, local-only execution | Full functionality without internet | ✅ Achieved |
| 2 | Enforce zero-budget Free Mode Governor | `FreeModeGovernor.canProceed()` blocks calls exceeding quota | 100% blocked unless explicitly unlocked; defaults to `MockProvider` | ✅ Achieved |
| 3 | Durable execution and restart recovery | Task claim leases + `status='unclaimed'` recovery | 100% recovery without duplicate effects | ✅ Achieved |
| 4 | Human-in-the-loop approval gate | No DAG executes without `POST /api/coreexec/approve` | All proposals are `status: 'draft'` until user confirms | ✅ Achieved |
| 5 | Category A safety boundary enforcement | `ValidatorLogic.validate()` SA-01–SA-07 checks | All DAG proposals pass validator before any DB write | ✅ Achieved |

---

## Primary Users

| User Type | Need | Current Pain | Success Looks Like |
| --- | --- | --- | --- |
| Beginner Hobbyists / Freelancers | Privacy-first workflows, zero-cost local execution | Financial burden of paid API keys, complex setup, data leaks to public clouds | Execute local-only, zero-cost AI workflows securely, with ScopeLogic guiding goal decomposition |
| High-Security Technical Operators | Verifiable confidence, programmatic determinism, transactional safety | Unreliable request-response loops, amnesia of session context | Durable execution of multi-node DAGs with SQLite transaction logs, 24h usage dashboards, and recovery from partial runs |

---

## Core User Flow

1. User opens PortGrid canvas (`App.tsx`) in the browser.
2. User configures a local Project Workspace (via `ProjectManager`) with an isolated `project_id`.
3. User interacts with the ScopeLogic chat interface (`ScopeLogicChat`), which runs an up to 8-round interview via `ScopeLogicSession`.
4. ScopeLogic generates a draft DAG proposal (`status: 'draft'`) validated by `ValidatorLogic` (SA-01–SA-07).
5. User reviews the DAG rendered on the `@xyflow/react` canvas and approves via `ApprovalCockpit`.
6. Approval POSTs to `/api/coreexec/approve`, which re-validates via `validateDAGProposal` then inserts `workflow_runs` + `tasks` rows.
7. `executeRun()` traverses the DAG, dispatching tasks to the worker pool via `classifyDirective()` (shell/scrape/generic).
8. Live status updates stream to the canvas via SSE (`/api/scout/events` → `scoutEmitter`).
9. User receives core value when the run completes; results are inspectable via `NodeOutputInspector`.
10. Failed or blocked tasks create `os_todos` entries surfaced in `NotificationCenter`.

---

## Implemented Feature Set

### Core Execution
- **CoreExec DAG Engine** (`engine.ts`): Asynchronous state machine with task claim leases (5-min timeout), parallel eligible-task dispatch via worker pool, `parked` status for recoverable failures.
- **Worker Pool** (`worker-pool.ts`, `worker.ts`): Worker threads execute `shell` (allowlisted bash via `CommandSandbox`), `scrape` (Python + `StealthScraper`), or `generic` (metadata echo) based on `classifyDirective()` output.
- **Cron Scheduler** (`scheduler.ts`): `node-cron`-based scheduling; polls DB every 60s; gates every DAG through `validateDAGTemplate` before registration.
- **Shared DAG Validator** (`validateDAG.ts`): Single gate for both cron and interactive paths; `escalateBlockedDAGToOsTodos()` creates FK-safe sentinel rows.

### Safety & Security
- **Category A Validator** (`validator.ts`): SA-01–SA-07 including reserved label detection.
- **Reserved Label Registry** (`system-reserved.ts`): 7 reserved labels (`scopelogic`, `basevault`, `routeswitch`, `scoutdaemon`, `coreexec`, `portgrid`, `cerebro`) with word-boundary regex, case-insensitive.
- **AES-256-GCM Encryption** (`crypto.ts`): Provider API keys encrypted at rest in `.data/.master.key`.
- **Path Containment** (`path-validator.ts`): SA-02 directory traversal prevention.
- **Schema Partition Gate** (`schema.ts`, `partitionBySchema<T>()`): Runtime Zod validation at every `/api/basevault/*` HTTP boundary; dirty rows logged and partitioned out.

### Model Routing
- **FreeModeGovernor** (`governor.ts`): Token quota + 24h usage history with per-provider breakdown; `ESTIMATED_COST_PER_1K_TOKENS_USD = 0.002`.
- **RouteSwitchEngine** (`engine.ts`): Governor-gated execution; Council Mode for high-risk prompts.
- **Council Mode** (`council.ts`): Parallel provider execution + length-heuristic disagreement scoring → `ConsensusResult { confidence, disagreementScore }`.
- **Triage Classifier** (`triage.ts`): Keyword-based high-risk detection triggers Council Mode.
- **Fallback Router** (`router.ts`): Sequential fallback chain; reads `ProviderHealthState` to skip exhausted providers.
- **Rate Limit Interceptor** (`interceptor.ts`): Parses standard + Anthropic rate-limit headers; auto-resets after timeout.
- **AgentStop Supervisor** (`agent-stop.ts`): Token-level logprob evaluation; `AbortController` abort after N consecutive low-confidence tokens.
- **Model Discovery** (`discovery.ts`): Fetches available models from OpenRouter on startup.
- **ScoutLogic Benchmarker** (`benchmarker.ts`): EMA latency/TPS/failure tracking in `model_benchmarks` table.
- **Dynamic Model Router** (`dynamic-router.ts`): Scores models by complexity (`trivial/logical/complex`) × priority (`speed/cost/intelligence`).

### Memory (Cerebro)
- **Vector Store** (`vector.ts`): `sqlite-vec` KNN search for `float[1536]` embeddings; graceful keyword fallback (token similarity scoring).
- **Reflection Executor** (`reflection.ts`): Idle-triggered background consolidation; duplicate suppression at `similarity > 0.85`.
- **Habituation** (`habituation.ts`): Access-frequency memory weighting.

### Real-Time
- **ScoutDaemon SSE** (`sse.ts`): `EventSource` at `/api/scout/events`; events: `TASK_STATUS`, `RUN_STATUS`, `TODO_ESCALATED`; 15s heartbeat.
- **Idle Detector** (`idle.ts`): Triggers Cerebro reflection after 30-min inactivity.

### UI (PortGrid)
- **Canvas**: `@xyflow/react` with custom nodes (cpu/database/network icons), depth-aware layout algorithm, live status node coloring.
- **Dashboards**: UnifiedMasterDashboard, CoreExecDashboard, BaseVaultDashboard, RouteSwitchDashboard, CerebroDashboard, ScopeLogicDashboard, ScoutDaemonDashboard.
- **Components**: ApprovalCockpit, AgentKPIStrip, CronSummary, CerebroHealthWidget, GovernorUI, NotificationCenter, NodeOutputInspector, ProjectManager, RouteSwitchConfig, RoutingDials, AutonomyDials, RunHistory, ScopeLogicChat, Statusline, SettingsModal, ThemeContext/Toggle.

---

## Scope

### In Scope (Implemented)
- Single-user multi-project workspace isolation (FK-validated `project_id`).
- Transactional DAG execution (CoreExec) and local SQLite persistence (BaseVault).
- AI proposal generation via requirements-gathering interview loops (ScopeLogic).
- RouteSwitch multi-provider routing (OpenRouter, llama.cpp, MockProvider).
- PortGrid UI with ApprovalCockpit, NodeOutputInspector, Live SSE updates.
- Cerebro vector + keyword memory with idle reflection.
- Cron-based DAG scheduling.
- AES-256-GCM API key encryption at rest.
- ScoutLogic model benchmarking and optimal routing.
- 24h usage tracking and cost estimation.

### Out of Scope
- Hardened multi-tenant cloud hosting.
- Distributed service mesh / microservices split.
- External OAuth / multi-user auth.
- Paid cloud dependencies by default.
- XGBoost-based logprob supervisor (current: threshold-based `AgentStopSupervisor`).

---

## Non-Negotiables

- **Human-in-the-Loop approval gate:** AI proposals are strictly draft-only; system cannot self-persist or self-execute.
- **Safety Boundary compliance:** Mandatory SA-01–SA-07 enforcement on every DAG proposal.
- **Local-first control plane:** Zero user data or execution history leaves the host machine.
- **Schema-as-Truth:** `WorkflowRunSchema` / `TaskSchema` Zod schemas are the canonical source of run/task status enum. No bypass.
- **Single validator gate:** Both cron and interactive approval paths must pass through `validateDAGProposal`. No inline handler bypass.

---

## Success Criteria

- [x] Operator can install and run the software entirely offline locally.
- [x] Successfully execute a 3-node DAG workflow with durable task states.
- [x] Restart recovery is guaranteed: system resumes interrupted runs without duplicating side effects.
- [x] RouteSwitch successfully intercepts and blocks unauthorized paid model calls (Governor quota gate).
- [x] Category A safety assertions (SA-01–SA-07) block all forbidden DAG proposals.
- [x] 24h token usage and estimated cost visible in RouteSwitchDashboard.
- [x] Cerebro vector memory operational with keyword fallback for offline use.

---

## Failure Criteria

The project is not acceptable if:
- It violates any Safety Boundary Assertions (SA-01–SA-07), allowing AI to bypass human approval.
- Context leakage occurs between separate project workspaces (project_id FK not enforced).
- Concurrent workers collide or deadlock on task claiming due to loose database locking.
- Schema-dirty DB rows propagate to the UI without being caught at the HTTP boundary.
- A blocked DAG (SA-07 violation) gets registered as a live cron job.

---

## Change Log

| Date | Change |
| --- | --- |
| 2026-06-26 | Full rewrite to reflect implemented state through Phase 12. Transitioning to Phase 13 (Free-tier testing). Added full feature inventory. Removed speculative/unimplemented features. Corrected stack (Vite/React, not Next.js). |
| 2026-06-25 | Initial draft with planning-level intent. |
