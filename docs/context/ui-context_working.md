**SUMMARY OF ORIGINAL DOCUMENT (ui-context.md):**
Visual and component standards for NeuroSync Sovereign OS PortGrid UI. Dark-themed glassmorphism aesthetic. Tech: Tailwind CSS 3.4 + PostCSS + @xyflow/react + Lucide React icons. Confirmed component inventory: 19 components (ApprovalCockpit, AgentKPIStrip, AutonomyDials, CerebroHealthWidget, CronSummary, GovernorUI, IntentPreview, LearningApprovalsQueue, NodeOutputInspector, NotificationCenter, ProjectManager, RouteSwitchConfig, RoutingDials, RunHistory, ScopeLogicChat, SettingsModal, Statusline, ThemeContext, ThemeToggle) + 7 views (UnifiedMasterDashboard, BaseVaultDashboard, CerebroDashboard, CoreExecDashboard, RouteSwitchDashboard, ScopeLogicDashboard, ScoutDaemonDashboard). SSE integration via EventSource at port 3743. Status badges including blocked-by-validation (amber ⛔). Council Mode confidence scoring from council.ts. Light/dark mode support.

===

<!-- Append-only log of changes — newest first -->

### [2026-06-26] Sidebar State Persistence Across Module Navigation
**Agent:** Kiro (UI Rebuild)

- **OSLayout.tsx** — Lifted `leftBarOpen` / `rightBarOpen` state from AppShell (local) into `NavigationContext` (global)
- **AppShell.tsx** — No longer uses local `useState` for sidebar state; reads/writes from context instead
- **Effect:** When user opens left or right sidebar and switches modules, sidebars remain in their current state (open stays open, closed stays closed)
- **No visual change** — behavior-only fix for persistence

### [2026-06-26] Unified Master Dashboard Rebuilt as "System View" + Cerebro Logo/Color Fix
**Agent:** Kiro (UI Rebuild)

- **UnifiedMasterDashboard.tsx** fully rebuilt using `AppShell` wrapper, renamed to **"System View"** in ModuleRouter
- **Logo:** Uses `NeuroSyncSovereignOSLogo.png`
- **Accent color:** `#D4AF37` (sovereign gold) — matches the NeuroSync OS brand identity
- **Glow box styling:** gold glow `rgba(212,175,55,0.08)` → `rgba(212,175,55,0.2)` on hover
- **Dashboard View** (project-scoped):
  - Widget A: OS KPI Strip — live SSE from `/api/system/metrics` (workers, CPU load, 24h tokens, API cost, memory vectors)
  - Widget B: Action Center — renders `NotificationCenter` component (os_todos escalations with resolve actions)
  - Widget C: Cerebro Health — vector count, status, last sweep timestamp, "Trigger Consolidation" button calling `/api/cerebro/habituate`
  - Widget D: Scheduled Workflows — renders `CronSummary` component (full width, spanning 2 columns)
- **Set-up View** (ignores project filter):
  - Control A: Global Polling & Concurrency — polling interval slider (1s-30s), max concurrent tasks, claim batch size
  - Control B: Observability & Logging — Pino log level selector (debug/info/warn/error/silent)
  - Control C: Master UI & Theme — Dark/Light/System theme selector via `useTheme()`, SmartTips global kill-switch, reduced motion toggle
- **Also fixed:** Cerebro Dashboard updated to use correct `CerebroLogo.png` and teal/gold color scheme (`#2DD4BF` / `#D4AF37`)
- **ModuleRouter updated:** "Global Orchestration" renamed to "System View"
- **Build passes cleanly**

- **CerebroDashboard.tsx** fully rebuilt using `AppShell` wrapper (decoupled from BaseVault per Drift Analysis)
- **Accent color:** `#3B82F6` (neural-blue) with `#F59E0B` (gold) for habituation/decay indicators
- **Glow box styling:** `shadow-[0_0_15px_rgba(59,130,246,0.08)]` default → `shadow-[0_0_30px_rgba(59,130,246,0.2)]` on hover
- **Dashboard View** (project-scoped):
  - Widget A: Learning Approvals Interface — fetches `/api/cerebro/learning-approvals`, approve/reject buttons promoting or discarding inferences, confidence % color-coded
  - Widget B: Memory Browser & Topology — vector search via `/api/cerebro/vector-search`, displays distance + habituation score, health stats (vector count, status, last reflection)
  - Widget C: Habituation Decay & Pruning Monitor — active/nearing-decay/pruned counts, "Trigger Consolidation Sweep" button calls `/api/cerebro/habituate`, "Pin All High-Confidence" action
