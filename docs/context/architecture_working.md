**SUMMARY OF ORIGINAL DOCUMENT (architecture.md):**
Full architecture specification for NeuroSync Sovereign OS. Covers: tech stack (Node.js/Hono/SQLite/React/Vite), confirmed module inventory for all 7 core subsystems (BaseVault, CoreExec, ScopeLogic, RouteSwitch, ScoutDaemon, ScoutLogic, Cerebro), DB schema (10 tables), server route map, UI component/view inventory (19 components, 7 views), system boundaries, storage model, auth model, architecture invariants (9), validation architecture (§3.4 DAG gate pipeline), known risks, integration model, and implementation log summary for §1.2–§3.4.

===

<!-- Append-only log of changes — newest first -->

### [2026-06-26] LLM Provider Registry + Cerebro Floating Chatbot
**Agent:** Kiro (LLM Provider Registry Implementation)

- **2 new SQLite tables:** `llm_providers` (named entries with AES-256-GCM encrypted API keys), `llm_routing_rules` (per-scope fallback chains with UNIQUE(scope, scope_id))
- **8 new API endpoints on /api/llm/:** providers GET/POST/PUT/DELETE, providers/:id/test POST, routing-rules GET/PUT/DELETE
- **1 new API endpoint:** `POST /api/cerebro/chat` — Cerebro floating assistant chat endpoint with system prompt containing full module navigation knowledge
- **RouteSwitchEngine refactored:** new `resolveProviderChain()` with scope hierarchy (Agent > Project > Cerebro > Global), execute() now has fallback-on-error loop across the resolved chain
- **Adapters updated:** OpenAICompatibleProvider + LlamaCppProvider accept `customId` parameter for DB-loaded providers
- **Boot sequence:** `bootProviderRegistry()` loads all enabled providers from DB, resolves global rule primary, falls back to env/mock
- **New UI component:** `CerebroChatbot.tsx` — floating purple chatbot (bottom-right), three states (closed/open/minimized), navigation buttons from LLM responses
- **RouteSwitch Set-up View rebuilt:** Section A (Provider Registry with CRUD), Section B (Scope-based fallback chain editor with tabs), Section C (Governor), Section D (MCP)
- **Scope context injected:** Cerebro uses scope:'cerebro', ScopeLogic uses scope:'agent'/scopeId:'scopelogic-interview'
- DB tables in `src/core/basevault/db.ts`, engine in `src/core/routeswitch/engine.ts`, routes in `src/server/routes/llm.ts` + `cerebro.ts`, UI in `src/ui/views/RouteSwitchDashboard.tsx` + `src/ui/components/CerebroChatbot.tsx` + `src/ui/layouts/OSLayout.tsx`

### [2026-06-26] Full UI-Backend Integration Audit & Plan Created
**Agent:** Kiro (Integration Audit)

- Created `docs/ui-backend-integration-plan.md` — comprehensive gap analysis mapping all 30 backend endpoints against all 8 dashboard views
- Identified 4 fully-functional dashboards (System View, CoreExec, Cerebro, ScoutDaemon) and 4 with gaps (BaseVault, PortGrid, RouteSwitch, ScopeLogic)
- Key gaps: hardcoded DB stats, missing project-scoped filtering, unwired approval buttons, placeholder tool telemetry
- Plan organized into 4 phases: A (critical wiring), B (replace hardcoded data), C (new endpoints), D (polish)
- Estimated total effort: 32-44 hours across all phases


### [2026-06-26] Sidebar State Persistence — Lifted to NavigationContext
**Agent:** Kiro (UI Rebuild)

- `leftBarOpen` and `rightBarOpen` boolean state moved from `AppShell.tsx` local state into `NavigationContext` (provided by `OSLayout.tsx`)
- `AppShell.tsx` now reads sidebar state from context, making it persistent across module navigation
- `NavigationContext` interface expanded: added `leftBarOpen`, `setLeftBarOpen`, `rightBarOpen`, `setRightBarOpen`
- No new dependencies or files added

### [2026-06-26] Full UI Rebuild Complete — All 7 Modules + System View on New Shell
**Agent:** Kiro (UI Rebuild)

- All modules rebuilt: CoreExec, BaseVault, RouteSwitch, ScopeLogic, PortGrid, ScoutDaemon, Cerebro, System View (Master)
- Shared components: `AppShell.tsx`, `ModuleRouter.tsx`, `ProjectSwitcher.tsx`
- Permanent left sidebar removed from OSLayout; each module uses AppShell with hideable sidebars that push center content
- Top nav bar: brand + module logo + view toggles + theme switch + project filter badge

