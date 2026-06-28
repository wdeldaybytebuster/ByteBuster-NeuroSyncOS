**Document Summary: System Boundaries**

| Module | Owns | Must Not Own | Public Interface |
| --- | --- | --- | --- |
| `src/core/coreexec` | Workflow runs, task execution queues, retries, restart states, task leases | Model routing, UI components, raw SQL schemas | `executeRun()`, `claimTask()` |
| `src/core/basevault` | SQLite database schema, state saving, sensitive data redaction | CoreExec task execution, RouteSwitch providers | `saveRunState()`, `getRedactedLog()` |
| `src/core/routeswitch` | Provider registration, error normalization, fallback cascades, MCP adapters | Workflow run logs, user dashboards | `routeQuery()`, `listTools()` |
| `src/core/memory` | Memory nodes, salience scoring, decay math, project scoping | Database table migrations | `retrieveContext()`, `saveMemory()` |

===

<!-- Append-only log of changes managed by BaseVault -->

**Date:** 2026-06-26
**Agent:** Maintenance Agent (Antigravity)

- System-wide TypeScript type resolution completed.
- Backend type errors (165 tests) passing and cleared.
- Successfully bootstrapped missing dependencies in Next.js `ui-next` directory.
- Root TSConfig optimized for monorepo separation.
- Unfinished tasks in `ts-errors.txt` successfully verified and marked as complete.



- **2026-06-25:** Executed Dashboard Drift Plan. UI views now strictly mirror backend subsystem boundaries. `GovernorUI` and MCP Manager are explicitly grouped under `RouteSwitchDashboard.tsx` (not CoreExec). SQLite Explorer, Data Sanitization, and Backups are exclusively grouped under `BaseVaultDashboard.tsx` (purged from Cerebro).

### [2026-06-26] UI Overhaul - Full Dashboard Suite Redesign Complete
- Fully redesigned and refactored **BaseVault**, **PortGrid**, **ScopeLogic**, **CoreExec**, **RouteSwitch**, **ScoutDaemon**, and **Cerebro** dashboards.
- Applied the "Grit, Not Grime" zero-budget, high-reliability local execution design philosophy.
- Transitioned to "High-Glow" dynamic themes tailored to each module's core function.
- Finalized global styling variables in `index.css`.
- Synchronized all module routes inside `OSLayout.tsx` and `App.tsx` ensuring 100% cohesion across the suite.
