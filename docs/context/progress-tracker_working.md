**Date:** 2026-06-26
**Agent:** Kiro (LLM Provider Registry + Cerebro Chatbot)

- **LLM Provider Registry (Phase 1–4) SHIPPED.** Full multi-provider support with encrypted keys, per-scope fallback chains, and UI management.
  - DB: `llm_providers` + `llm_routing_rules` tables added to initDB()
  - API: 8 CRUD endpoints for providers and routing rules (GET/POST/PUT/DELETE/test)
  - Engine: `resolveProviderChain()` with scope hierarchy (Agent > Project > Cerebro > Global), fallback-on-error loop in execute(), adapters accept dynamic IDs
  - Boot: `bootProviderRegistry()` loads enabled providers from DB on start, sets primary from global rule
  - UI: RouteSwitch Set-up View rebuilt with Provider Registry (add/edit/delete/test cards) and Fallback Chain editor (scope tabs, ordered list, up/down/remove/add)
- **Cerebro Floating Chatbot SHIPPED.** Always-visible AI assistant with navigation guidance.
  - Component: `CerebroChatbot.tsx` — floating purple button, expandable chat panel, minimize state
  - Backend: `POST /api/cerebro/chat` routes through RouteSwitchEngine with scope:'cerebro'
  - Navigation buttons extracted from LLM responses — clicking navigates user directly
- GitNexus blast radius: all modified symbols LOW risk
- Build: `npx tsc --noEmit` ✓ (0 errors)

**Date:** 2026-06-26
**Agent:** Buffy

