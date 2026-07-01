**SUMMARY OF ORIGINAL DOCUMENT (ui-backend-sync-plan.md):**
Full gap analysis between the rebuilt UI dashboards and backend API. Identifies 14 total gaps across 6 modules (CoreExec and System View are fully synced). Prioritizes into P0 (2 quick wiring fixes), P1 (4 moderate fixes requiring some new backend), P2 (8 new endpoints needed). Provides execution order and constraints. Created after comprehensive review of all project documentation and codebase state.

===

<!-- Append-only log of changes — newest first -->

**Date:** 2026-06-26
**Agent:** Kiro (Unit Spec: Project Root Directory Mapping)

- **SPEC IMPLEMENTED:** Project Root Directory Mapping — bridges BaseVault schema with UI, P0 Sandbox security, and CoreExec worktree isolation.
- **Phase 1 — DB Schema:** Added `project_root_path TEXT` column to `projects` table via idempotent ALTER TABLE in `initDB()`. No data loss for existing rows (nullable column).
- **Phase 2 — API:**
  - `POST /api/projects` now accepts optional `projectRootPath` in body, validated with `validateProjectRootPath()`: must be absolute, no null bytes, no forbidden system dirs (/etc, /proc, /dev, etc.), must exist on disk, must be a directory.
  - New `PUT /api/projects/:id` endpoint for updating name and/or projectRootPath with same strict validation.
  - Returns 400 with descriptive error for invalid paths.
- **Phase 3 — UI:** `ProjectSwitcher.tsx` (Right Bar) rebuilt:
  - "New Workspace" form now has "Project Root Path" input field (optional, absolute path with FolderOpen icon).
  - Each project in the list shows its `project_root_path` in small mono text below the name.
  - Pencil edit button (hover-reveal) opens inline edit form with name + root path.
  - Validation errors display inline on both create and edit.
- **Phase 4 — P0 Sandbox Security:**
  - Extracted `CommandSandbox.resolveCwd(projectId)` static method.
  - Resolution priority: `project_root_path` (user source dir) > `workspace_path` (system sandbox) > throw error.
  - `PathValidator.validateContainment()` enforces all command arguments stay within the resolved directory.
  - Path traversal attacks (../../etc/passwd) blocked by prefix check.
- **Phase 5 — Downstream (Worktree Isolation):**
  - New `src/core/coreexec/worktree.ts` — `WorktreeIsolation` class managing `.nexus_worktrees/` inside project_root_path.
  - Methods: `createRunWorktree`, `removeRunWorktree`, `listWorktrees`, `getRunWorktreePath`.
  - Wired into `executeRun()` — creates `.nexus_worktrees/<runId>` on run start so AI-drafted file mutations are quarantined.
- **GitNexus:** Pre-change impact all LOW. Post-change detect-changes: 5 files, 6 symbols, MEDIUM (aggregate, expected).
- **Build:** `npx tsc --noEmit` ✓ (0 errors)
- **Files:** `src/core/basevault/db.ts`, `src/server/routes/projects.ts`, `src/ui/components/ProjectSwitcher.tsx`, `src/core/coreexec/sandbox.ts`, `src/core/coreexec/worktree.ts` (new), `src/core/coreexec/engine.ts`


**Date:** 2026-06-26
**Agent:** Kiro (Cerebro Floating Chatbot + LLM UI Polish)

- **NEW FEATURE: Cerebro Floating Chatbot** — always-visible assistant accessible from every view.
  - Renders as a purple floating button (bottom-right). Click to expand into a full chat panel.
  - Three states: closed (button only), open (full 360x480 chat panel), minimized (slim bar).
  - Sends user messages to `POST /api/cerebro/chat` which routes through the LLM with a system prompt containing full knowledge of all modules, navigation paths, and common tasks.
  - Conversation history (last 6 messages) passed for context continuity.
  - **Navigation buttons**: When Cerebro's response mentions "Navigate to [Module]", a clickable button appears below the message that calls `navigate()` to take the user directly there.
  - **Graceful offline fallback**: When no LLM is configured, returns a helpful message directing the user to RouteSwitch Set-up to add a provider.
  - Component: `src/ui/components/CerebroChatbot.tsx`
  - Backend endpoint: `POST /api/cerebro/chat` in `src/server/routes/cerebro.ts`
  - Engine injection: `injectChatEngine(routeSwitch)` in `src/server/index.ts`
  - Mounted in `src/ui/layouts/OSLayout.tsx` inside NavigationContext (so it can navigate)