### [2026-06-26] UI Architecture Rebuild — Phase 1: Shell & CoreExec
**Agent:** Kiro (Architecture Rebuild)

- **OSLayout.tsx** no longer renders a permanent sidebar. It is now a `NavigationContext.Provider` wrapping a full-screen view renderer.
- **New architecture pattern** established for all modules:
  ```
  OSLayout (NavigationContext)
    └── [Module]Dashboard
          └── AppShell (top nav + hideable left/right bars + center canvas)
                ├── Top Nav: Brand | Module Logo+Name | [Dashboard] [Set-up]
                ├── Left Bar: ModuleRouter (shared, 8 modules)
                ├── Right Bar: ProjectSwitcher (/api/projects + Global)
                └── Center Canvas: Dashboard View | Set-up View
  ```
- **NavigationContext** provides: `activeView`, `navigate()`, `activeProjectId`, `activeProjectName`, `setActiveProject()`
- **Set-up View** explicitly ignores project filter (shown as "(ignored)" in top nav badge)
- **Dashboard View** responds to project filter from Right Bar
- **New files:** `src/ui/components/AppShell.tsx`, `ModuleRouter.tsx`, `ProjectSwitcher.tsx`
- **CoreExecDashboard.tsx** is the first module rebuilt as template for approval

**Date:** 2026-06-26
**Agent:** Maintenance Agent (Antigravity)

- System-wide TypeScript type resolution completed.
- Backend type errors (165 tests) passing and cleared.
- Successfully bootstrapped missing dependencies in Next.js `ui-next` directory.
- Root TSConfig optimized for monorepo separation.
- Unfinished tasks in `ts-errors.txt` successfully verified and marked as complete.



**Date:** 2026-06-26
**Agent:** Doc Agent (Documentation Audit)

- FULL REWRITE to match confirmed source files through §3.4.
- CONFLICTS RESOLVED:
  - OLD: Stack listed "Next.js" as frontend. FIXED: Source confirms Vite + React + @xyflow/react + Tailwind CSS 3.4.
  - OLD: AI/Agent model listed only "ScopeLogic Agent" and "ScoutDaemon" as workers. FIXED: Added full worker inventory including WorkerPool, RouteSwitchEngine, FreeModeGovernor, ConsensusSynthesizer, AgentStopSupervisor, Benchmarker, ReflectionExecutor.
  - OLD: Storage model listed "memory_nodes" table and "config.toml". FIXED: Actual tables are cerebro_memories_meta, cerebro_memories_vec, cerebro_learning_approvals, system_settings; no config.toml exists.
  - OLD: Architecture Invariants listed only 6. FIXED: Added invariants 7 (Single Validator Gate), 8 (Schema-as-Truth), 9 (Reserved Label Prohibition) from §3.4 and §1.2 implementations.
  - OLD: Implementation Log Rollup referenced architectural decisions inline without structured table. FIXED: Added structured phase summary table (§1.2–§3.4).
  - OLD: "Enhanced Architecture Requirements" and "Inference & Confidence Scoring" sections referenced unimplemented features (XGBoost supervisor, Argon2id, AF-125 Matrix, Dual-Graph Memory). FIXED: Replaced with confirmed implementations (AgentStopSupervisor threshold-based, council.ts length-heuristic disagreement scoring, CerebroVectorStore with similarity > 0.85 duplicate suppression).
- ADDED:
  - Full module inventory table per subsystem.
  - Complete DB schema table (10 tables including os_todos, cerebro_learning_approvals, model_benchmarks).
  - SSE event types (TASK_STATUS, RUN_STATUS, TODO_ESCALATED).
  - Task and run status lifecycle states (unclaimed → claimed → completed/parked; pending → running → completed/failed/parked/blocked-by-validation).
  - Validation architecture pipeline diagram (§3.4).
  - Full server route map with endpoint details.
  - Full UI component registry (19 components + 7 views).
- Transitioning to Phase 13 (Free-tier testing).

### [2026-06-26] UI Overhaul - Full Dashboard Suite Redesign Complete
- Fully redesigned and refactored **BaseVault**, **PortGrid**, **ScopeLogic**, **CoreExec**, **RouteSwitch**, **ScoutDaemon**, and **Cerebro** dashboards.
- Applied the "Grit, Not Grime" zero-budget, high-reliability local execution design philosophy.
- Transitioned to "High-Glow" dynamic themes tailored to each module's core function.
- Finalized global styling variables in `index.css`.
- Synchronized all module routes inside `OSLayout.tsx` and `App.tsx` ensuring 100% cohesion across the suite.
