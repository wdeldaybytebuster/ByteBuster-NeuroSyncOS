**SUMMARY OF ORIGINAL DOCUMENT (dashboard-drift-plan.md):**
Dashboard drift analysis identifying misplaced components (GovernorUI in CoreExec instead of RouteSwitch), merged boundaries (Cerebro+BaseVault), missing dashboards (BaseVault, ScopeLogic, ScoutDaemon), and a correction plan to align UI surfaces with the canonical architecture.

===

<!-- Append-only log of changes — newest first -->

### [2026-06-26] All Drift Corrections Complete — Full UI Rebuild Done
**Agent:** Kiro (UI Rebuild)

- ✅ All 7 modules + System View rebuilt on new AppShell architecture
- ✅ GovernorUI correctly isolated to RouteSwitch Set-up View only
- ✅ Cerebro fully decoupled from BaseVault (separate dashboards, separate concerns)
- ✅ ScopeLogic has dedicated interview + proposal staging + assertion framework
- ✅ ScoutDaemon has dedicated Deference UI + quarantine staging + kill switch
- ✅ PortGrid has tool registry + permissions matrix + sandbox config + HITL queue
- ✅ Sidebar state now persists across module navigation (lifted to NavigationContext)
- ✅ Project filter clearly displayed in top nav; Set-up views show "(ignored)" badge
- ✅ All module logos matched to correct assets
- ✅ Build passes cleanly on every change

### [2026-06-26] UI Rebuild Initiated — New Shell Architecture Approved
**Agent:** Kiro (UI Rebuild)

**Status:** Phase 1 complete. CoreExec template built for approval. Remaining 6 modules pending.

**Drift corrections addressed in this rebuild:**
- ✅ Permanent left sidebar removed — modules now own their full viewport
- ✅ GovernorUI correctly isolated to Set-up views (not mixed across modules)
- ✅ CoreExec Dashboard View shows only DAG runs, alerts, and cron (no misplaced RouteSwitch widgets)
- ✅ Project filtering is explicit: shown in top nav badge, Set-up views clearly marked "(ignored)"
- ✅ All 7 modules listed in shared ModuleRouter for consistent navigation

**New shared shell architecture:**
- `AppShell.tsx` — Top nav bar + hideable left bar (ModuleRouter) + hideable right bar (ProjectSwitcher)
- `ModuleRouter.tsx` — 8 modules with accent colors and active state
- `ProjectSwitcher.tsx` — /api/projects integration with "Global" option and clear filter display
- `OSLayout.tsx` — Thin shell providing NavigationContext (view + project state)

**Remaining drift to address (next phases):**
- BaseVault: Needs its own AppShell-wrapped view (migration tools, redaction, WAL telemetry)
- RouteSwitch: Needs GovernorUI + MCP Connection Manager + fallback cascade visualization
- ScopeLogic: Needs interview loop + draft DAG preview + AI jury consensus
- PortGrid: Needs sandbox test terminal + skills registry + autonomy dials
- ScoutDaemon: Needs SSE sensing stream + todo ledger + idle-detection governance
- Cerebro: Needs neural canvas + frequency tuning + memory search (Gemini API optional)
- UnifiedMasterDashboard: Needs same shell wrapper treatment