- **LLM Provider UI Polish** (7 fixes from full interaction audit):
  1. Test result displays per-provider (under the card that was tested) with latency + response preview
  2. Delete handles 409 "in-use" errors with user-visible alert instead of silent failure
  3. Add-to-chain uses React controlled state instead of fragile `document.getElementById`
  4. Added "Delete Rule" button for clearing routing rules from the UI
  5. Provider cards restructured for per-card test feedback
  6. addToChain resets select dropdown after adding
  7. Default "Select provider to add..." placeholder option added
- Build verified: `npx tsc --noEmit` ✓ (0 errors)
- Files modified: `src/ui/components/CerebroChatbot.tsx` (new), `src/ui/layouts/OSLayout.tsx`, `src/server/routes/cerebro.ts`, `src/server/index.ts`, `src/ui/views/RouteSwitchDashboard.tsx`


**Date:** 2026-06-26
**Agent:** Kiro (LLM Provider Registry — Bug Fixes from Testing)

- **Bug #1 FIXED: Projects dropdown empty in routing rules scope selector.**
  - Cause: `/api/projects` endpoint returns `{ projects: [...] }` without `success: true` field. UI checked `d.success && d.projects` which always failed silently.
  - Fix: Changed condition to `if (d.projects)` in RouteSwitchDashboard.tsx line 204.
- **Bug #2 FIXED: Providers not usable until server restart.**
  - Cause: CRUD API wrote to DB but never called `activeEngine.registerProvider()`. The live engine registry was stale.
  - Fix: Added `syncProviderToEngine()` helper in routes/llm.ts. Called after POST (create) and PUT (update) to immediately instantiate the provider adapter and register it in the live engine.
- **Bug #3 FIXED: No active primary set from DB providers.**
  - Cause: `bootProviderRegistry()` registered providers into the Map but never called `setProvider()` — leaving `this.provider` as the default MockProvider even when real providers existed.
  - Fix: Boot now calls `routeSwitch.setProvider(primary)` both when a global rule exists (sets position-0 provider) and when no rule exists (sets the first DB provider).
- **Bug #4 FIXED: First provider created via UI still uses MockProvider for requests.**
  - Cause: `syncProviderToEngine()` calls `registerProvider()` (adds to Map) but not `setProvider()` (the active primary). Without a routing rule, `resolveProviderChain()` returns `[this.provider]` which was still Mock.
  - Fix: POST endpoint now checks if this is the only enabled provider and no global rule exists — if so, also calls `activeEngine.setProvider()`.
- Files modified: `src/server/routes/llm.ts`, `src/server/index.ts`, `src/ui/views/RouteSwitchDashboard.tsx`
- Build verified: `npx tsc --noEmit` ✓ (0 errors)


**Date:** 2026-06-26
**Agent:** Kiro (LLM Provider Registry — Phase 3+4: UI Complete)

- **RouteSwitch Set-up View fully rebuilt** (`src/ui/views/RouteSwitchDashboard.tsx`):
  - **Section A: Provider Registry** — Lists all saved providers as cards (name, type badge, endpoint/path, key status). Each card has Test/Edit/Delete buttons. "Add Provider" opens an inline form with: name, type selector (OpenAI Compatible / Local GGUF / Mock), type-specific fields (baseUrl + modelId + apiKey for OpenAI; modelPath for GGUF). Test button hits `POST /api/llm/providers/:id/test` and shows latency or error inline.
  - **Section B: Default & Fallback Chain** — Scope tabs: Global | Cerebro | Project | Agent. Project/Agent tabs show dropdown selectors (project list fetched from `/api/projects`, agent list is hardcoded set of known workflows). Displays the current ordered chain for the selected scope with numbered positions, ▲/▼ reorder buttons, ✕ remove button. "Add to Chain" dropdown + button for available providers not yet in chain. "Save Routing Rule" button calls `PUT /api/llm/routing-rules`.
  - **Section C: Free Mode Governor** — Daily cost ceiling slider, external calls toggle, grammar-constrained decoding toggle (preserved from original).
  - **Section D: MCP Connection Manager** — Preserved from original design.
  - Old single-provider config form removed (replaced by the registry).
- **ALL 4 PHASES COMPLETE.** Full implementation delivered:
  - Phase 1: DB tables + CRUD API (8 endpoints)
  - Phase 2: Engine fallback loop + scope resolution + boot sequence + scope context in Cerebro/ScopeLogic
  - Phase 3: UI Provider Registry
  - Phase 4: UI Routing Rules with scope tabs