- **Set-up View** (ignores project filter):
  - Control A: Retrieval Engine — minSimilarity slider (0.10-0.90), keyword fallback toggle with base score + match boost sub-sliders
  - Control B: Habituation Scoring — decay formula displayed with live variables, idle-dampening multiplier (0.10-1.00), access-boost multiplier (1.0-3.0)
  - Control C: Global Knowledge Base (GLOBAL scope) — lists loaded system docs, security warning about PII prohibition
- **Note:** Module logo uses NeuroSyncSovereignOSLogo.png as placeholder until dedicated Cerebro logo is created
- **Build passes cleanly**

- **ScoutDaemonDashboard.tsx** fully rebuilt using `AppShell` wrapper
- **Accent color:** `#8E24AA` (purple) with `#d05ce3` (light purple) for text/indicators
- **Glow box styling:** `shadow-[0_0_15px_rgba(142,36,170,0.08)]` default → `shadow-[0_0_30px_rgba(142,36,170,0.2)]` on hover
- **Dashboard View** (project-scoped):
  - Widget A: Ambient Vanguard Monitor — Deference UI with color-coded state indicator (passive/active/quarantine/sleeping), intent preview tree, derived from SSE `/api/system/metrics`
  - Widget B: Quarantine Staging & Discovery Ledger — fetches `/api/cerebro/learning-approvals` + `/api/todos`, "Send to PortGrid" buttons, displays inert draft findings
  - Widget C: Hardware-Adaptive Telemetry — live CPU utilization %, temperature °C, daemon state derived from load, all via SSE stream with color-coded thresholds
- **Set-up View** (ignores project filter):
  - Control A: AgentStop (Predictive Early Termination) — entropy kill threshold slider (0.30-0.95), max token burn per task slider (500-10,000)
  - Control B: Passive Ingestion Modalities — SSE toggle (recommended), HTTP polling toggle (battery warning), Manual Scout Mode toggle
  - Control C: Idle-Detection & Hardware Yield — CPU temperature ceiling slider (60-95°C), 1-min load average ceiling slider (0.30-2.00)
  - Control D: Absolute Manual Kill Switch — prominent red SIGKILL button, toggles between terminate/restart, red glow when active, green when restarting
- **Build passes cleanly**

- **PortGridDashboard.tsx** fully rebuilt using `AppShell` wrapper
- **Accent color:** `#00FFCC` (mint/teal) — applied to glow boxes, badges, buttons, tool registry
- **Glow box styling:** `shadow-[0_0_15px_rgba(0,255,204,0.08)]` default → `shadow-[0_0_30px_rgba(0,255,204,0.2)]` on hover
- **Dashboard View** (project-scoped):
  - Widget A: Interactive DAG Canvas — @xyflow/react placeholder with editor shortcuts (Ctrl+Z, Ctrl+D), grid background
  - Widget B: HITL Approval Queue — fetches `/api/todos`, approve/decline buttons, zero-trust gate badge, calls `/api/todos/resolve`
  - Widget C: Verifiable Confidence Badges — 8 illuminated badges (Local Only, Redacted, Human Approved, Source Linked, Low Confidence, Quota Protected, Project Scoped, Sandbox Enforced) with Gold/Amber/Red confidence brackets
  - Widget D: Active Tool Telemetry — live feed of tool invocations with valid/malformed status
- **Set-up View** (ignores project filter):
  - Control A: Capability Broker — tool registry grid (read_file, write_file, list_directory, run_command, git_nexus, sqlite_vec) with type and status
  - Control B: Agent-Tool Permissions Matrix — grid showing code_execute, research_only, admin_operator access levels per tool category
  - Control C: P0 Command Sandbox — 4-layer quarantine (19 command allowlist, env stripping, directory lock, file-arg validation toggles)
  - Control D: Accessibility & SmartTips — SmartTips toggle, reduced motion, ARIA enforcement, persisted to `/api/system/settings`
- **Build passes cleanly**