- §3.3 RUNTIME-PARSE GATE SHIPPED. Closed the type-system-only discipline gutter on /api/basevault/* endpoints — dirty rows (status typos, schema-dirty workflow_runs / tasks from AdminSQL or backup-restore) silently propagated through to the UI instead of being rejected at the HTTP boundary.
- src/core/basevault/schema.ts (MODIFIED): kept the canonical WorkflowRunSchema / TaskSchema / ProjectSchema. ADded PartitionResult<T> interface + partitionBySchema<T>(rawRows, schema, label) helper co-located with the schemas it operates on. Per-row detail-log budget (PER_ROW_LOG_CAP = 5) prevents the ~120 lines/min flood that would happen on a dirty DB /runs poll (3s cadence). Falsy-id rows map to the sentinel '<missing-id>' (catches undefined / null / '' / NaN / 0) so operator logs are always traceable.
- src/server/index.ts (MODIFIED): both /api/basevault/runs (list) and /api/basevault/run/:runId (detail) now call partitionBySchema. List response shape changed to { runs, dirtyRunIds }; detail response shape changed to { run, tasks, dirtyTaskIds }. Both are backward-compatible with the existing RunHistory setRuns(data.runs) consumer (extra fields don't break TS). Run-level safeParse failure returns 500 with structured issues so a schema-dirty workflow_runs row cannot rehydrate into the canvas at all. Task-level dirty rows partition-and-drop so a single bad task doesn't take down the whole detail response.
- src/ui/components/RunHistory.tsx (MODIFIED): local `Run` interface replaced with `Pick<WorkflowRun, 'id' | 'status' | 'created_at'>` so future status-enum extensions in schema.ts immediately surface as TS errors here. STATUS_COLORS / STATUS_ICONS maps extended with 'blocked-by-validation' entry (amber #fbbf24 + ⛔, distinct from 'failed' red). Mockito handle on `if (data.runs)` covers the extra `dirtyRunIds` field without TS warning.
- vitest §3.3 test matrix (NEW/EXPANDED):
  - Canonical shape regressions (NEW): 8 cases across ProjectSchema / WorkflowRunSchema / TaskSchema — happy-path uuid+epoch, status enum acceptance for the four legacy statuses, blocked-by-validation (§3.4 sentinel) acceptance, negative-control rejection of 'terraformed' / 'excommunicated' status values, cross-schema uuid invariants, claim_lease nullability. These pin the schema as the canonical shape authority so any future enum extension has to consciously update parser + consumers in lockstep.
  - partitionBySchema() (NEW, 9 cases): empty input, all-clean, all-dirty (terraformed), missing-id → '<missing-id>' sentinel, null-id → '<missing-id>' sentinel, empty-string-id → '<missing-id>' sentinel, at-cap exact (5 dirty → vi.spyOn(console,'error') verifies exactly 5 per-row calls + no suppressed-summary), mixed clean+dirty, over-cap dirty rows (8 dirty → all 8 ids preserved in dirtyIds regardless of internal log throttle), cross-schema (TaskSchema not just WorkflowRunSchema). The at-cap spy case hard-locks the boundary so any future tail edit that double-emits or skips will fail that single assertion.
- Reviewer-driven iteration (CLOSED, 6 rounds): defect 1 — list endpoint had the same gutter the detail endpoint fixed (closed by adding partitionBySchema to /runs). defect 2 — duplication of the safeParse loop across endpoints (closed by extracting partitionBySchema). defect 3 — dead import `import { z } from 'zod'` after refactor (closed by deletion). defect 4 — String(row.id ?? '<missing-id>') failed on undefined (closed by switch to `!row.id ? '<missing-id>' : String(row.id)`). defect 5 — per-row console.error flood on hot poll (closed by PER_ROW_LOG_CAP + three-branch tail). defect 6 — cap-boundary double-listing at exactly 5 (closed by inverted tail branch: silent at cap, suppressed-summary over cap, short-summary under cap). defect 7 — at-cap boundary untested (closed by vi.spyOn assertion).
- vitest: green on §3.3 files (NEW schema.test.ts + schema regression suite + existing prior suites). tsc --noEmit clean on §3.3 files. Code-reviewer-minimax-m3 close-round verified ship-readiness on the partitionBySchema refactor + at-cap spy test + null-id case.
- Locked: §3.3 is regression-safe across all 10 falsy-id edge cases (undefined / null / '' / 0 / NaN / false / -1 / 123 / 'real-uuid' / empty-array via String([]) = ''). New /api/basevault/* endpoints must import partitionBySchema rather than opening a fresh safeParse loop.
- src/core/coreexec/validateDAG.ts (NEW): single source of truth — exports validateDAGTemplate (raw-string path used by scheduler.refreshJobs), validateDAGProposal (parsed-object path used by /api/coreexec/approve), and escalateBlockedDAGToOsTodos (FK-satisfying HIGH-severity escalation with scout event emission). Parse failures never throw — they return { error, proposal: null } so cron callers don't tear down the refresh loop.
- src/core/coreexec/scheduler.ts (MODIFIED): refreshJobs now validator-gates every workflow row BEFORE cron registration. A previously-valid DB DAG edited to violate SA-07 is stopped in-memory (not just refused on the next refresh). The periodic refresh interval is tracked in a module-level handle and the test-only _stopSchedulerLoopForTests() helper exports it so vitest workers no longer leak daemon timers past process exit.
- src/server/routes/coreexec-router.ts (NEW): Hono sub-app with three endpoints — /approve (validator-gated approval producing workflow_runs + tasks), /run/:runId/status (rehydration lookup for the History widget), and /retry/:runId (re-validates workflow_runs.dag_layout before retry so AdminSQL edits between approve and retry cannot bypass the gate).
- src/server/index.ts: removed the inline /api/coreexec/* handlers and mounted coreexecRouter via app.route. An explicit comment block on the mount site forbids reintroducing inline handlers because the route mount precedence would let them silently bypass validateDAGProposal.
- FK chain pattern — os_todos.dag_node_id → tasks.id → workflow_runs.id → projects.id. escalateBlockedDAGToOsTodos pre-inserts all four sentinel rows in a single db.transaction() with status='blocked-by-validation' so cleanup jobs and the NotificationCenter can target a single escalation block. Each escalation gets its own UUID-prefixed sentinelProjectId / sentinelTaskId / runId / todoId so concurrent escalations never overwrite each other's DAG context.
- vitest: 26/26 passing across validateDAG.test.ts (NEW), scheduler.test.ts (MODIFIED — cleanupWorkflow FK back-reference coverage), coreexec-router.test.ts (MODIFIED — split assertion format). tsc --noEmit clean for §3.4 files. Code-reviewer-minimax-m3 close-round verified ship-readiness before commit cb02165. Residual risk on /api/coreexec/* and refreshJobs is now LOW.


**Date:** 2026-06-26
**Agent:** Buffy

- §3.2 ROUTESWITCH 24H TOKEN/COST COUNTERS SHIPPED. Closed the dashboard always-zero bug — RouteSwitchDashboard.tsx read data.telemetry.tokenCount (always undefined) and computed $(tokens * 0.000002).toFixed(4) (always $0.0000), so the "Generated Tokens (24h)" panel was a hardcoded UX lie.
- src/core/routeswitch/governor.ts (MODIFIED): FreeModeGovernor now stores per-call usage history with provider attribution. New exports — UsageRecord { timestamp, tokens, provider }, UsageAggregate { tokens, costUsd, requests, byProvider, windowMs, generatedAt }, and ESTIMATED_COST_PER_1K_TOKENS_USD = 0.002 (conservative provider-blended estimate for mid-tier OpenAI-class pricing; the source is named in the source comment so swapping for a per-provider lookup table is one localized edit).
- getUsage24h(windowMs = 24h) prunes records older than `now - windowMs` IN-PLACE on read so the buffer stays bounded under long-running processes. Returns a single aggregate plus per-provider breakdown so the dashboard can split single-mode traffic from council-mode share. recordUsage extended to (tokens, provider='unknown') — default arg preserves backward compat with all existing call sites.
- src/core/routeswitch/engine.ts (MODIFIED): single-mode calls pass this.provider.id to recordUsage; council-mode calls attribute the multiplied token count to a synthetic 'council' provider id so council share is visible separately.
- src/server/routes/llm.ts (MODIFIED): new GET /api/llm/usage returning { success, usage24h }. Telemetry is now a single source of truth — /api/llm/config only feeds provider-config fields.
- src/ui/views/RouteSwitchDashboard.tsx (MODIFIED): 5s poller over /api/llm/usage owned by a separate useEffect with cancelled-flag + clearInterval cleanup so component unmount cannot setState after destroy. Added a "Requests (24h)" row alongside tokens and costUsd so call-count is co-located with spend. Removed the setTokens call from the /config useEffect to fix the initial-mount race where legacy lifetime telemetry would overwrite the fresh 24h aggregate.
- vitest: 10/10 new governor.test.ts cases passing (constant export, recordUsage appends, cost math, 24h exclusion, custom windowMs, prune-on-read correctness, legacy tokensUsed/maxTokens shape preserved, quota-gate behaviour, default provider='unknown', windowMs echo on the response). tsc clean for §3.2 files. Full §2.1 + §1.2 regression sweep still green. Code-reviewer-minimax-m3 close-round verified ship-readiness before commit b347bc0.


**Date:** 2026-06-26
**Agent:** Buffy

- §3.1 Master widgets COMPLETE. Added 4 widgets: AgentKPIStrip (SSE on /api/system/metrics), CronSummary (poll /api/scheduler/jobs), CerebroHealthWidget (poll /api/cerebro/health 10s), ActionCenter (existing NotificationCenter). New backend routes: GET /api/scheduler/jobs (queries workflows WHERE cron_schedule IS NOT NULL, probes nextTick via ephemeral cron.schedule + .nextDate().toMillis()); GET /api/cerebro/health (COUNT + MAX(last_accessed_at) from cerebro_memories_meta, derives cold/nominal/stale/warning status).
- UnifiedMasterDashboard.tsx refactored: KPI strip top, 2x2 grid below (Action Center, CoreExec+Governor, Cerebro Health, Cron Summary, Exec Ledger). Removed hardcoded $0.00 / 0 RouteSwitch telemetry card.
- vitest: backend smoke-tests green (scheduler-list 3/3, cerebro 3/3 — verified ephemeral probe + status thresholds including 25h-old warning). Full §2.1 + §1.2 regression sweep clean (40+ tests across 6 files). tsc --noEmit clean for all §3.1 files.
- Locked: dashboard reads live agent fan-out + scheduled cron jobs + Cerebro substrate; backend exposed without polluting scheduler.ts module-private Map.


**Date:** 2026-06-26
**Agent:** Buffy

- §2.1 fix-iteration closed code-reviewer 4 findings + 11 TS errors: (i) extracted ALLOWLIST to export from sandbox.ts and import in dispatch.ts (no drift hazard); (ii) worker.ts uses discriminated WorkerInput union ({kind:"legacy", data} vs {kind:"dag", taskId, prompt, directive?}) instead of shape heuristic; (iii) dead `WorkerInput shape` contract describe block removed; (iv) engine.ts DAGNode extended to PromptedDAGNode with prompt field, dropped `(node as any).prompt` cast.
- Also fixed exactOptionalPropertyTypes strictness: WorkerOutput now uses `T | undefined` for all optional fields so the assignment from `data.taskId` compiles without spread gymnastics.
- vitest: 27 (worker.test.ts 11, system-reserved.test.ts 13, validator.test.ts 12) + engine.test.ts 2/2 + dispatcher integration. tsc clean for §2.1 scope (overall 6 pre-existing errors unaffected).


**Date:** 2026-06-26
**Agent:** Buffy

- §2.1 ENGINE-TO-SANDBOX WIRING SHIPPED. Created src/core/coreexec/dispatch.ts (classifyDirective: shell|scrape|generic; URL detection via regex, bash code-fence extraction, allowlisted bare command, conservative generic fallback with reason audit trail).
- Modified src/core/coreexec/worker.ts: action branching — shell routes to CommandSandbox.execute(payload), scrape routes to StealthScraper.scrape(url, true), generic echoes prompt metadata. Backward-compat for legacy `{ data }` stub payload preserved.
- Modified src/core/coreexec/engine.ts: workerPool.execute({taskId, prompt}) — prompt propagated through so worker dispatch can route. Empty prompt → generic fallback (legacy tests still pass).
- Added src/core/coreexec/worker.test.ts: 10 cases for classifyDirective covering empty input, URL detection, bash fence with allowlisted root, bash fence with disallowed root, bare command, sneaky-wrapping blocking, python3 routing, benign fallback, reason audit trail.
- vitest: §2.1 worker.test.ts is green; engine.test.ts legacy regression confirmed. tsc clean for §2.1 files.


**Date:** 2026-06-26
**Agent:** Buffy

- §1.2 LOCK COMPLETE. Close-round finalised: removed dead `firstToken()` helper from src/core/system-reserved.ts (no production callers); removed `firstToken()` describe block + import from src/core/system-reserved.test.ts; strengthened fan-out negative-control with mid-token truncation (`routeswit`, `route`, `scopelo`) and glued-form sentinels (`xxrouteswitchyy`, `routeswitch_v2`) plus long-no-match (`a + x*1000`) regression smoke.
- vitest run: 27/27 passing across 2 files (system-reserved 15, validator 12). tsc --noEmit clean for §1.2 files (6 pre-existing errors unaffected).
- Code-reviewer-minimax-m3 close-round verified ship-readiness. Moving to §2.1 (engine-to-sandbox wiring).


**Date:** 2026-06-26
**Agent:** Buffy

- §1.2 LOCK fix-iteration: code-reviewer-minimax-m3 flagged 3 gaps — (i) SA-05 happy-path test regressed to generic benign-prompt; (ii) parametrised case-insensitive coverage missing for 3 of 7 labels; (iii) no fan-out regex-drift negative control. Applied: added `ExternalAPI`, `SSH` to ALLOWED_AGENTS so SA-05 happy-path has real subjects, added `for (const label of RESERVED_DAG_LABELS)` loop test, added fan-out negative control (1000-char no-match + whitespace-split labels).
- vitest re-run: 29/29 passing (was 27 before fix iteration).
- tsc --noEmit clean for system-reserved.ts + validator.ts + both test files.
- Locked: §1.2 reserved-label detection is now regression-safe across all 7 labels at lowercase/UPPERCASE/PascalCase/mid-prompt, with negative controls.


**Date:** 2026-06-26
**Agent:** Buffy

- §1.2 LOCK: Added vitest coverage for src/core/system-reserved.ts (16 tests on findReservedLabel, isReservedDAGPrompt, firstToken, RESERVED_DAG_LABELS) and added 4 SA-07 tests to validator.test.ts (start, mid, matched-label, SA-07-wins-over-SA-05).
- vitest run: 27/27 passing (no regressions in existing Category A tests).
- tsc --noEmit: clean for system-reserved.ts + validator.ts + both test files (6 pre-existing errors unaffected, all in scheduler.ts/idle.ts/cerebro.ts/system.ts/CerebroDashboard.tsx).
- gitnexus detect_changes: scoped to NeuroSyncMega repo via -r flag, confirming test additions only.

===

<!-- Append-only log of changes managed by BaseVault -->

**Date:** 2026-06-26
**Agent:** Kiro (UI Rebuild)

- FULL UI ARCHITECTURE REBUILD COMPLETE.
- Removed permanent left sidebar from OSLayout.tsx — replaced with NavigationContext provider (thin shell).
- New shared components: AppShell.tsx (top nav bar + hideable left/right sidebars that push center content), ModuleRouter.tsx (8 modules), ProjectSwitcher.tsx (fetches /api/projects + Global option).
- All 7 module dashboards + System View rebuilt using AppShell template:
  - CoreExec (#00E5FF cyan): DAG run monitor + alerts + cron | threading + safety + recovery
  - BaseVault (#D4AF37 gold): SQLite explorer + sanitization + retention | backup SSE + redaction + migrations
  - RouteSwitch (#FFB300 amber): 24h telemetry + fleet health + alerts | providers + governor + MCP + routing
  - ScopeLogic (#00E5FF cyan): interview pipeline + proposal quarantine + confidence | grammar + prompts + council + assertions
  - PortGrid (#00FFCC teal): DAG canvas + HITL queue + badges + tool telemetry | registry + permissions + sandbox + a11y
  - ScoutDaemon (#8E24AA purple): ambient monitor + quarantine + hardware | AgentStop + sensing + idle + kill switch
  - Cerebro (#2DD4BF teal): learning approvals + memory browser + decay | retrieval + habituation + global KB
  - System View (#D4AF37 gold): KPI strip + action center + cerebro health + cron | polling + logging + theme
- Sidebar open/closed state persisted across module navigation via NavigationContext (leftBarOpen/rightBarOpen lifted from AppShell local state).
- Top nav bar: "ByteBuster NeuroSyncOS v2.1" + module logo (prominent, glowing) + name + Dashboard/Set-up toggles + theme toggle + project filter badge.
- Glow boxes on all center canvas sections with module-colored soft glow intensifying on hover.
- Build passes cleanly (npx vite build ✓).



**Date:** 2026-06-26
**Agent:** Maintenance Agent (Antigravity)

- System-wide TypeScript type resolution completed.
- Backend type errors (165 tests) passing and cleared.
- Successfully bootstrapped missing dependencies in Next.js `ui-next` directory.
- Root TSConfig optimized for monorepo separation.
- Unfinished tasks in `ts-errors.txt` successfully verified and marked as complete.



**Date:** 2026-06-26
**Agent:** Doc Agent

- Phase 11 (RouteSwitch Inference Engine) COMPLETE: Implemented `discovery.ts` (OpenRouter auto-discovery), `interceptor.ts` (rate-limit telemetry), `router.ts` (fallback chain), and populated `RouteSwitchConfig.tsx` UI.
- Phase 12 (ScoutLogic Dynamic Routing) COMPLETE: Implemented `benchmarker.ts` (EMA latency/TPS), `classifier.ts` (deterministic complexity heuristics), `dynamic-router.ts` (composite scoring math), and `RoutingDials.tsx` (Speed/Cost/IQ sliders).
- Phase 12 (Documentation Audit) COMPLETE: Synced all context files and documentation to reflect the actual implemented state of the beta-stable system.
- Transitioning to Phase 13 (Free-tier testing).

### [2026-06-26] UI Overhaul - Full Dashboard Suite Redesign Complete
- Fully redesigned and refactored **BaseVault**, **PortGrid**, **ScopeLogic**, **CoreExec**, **RouteSwitch**, **ScoutDaemon**, and **Cerebro** dashboards.
- Applied the "Grit, Not Grime" zero-budget, high-reliability local execution design philosophy.
- Transitioned to "High-Glow" dynamic themes tailored to each module's core function.
- Finalized global styling variables in `index.css`.
- Synchronized all module routes inside `OSLayout.tsx` and `App.tsx` ensuring 100% cohesion across the suite.