- Build verified: `npx tsc --noEmit` ✓ (0 errors)
- GitNexus post-check: all modified symbols (initDB, RouteSwitchEngine, OpenAICompatibleProvider, LlamaCppProvider) remain LOW risk
- Files modified this feature: `src/core/basevault/db.ts`, `src/core/routeswitch/engine.ts`, `src/core/routeswitch/adapters/openai-compatible.ts`, `src/core/routeswitch/adapters/llama-cpp.ts`, `src/server/routes/llm.ts`, `src/server/index.ts`, `src/ui/views/RouteSwitchDashboard.tsx`, `src/ui/views/PortGridDashboard.tsx`, `tsconfig.json`


**Date:** 2026-06-26
**Agent:** Kiro (LLM Provider Registry — Phase 2: Engine Integration)

- **RouteSwitchEngine fully rewritten** (`src/core/routeswitch/engine.ts`):
  - New `resolveProviderChain(request)` method queries `llm_routing_rules` in scope hierarchy: agent → project → cerebro → global. First match wins.
  - `execute()` now runs a **fallback loop** over the resolved chain. Skips exhausted providers (via `ProviderHealthState`), catches errors (429s, timeouts), marks them exhausted, and advances to the next provider. Throws only when ALL providers fail.
  - Extracted `_executeWithProvider()` helper for single-provider calls with AgentStop post-evaluation.
  - New `registerProvider(provider)` — adds to registry without changing active primary.
  - New `getRegisteredProviderIds()` — diagnostic helper for boot logging and UI.
  - Renamed `_resolveProvider` → `_resolveProviderViaScoutLogic` for clarity; it now takes the chain's primary as input instead of `this.provider`.
  - `RouteRequest` interface extended with `scope?: 'cerebro' | 'agent'`, `scopeId?: string`, `projectId?: string`.
- **Adapters updated for dynamic IDs** (`src/core/routeswitch/adapters/`):
  - `OpenAICompatibleProvider` constructor: `new OpenAICompatibleProvider(config, customId?)` — defaults to `'openai-compatible'` for backward compat.
  - `LlamaCppProvider` constructor: `new LlamaCppProvider(config, customId?)` — defaults to `'llama-cpp'`.
- **Boot sequence rewritten** (`src/server/index.ts`):
  - New `bootProviderRegistry()` function: loads all enabled rows from `llm_providers`, instantiates adapters with their DB IDs, registers into engine. Reads global routing rule for primary selection. Falls back to env vars → MockProvider if DB is empty.
  - Cerebro generate function now passes `scope: 'cerebro'` for scope-aware routing.
  - ScopeLogic generate function now passes `scope: 'agent', scopeId: 'scopelogic-interview'`.
- **Dead code confirmed:** `executeWithFallback()` in `router.ts` has 0 callers (GitNexus verified). Its pattern is now superseded by the engine's built-in fallback loop.
- Files modified: `src/core/routeswitch/engine.ts`, `src/core/routeswitch/adapters/openai-compatible.ts`, `src/core/routeswitch/adapters/llama-cpp.ts`, `src/server/index.ts`
- Build verified: `npx tsc --noEmit` ✓ (0 errors)


**Date:** 2026-06-26
**Agent:** Kiro (LLM Provider Registry — Phase 1: DB + CRUD API)

- **NEW FEATURE: Multi-Provider LLM Registry with per-scope routing rules.**
- Phase 1 delivers the backend persistence layer and full CRUD API.
- **Database tables added to `initDB()` in `src/core/basevault/db.ts`:**
  - `llm_providers` — id, name, type (openai-compatible|llama-cpp|mock), config_json, api_key_encrypted (AES-256-GCM), is_enabled, created_at, updated_at
  - `llm_routing_rules` — id, scope (global|cerebro|project|agent), scope_id, provider_chain (JSON array of provider IDs in fallback order), created_at, updated_at, UNIQUE(scope, scope_id)
- **New API endpoints added to `src/server/routes/llm.ts`:**
  - `GET /api/llm/providers` — list all providers (keys redacted, returns `hasApiKey: bool`)
  - `POST /api/llm/providers` — create named provider with encrypted key
  - `PUT /api/llm/providers/:id` — update provider fields
  - `DELETE /api/llm/providers/:id` — delete (fails if referenced in rules)
  - `POST /api/llm/providers/:id/test` — test connectivity with a simple prompt
  - `GET /api/llm/routing-rules` — list all routing rules
  - `PUT /api/llm/routing-rules` — upsert rule (scope+scopeId uniqueness)
  - `DELETE /api/llm/routing-rules/:id` — delete a rule