- **ScopeLogicDashboard.tsx** fully rebuilt using `AppShell` wrapper
- **Accent color:** `#00E5FF` (stealth cyan) — same family as CoreExec for the reasoning/synthesis engine
- **Glow box styling:** cyan glow matching CoreExec pattern
- **Dashboard View** (project-scoped):
  - Widget A: Bounded Interview Pipeline — real-time chat UI, fetches history from `/api/scopelogic/history`, sends to `/api/scopelogic/prompt`, capped at 8 rounds, reset button calls `/api/scopelogic/reset`
  - Widget B: Draft Proposal Quarantine — zero-trust staging zone, displays generated DAG JSON, approve/reject buttons for sending to CoreExec
  - Widget C: Confidence & Triage Ledger — multi-model consensus score with progress bar, behavioral assertion violation alerts
- **Set-up View** (ignores project filter):
  - Control A: Grammar-Constrained Decoding — GBNF enforcement toggle, rationale-first schema injection, thinking token suppression
  - Control B: System Prompt Governance — version display (v3.2.1), last modified timestamp, safety gate status
  - Control C: Multi-Model Consensus Tuning — high-stakes threshold slider (50-100%), max disagreement score slider (0.10-0.80)
  - Control D: Behavioral Assertion Framework — SA-01/02/04/06 locked mandatory, SI-01/03/05 and QR-01 toggleable per operator preference
- **Build passes cleanly**

- **RouteSwitchDashboard.tsx** fully rebuilt using `AppShell` wrapper
- **Accent color:** `#FFB300` (amber) — applied to glow boxes, buttons, sliders, status indicators
- **Glow box styling:** `shadow-[0_0_15px_rgba(255,179,0,0.08)]` default → `shadow-[0_0_30px_rgba(255,179,0,0.2)]` on hover
- **Dashboard View** (project-scoped):
  - Widget A: 24h Telemetry & Quota Ledger — polls `/api/llm/usage` every 5s, shows tokens/requests/cost/calls-remaining with progress bar
  - Widget B: LLM Fleet Health — provider status cards (Local Mock, OpenRouter, OpenCode Zen) with 3-level fallback cascade visualization
  - Widget C: Routing Alerts — forecasting blockers with quick-fix buttons (switch to mock, clear provider error)
- **Set-up View** (ignores project filter):
  - Control A: Provider & Credential Config — provider type selector, base URL, model ID (supports "Auto"), API key input, POSTs to `/api/llm/config`
  - Control B: Free Mode Governor — daily cost ceiling slider ($0-$10), external calls toggle, persisted to `/api/system/settings`
  - Control C: MCP Connection Manager — lists active MCP servers (SQLite Vector, GitNexus) with transport/status
  - Control D: Routing Priorities — deterministic policy ordering + grammar-constrained decoding toggle (GBNF enforcement)
- **Build passes cleanly**

- **BaseVaultDashboard.tsx** fully rebuilt using `AppShell` wrapper (same template as CoreExec)
- **Accent color:** `#D4AF37` (sovereign gold) — applied to glow boxes, buttons, sliders, status text
- **Glow box styling:** `shadow-[0_0_15px_rgba(212,175,55,0.08)]` default → `shadow-[0_0_30px_rgba(212,175,55,0.2)]` on hover
- **Dashboard View** (project-scoped):
  - Widget A: SQLite Explorer — read-only run table from `/api/basevault/runs`, live DB stats (size, latency, WAL checkpoints polling every 3s)
  - Widget B: Data Sanitization Monitor — real-time redaction log showing intercepted PII/keys
  - Widget C: Retention & Pruning Ledger — pruned runs count, orphaned workspaces, disk savings
- **Set-up View** (ignores project filter):
  - Control A: Sovereign Portability — live backup via SSE (`/api/system/backup`) with progress bar, restore via file upload (`/api/system/restore`)
  - Control B: Zero-Trust Redaction Engine — 3-level toggle (Public/Internal/Confidential) persisted to `/api/system/settings`
  - Control C: Database Health — retention sliders (max runs 10-500, max days 7-90), schema migration trigger button
- **Build passes cleanly**

**BREAKING CHANGE: Permanent left sidebar removed from OSLayout.**

- **OSLayout.tsx** rewritten as thin full-screen shell with `NavigationContext` provider exposing:
  - `activeView` / `navigate()` — module routing
  - `activeProjectId` / `activeProjectName` / `setActiveProject()` — project filter state
