**SUMMARY OF ORIGINAL DOCUMENT (ui-context.md):**
Visual and component standards for NeuroSync Sovereign OS PortGrid UI. Dark-themed glassmorphism aesthetic. Tech: Tailwind CSS 3.4 + PostCSS + @xyflow/react + Lucide React icons. Confirmed component inventory: 19 components (ApprovalCockpit, AgentKPIStrip, AutonomyDials, CerebroHealthWidget, CronSummary, GovernorUI, IntentPreview, LearningApprovalsQueue, NodeOutputInspector, NotificationCenter, ProjectManager, RouteSwitchConfig, RoutingDials, RunHistory, ScopeLogicChat, SettingsModal, Statusline, ThemeContext, ThemeToggle) + 7 views (UnifiedMasterDashboard, BaseVaultDashboard, CerebroDashboard, CoreExecDashboard, RouteSwitchDashboard, ScopeLogicDashboard, ScoutDaemonDashboard). SSE integration via EventSource at port 3743. Status badges including blocked-by-validation (amber ⛔). Council Mode confidence scoring from council.ts. Light/dark mode support.

===

<!-- Append-only log of changes — newest first -->

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