- **Scope hierarchy:** Agent > Project > Cerebro > Global (most specific wins)
- Imports added: `db`, `encrypt`/`decrypt` from crypto.ts, `crypto` for UUID generation
- GitNexus impact analysis: ALL symbols LOW risk. `executeWithFallback()` confirmed 0 callers (dead code).
- Build verified: `npx tsc --noEmit` ✓ (0 errors)
- Also fixed pre-existing PortGridDashboard.tsx type errors and excluded `docs/` from tsconfig.json
- Files modified: `src/server/routes/llm.ts`, `src/core/basevault/db.ts`, `src/ui/views/PortGridDashboard.tsx`, `tsconfig.json`


**Date:** 2026-06-26
**Agent:** Kiro (Proposal Flow UX Overhaul)

- **MAJOR UX FIX: Persistent Proposal Flow implemented.** The interview → approval path is now:
  1. ScopeLogic interview completes → proposal persisted to backend (`POST /api/system/proposals/stage`)
  2. Auto-navigates to PortGrid after 1.5s
  3. PortGrid detects pending proposal (`GET /api/system/proposals/pending`) and renders it as a **visual ReactFlow flowchart** with human-readable step labels
  4. Numbered step list shown below the canvas for clarity
  5. Large "Approve & Execute Workflow" button → `POST /api/coreexec/approve` → clears proposal → navigates to CoreExec
  6. "Reject & Return to ScopeLogic" button → clears proposal → navigates back
- **Problem Fixed #1:** Proposals now survive navigation (persisted in `system_settings` table, not React state)
- **Problem Fixed #2:** No more raw JSON for non-technical users — visual flowchart with readable labels
- **ScopeLogic Quarantine downgraded** to a status card: "Proposal Generated — Sent to PortGrid for Visual Review" with collapsible raw JSON for technical operators
- **New backend endpoints:** `POST /api/system/proposals/stage`, `GET /api/system/proposals/pending`, `DELETE /api/system/proposals/pending`
- Files modified: `src/server/routes/system.ts`, `src/ui/views/ScopeLogicDashboard.tsx`, `src/ui/views/PortGridDashboard.tsx`
- Build verified: `npx vite build` ✓ (0 errors)


**Date:** 2026-06-26
**Agent:** Kiro (Project Creation in Right Bar)

- **ProjectSwitcher.tsx** rebuilt with inline "+ New Workspace" button anchored at the bottom of the Right Bar.
- On click, an inline form expands (not a full-page modal) with a name input and "Create & Switch" button.
- On creation: POSTs to `/api/projects` → inserts project with physical workspace directory → immediately switches the global `activeProjectId` context to the new project.
- The new project appears at the top of the project list immediately (optimistic update).
- Escape / X button collapses the inline form without creating.
- Removes the old "No projects yet. Create one from Global Orchestration." text — replaced with "No projects yet. Create one below."
- **No Set-up View involvement** — project creation is a daily operation anchored in the Context Switcher per spec.
- Build verified: `npx vite build` ✓


**Date:** 2026-06-26
**Agent:** Kiro (P2 Fixes — ALL COMPLETE)