- **New Shared Components Created:**
  - `AppShell.tsx` — Standardized wrapper every module uses. Contains:
    - **Top Nav Bar** (persistent): Brand ("ByteBuster NeuroSyncOS v2.1") + dynamic module logo/name + Dashboard/Set-up view toggle buttons + active project filter badge
    - **Left Bar** (hideable, overlay): `ModuleRouter` — lists all 8 modules with active highlight
    - **Right Bar** (hideable, overlay): `ProjectSwitcher` — fetches from `/api/projects`, includes "Global" option, shows current filter clearly
  - `ModuleRouter.tsx` — Navigation list with per-module accent colors and active state
  - `ProjectSwitcher.tsx` — Backend-integrated project list with Global option, live filter display
- **CoreExecDashboard.tsx** fully rebuilt to new spec:
  - **Dashboard View** (responds to project filter):
    - Widget A: DAG Run Monitor — fetches `/api/basevault/runs`, selects a run, polls `/api/coreexec/run/:id/status` every 5s, displays task nodes with status icons
    - Widget B: Escalation & Alerts Ledger — renders existing `NotificationCenter` component (os_todos)
    - Widget C: Workflow Scheduler — renders existing `CronSummary` component
  - **Set-up View** (ignores project filter):
    - Control A: Engine Tuning — renders existing `AutonomyDials` component (thread pool + budget sliders)
    - Control B: DAG Safety — max iterations slider (1-15), persisted to `/api/system/settings`
    - Control C: Recovery Rules — auto-requeue toggle + snapshot-on-crash toggle, persisted to backend
- **Visual identity preserved:** CoreExec accent `#00E5FF`, glass effects, glow patterns remain via existing Tailwind theme variables
- **Build verified:** `npx vite build` passes cleanly (83 modules, 0 errors)

**Date:** 2026-06-26
**Agent:** Maintenance Agent (Antigravity)

- System-wide TypeScript type resolution completed.
- Backend type errors (165 tests) passing and cleared.
- Successfully bootstrapped missing dependencies in Next.js `ui-next` directory.
- Root TSConfig optimized for monorepo separation.
- Unfinished tasks in `ts-errors.txt` successfully verified and marked as complete.



**Date:** 2026-06-26
**Agent:** Doc Agent (Documentation Audit)

- FULL REWRITE with confirmed component inventory.
- CONFLICTS RESOLVED:
  - OLD: Component Library listed "shadcn/ui and Radix UI primitives" as component library. FIXED: Source confirms Lucide React for icons, @xyflow/react for canvas — no shadcn/ui import confirmed in source.
  - OLD: No component inventory table. FIXED: Added full 19-component + 7-view inventory with behavioral descriptions.
  - OLD: No SSE integration documentation. FIXED: Added confirmed SSE pattern from App.tsx.
  - OLD: No DAG node status color table. FIXED: Added status → CSS class mapping.
  - OLD: RunHistory did not document `blocked-by-validation` handling. FIXED: Added amber ⛔ entry.
  - OLD: Council Mode confidence scoring not documented. FIXED: Added actual length-heuristic scoring from council.ts (maxDiff thresholds: 0.2 = High, 0.5 = Medium).
- ADDED:
  - CerebroHealthWidget, CronSummary, LearningApprovalsQueue, NotificationCenter, NodeOutputInspector entries.
  - Glass panel CSS variables reference (--primary-glow, --bg-glass, --border-glass, --bg-dots, --accent).
  - Run history status map (blocked-by-validation, completed, failed, running, pending).
  - SSE connection lifecycle description.
- Transitioning to Phase 13 (Free-tier testing).

### [2026-06-26] UI Overhaul - Full Dashboard Suite Redesign Complete
- Fully redesigned and refactored **BaseVault**, **PortGrid**, **ScopeLogic**, **CoreExec**, **RouteSwitch**, **ScoutDaemon**, and **Cerebro** dashboards.
- Applied the "Grit, Not Grime" zero-budget, high-reliability local execution design philosophy.
- Transitioned to "High-Glow" dynamic themes tailored to each module's core function.
- Finalized global styling variables in `index.css`.
- Synchronized all module routes inside `OSLayout.tsx` and `App.tsx` ensuring 100% cohesion across the suite.
