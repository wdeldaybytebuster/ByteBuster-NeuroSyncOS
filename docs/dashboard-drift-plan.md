# Dashboard Drift Analysis & Correction Plan

## 1. Current State Overview
A review of the `src/ui/views/` directory reveals four existing dashboards:
- `UnifiedMasterDashboard.tsx`
- `CoreExecDashboard.tsx`
- `RouteSwitchDashboard.tsx`
- `CerebroDashboard.tsx`

## 2. Identified Drift & Misplaced Components

### UnifiedMasterDashboard (At-A-Glance Hub)
- **Misplaced Widget:** The `GovernorUI` component is currently rendered inside the "CoreExec Engine" panel. According to the canonical architecture, the "Free Mode Governor" and API quota budgets are strictly owned by **RouteSwitch**, not CoreExec.
- **Correction:** Move `GovernorUI` out of the CoreExec block and place it under a RouteSwitch-themed panel, or reserve it exclusively for the dedicated RouteSwitch Dashboard.

### CerebroDashboard (Memory Interface)
- **Merged Boundaries:** The current dashboard is titled "CEREBRO / BASEVAULT" and combines logical memory (Vector Search, Habituation, Learning Approvals) with raw physical database access (SQLite Explorer). 
- **Correction:** The "BaseVault SQLite Explorer" must be decoupled. BaseVault (physical persistence, schemas, WAL, backups) is a separate canonical system from Cerebro (logical knowledge graph). 

### RouteSwitchDashboard (Traffic Director)
- **Missing Capability:** The dashboard correctly handles provider configs, fallback monitoring, and cost ceilings, but completely lacks an interface for managing **external Model Context Protocol (MCP) connections**, which is a core canonical responsibility of RouteSwitch.
- **Correction:** Introduce an "MCP Connection Manager" panel to RouteSwitch.

## 3. Missing Dashboards

The following canonical systems currently have no dedicated UI surfaces in PortGrid:

1. **BaseVault Dashboard:** Needs to be created by extracting the SQLite Explorer from Cerebro, and adding UI for local backups, data sanitization loops, and snapshot restoration.
2. **ScopeLogic Dashboard:** Missing the interface for the "Research & Synthesis Engine". Needs a surface for requirements-gathering interviews and visualizing draft-only DAG proposals before they hit CoreExec.
3. **ScoutDaemon Dashboard:** Missing the vanguard monitoring UI. Needs a "Quarantine Staging" interface where the operator can review and approve dependency updates or market shifts discovered during system idle time.

## 4. Execution Plan for Correction

**Step 1: Unify and Correct the Master Dashboard**
- Refactor `UnifiedMasterDashboard.tsx` to ensure each sub-panel correctly aligns with its namesake (e.g., swapping `GovernorUI` to a RouteSwitch panel).
- Ensure it properly acts as the **PortGrid** approval cockpit by elevating the `NotificationCenter` (which handles dynamic escalation approvals).

**Step 2: Decouple Cerebro and BaseVault**
- Extract the SQLite query components from `CerebroDashboard.tsx`.
- Create a new `BaseVaultDashboard.tsx` focused purely on storage, schemas, and persistence health.

**Step 3: Build the Missing UI Shells**
- Scaffold `ScopeLogicDashboard.tsx` (focused on chat/interview UI and draft DAG visualization).
- Scaffold `ScoutDaemonDashboard.tsx` (focused on background alerts and quarantine approvals).

**Step 4: Enhance RouteSwitch**
- Add the MCP tool adapter configuration panel to `RouteSwitchDashboard.tsx`.
