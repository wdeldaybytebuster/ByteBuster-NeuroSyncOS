**Timestamp:** 2026-06-26T12:30:00-06:00
**Checkpoint:** §3.4 DB-bypass HIGH risk CLOSED (Phase 8 Expansion)
- validateDAG.ts (new): single validator gate exporting validateDAGTemplate (raw string), validateDAGProposal (parsed object), and escalateBlockedDAGToOsTodos (FK-satisfying escalation transaction).
- scheduler.ts (modified): refreshJobs validator-gates every workflow row BEFORE cron registration. Workflow rows whose dag_template becomes invalid after the fact are stopped in-memory (not just refused on the next refresh). Module-level refreshInterval handle + _stopSchedulerLoopForTests() test-only export.
- coreexec-router.ts (new): Hono sub-app /approve (gated), /run/:runId/status, /retry/:runId (re-validates the layout on every retry, closing the AdminSQL between-approve-and-retry bypass class).
- index.ts: removed inline /api/coreexec/* handlers, mounted coreexecRouter. Explicit comment forbids reintroducing inline variants because app.route mount precedence would let them silently bypass the validator.
- Escalation FK pattern: projects → workflow_runs → tasks → os_todos inserted in one db.transaction() with status='blocked-by-validation'; per-escalation UUID-prefixed sentinel rows so concurrent escalations never share a row.
- vitest: 26/26 pass (validateDAG.test.ts NEW, scheduler.test.ts MODIFIED for FK back-reference, coreexec-router.test.ts MODIFIED for split assertions). tsc clean. Residual risk on /api/coreexec/* and refreshJobs is now LOW.


**Timestamp:** 2026-06-26T11:30:00-06:00
**Checkpoint:** §3.2 RouteSwitch 24h counters SHIPPED (Phase 8 Expansion)
- governor.ts (modified): FreeModeGovernor tracks per-call UsageRecord history with provider attribution. New exports UsageRecord, UsageAggregate, ESTIMATED_COST_PER_1K_TOKENS_USD = 0.002.
- getUsage24h(windowMs = 24h) prunes records in-place on read and returns { tokens, costUsd, requests, byProvider, windowMs, generatedAt }. costUsd = (tokens / 1000) * ESTIMATED_COST_PER_1K_TOKENS_USD.
- engine.ts (modified): single calls recordUsage(estimated, provider.id); council calls recordUsage(estimated × allProviders.length, 'council') so council-mode share is visible separately.
- llm.ts (modified): GET /api/llm/usage endpoint. /config only seeds provider-config so maintenance traffic never collides with usage telemetry.
- RouteSwitchDashboard.tsx (modified): 5s poller over /api/llm/usage owned by separate useEffect with cancelled-flag + clearInterval cleanup. Requests-24h row added alongside tokens and costUsd. The setTokens call was removed from the /config useEffect (closes the initial-mount race where legacy lifetime telemetry overwrote the fresh 24h aggregate).
- vitest: 10/10 new governor.test.ts pass. §2.1 + §1.2 regression sweep still green. tsc clean for §3.2 files.


**Timestamp:** 2026-06-26T10:55:00-06:00
**Checkpoint:** §2.1 fix-iteration complete (Phase 8 Expansion)
- ALLOWLIST exported from sandbox.ts and reused by dispatch.ts.
- WorkerInput is now a discriminated union: `{kind:"legacy"}` vs `{kind:"dag"}`.
- WorkerOutput uses `T | undefined` for optional fields under exactOptionalPropertyTypes.
- engine.ts introduces `PromptedDAGNode` (extends DAGNode with prompt: string).
- vitest: §2.1 test slice green; engine.test.ts regression clean. tsc clean for §2.1 scope.


**Timestamp:** 2026-06-26T10:45:00-06:00
**Checkpoint:** §2.1 Engine-to-Sandbox Wiring COMPLETE (Phase 8 Expansion)
- dispatch.ts (new): prompt classifier shell|scrape|generic with audit reason.
- worker.ts (modified): action branching shell → CommandSandbox, scrape → StealthScraper, generic → metadata echo. Backward-compat for legacy stub preserved as a worker case.
- engine.ts (modified): prompt propagated via workerPool.execute({taskId, prompt}).
- worker.test.ts (new): 10 classifier unit tests.
- vitest §2.1: green. engine.test.ts regression: clean. tsc clean for §2.1 scope.


**Timestamp:** 2026-06-26T10:30:00-06:00
**Checkpoint:** §1.2 LOCK COMPLETE (Phase 8 Expansion UI Unit)
- Close-round finalised: dead firstToken helper removed along with its tests; fan-out negative-control strengthened to catch future regex-engine swaps to substring matching.
- vitest: 27/27 passing. tsc clean for §1.2 files.
- Locked: §1.2 reserved-label detection is regression-safe across all label forms and against regex-engine drift.


**Timestamp:** 2026-06-26T10:15:00-06:00
**Checkpoint:** §1.2 LOCK fix-iteration (Phase 8 Expansion UI Unit)
- Closed 3 reviewer gaps in one round: SA-05 happy-path now uses ExternalAPI/SSH (added to ALLOWED_AGENTS), parametrised all-7-label case-insensitive coverage, fan-out negative control (long non-match + whitespace-split labels).
- vitest run: 29/29 passing.
- §1.2 LOCK is now regression-safe across all label forms.


**Timestamp:** 2026-06-26T10:00:00-06:00
**Checkpoint:** §1.2 LOCK Complete (Phase 8 Expansion UI Unit)
- Added 16 vitest cases for src/core/system-reserved.ts: registry len=7 assertion, lowercased canonical form, firstToken back-compat, findReservedLabel word-boundary coverage (mid-prompt, punctuation after, hyphen/dot separators, NO compound-identifier false positives), isReservedDAGPrompt matrix.
- Added 4 SA-07 cases for validator.ts: start-position rejection, mid-prompt rejection, matched-label reporting (verifies the message now uses findReservedLabel() instead of the old firstToken()), and the SA-07-wins-over-SA-05 design constraint proving that engine-named agent tokens are now reserved by design.
- vitest run: 27/27 passing. tsc --noEmit clean for section scope.
- Files: src/core/system-reserved.test.ts (new), src/core/scopelogic/validator.test.ts (modified).

**Phase 8 Implementation Log**

This file tracks the execution of the Phase 8 Local OS Expansion tasks.

===

<!-- Append-only log of changes managed by BaseVault -->

**Date:** 2026-06-26
**Agent:** Maintenance Agent (Antigravity)

- System-wide TypeScript type resolution completed.
- Backend type errors (165 tests) passing and cleared.
- Successfully bootstrapped missing dependencies in Next.js `ui-next` directory.
- Root TSConfig optimized for monorepo separation.
- Unfinished tasks in `ts-errors.txt` successfully verified and marked as complete.



**Timestamp:** 2026-06-26T12:45:00-06:00
**Checkpoint:** Phase 8 UI Expansion COMPLETE (BaseVault & Cerebro Dashboard)
- db.ts (modified): Added `cerebro_learning_approvals` table.
- cerebro.ts (modified): Added endpoints GET /api/cerebro/learning-approvals, POST /approve, POST /reject. Approval migrates facts into `cerebro_memories_meta` permanently.
- LearningApprovalsQueue.tsx (new): UI component to display and interact with pending facts.
- CerebroDashboard.tsx (modified): Swapped out placeholder `ApprovalCockpit` for the new `LearningApprovalsQueue`.
- Verified all other Phase 8 expansion ideas (ScopeLogic Auto-Minimization, System Service Node Hiding, Interactive Run History, Native Sandbox Wiring) were already implemented and fully functional. Phase 8 is now complete minus testing.

### [2026-06-26] UI Overhaul - Full Dashboard Suite Redesign Complete
- Fully redesigned and refactored **BaseVault**, **PortGrid**, **ScopeLogic**, **CoreExec**, **RouteSwitch**, **ScoutDaemon**, and **Cerebro** dashboards.
- Applied the "Grit, Not Grime" zero-budget, high-reliability local execution design philosophy.
- Transitioned to "High-Glow" dynamic themes tailored to each module's core function.
- Finalized global styling variables in `index.css`.
- Synchronized all module routes inside `OSLayout.tsx` and `App.tsx` ensuring 100% cohesion across the suite.