- **P2 #7 FIXED:** `POST /api/system/migrate` — runs `initDB()` idempotently. BaseVault migration button wired.
- **P2 #8 FIXED:** `GET /api/system/retention-stats` — returns dbSizeMB, walSizeMB, totalRuns, staleFailedRuns, orphanedLeases. BaseVault Retention widget now fetches real data.
- **P2 #9 FIXED:** `GET/POST /api/system/mcp/connections` — stored as JSON in system_settings. RouteSwitch MCP list renders dynamically.
- **P2 #10 FIXED:** `POST /api/llm/clear-error` — calls `ProviderHealthState.clearAllErrors()`. RouteSwitch "Clear Provider Error" + "Switch to Local Mock" buttons wired.
- **P2 #11 FIXED:** `GET /api/system/tools` — returns registered tool list from system_settings (defaults seeded). PortGrid registry renders from backend.
- **P2 #12 FIXED:** `GET /api/system/agents/permissions` — returns archetype permission matrix. PortGrid matrix renders from backend.
- **P2 #13 FIXED:** PortGrid Tool Telemetry — now subscribes to `/api/scout/events` SSE, appending live TASK_STATUS events to the feed.
- **P2 #14 FIXED:** `POST /api/cerebro/pin-high-confidence` — updates `last_accessed_at` for all memories with `access_count >= 3`. Cerebro "Pin All" button wired.
- Files modified: `src/server/routes/system.ts`, `src/server/routes/llm.ts`, `src/server/routes/cerebro.ts`, `src/core/routeswitch/interceptor.ts`, `src/core/basevault/redactor.ts`, `src/ui/views/PortGridDashboard.tsx`, `src/ui/views/RouteSwitchDashboard.tsx`, `src/ui/views/BaseVaultDashboard.tsx`, `src/ui/views/CerebroDashboard.tsx`
- Build verified: `npx vite build` ✓ (0 errors)
- **ALL 14 GAPS FROM THE SYNC PLAN ARE NOW CLOSED. UI and backend are fully synchronized.**


**Date:** 2026-06-26
**Agent:** Kiro (P1 Fixes)

- **P1 #3 FIXED:** PortGrid DAG Canvas — no longer a placeholder. Fetches runs from `/api/basevault/runs`, renders a run selector dropdown, and displays DAG nodes from `/api/coreexec/run/:id/status` with status-colored indicators.
- **P1 #4 FIXED:** BaseVault Redaction Monitor — now polls `GET /api/system/redaction-log` every 10s. New backend endpoint added to `system.ts`. `SensitiveDataRedactor` class extended with in-memory ring buffer (max 50 events) tracking every scrub operation (API keys, emails, phones).
- **P1 #5 FIXED:** ScoutDaemon Kill Switch — button now calls `POST /api/system/daemon/kill` (sets `maxWorkers=0`) on terminate, and `POST /api/system/daemon/restart` (restores to `cpus-1`) on restart. Both endpoints created in `system.ts`.
- **P1 #6 FIXED:** ScoutDaemon "Send to PortGrid" — button now POSTs to `POST /api/todos/promote`. New endpoint in `todos.ts` creates a full FK-safe chain (project → workflow_run → task → os_todo) with `severity: MEDIUM`, `required_action_type: APPROVE_PROPOSAL`. Source learning approval marked as `'promoted'`.
- Files modified: `src/ui/views/PortGridDashboard.tsx`, `src/ui/views/BaseVaultDashboard.tsx`, `src/ui/views/ScoutDaemonDashboard.tsx`, `src/server/routes/system.ts`, `src/server/routes/todos.ts`, `src/core/basevault/redactor.ts`
- Build verified: `npx vite build` ✓ (0 errors)
- **All P0 + P1 items complete.** Remaining: 8 P2 items (new endpoint development, can be phased incrementally).


**Date:** 2026-06-26
**Agent:** Kiro (P0 Fixes)

- **P0 #1 FIXED:** ScopeLogic "Approve & Send to CoreExec" button now POSTs the proposal payload to `/api/coreexec/approve`. On success, clears the proposal from the quarantine view.
- **P0 #2 FIXED:** ScoutDaemon "Decision Node Audit" button now POSTs to `/api/scout/heartbeat` to ping the daemon's idle detector.
- Files modified: `src/ui/views/ScopeLogicDashboard.tsx`, `src/ui/views/ScoutDaemonDashboard.tsx`
- Build verified: `npx vite build` ✓ (0 errors)
- P0 items complete. Remaining: 4 P1 items, 8 P2 items.


**Date:** 2026-06-26
**Agent:** Kiro (Full Audit)

- Created initial plan from comprehensive documentation + codebase review.
- Reviewed: project-overview.md, architecture.md, progress-tracker.md, MANIFEST.md, AGENTS.md, CLAUDE.md, ai-workflow-rules.md, code-standards.md, and all _working.md files.
- Reviewed: All 12 server route files, all 8 dashboard view files, AppShell.tsx, ModuleRouter.tsx, ProjectSwitcher.tsx.
- Identified 14 gaps total: 2 P0 (button wiring), 4 P1 (data integration), 8 P2 (new endpoints).
- Modules fully synced: CoreExec, System View.
- Modules with minor gaps: ScopeLogic (1), Cerebro (1).
- Modules with moderate gaps: BaseVault (3), RouteSwitch (2), ScoutDaemon (3), PortGrid (4).
