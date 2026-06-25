**Document Summary: System Boundaries**

| Module | Owns | Must Not Own | Public Interface |
| --- | --- | --- | --- |
| `src/core/coreexec` | Workflow runs, task execution queues, retries, restart states, task leases | Model routing, UI components, raw SQL schemas | `executeRun()`, `claimTask()` |
| `src/core/basevault` | SQLite database schema, state saving, sensitive data redaction | CoreExec task execution, RouteSwitch providers | `saveRunState()`, `getRedactedLog()` |
| `src/core/routeswitch` | Provider registration, error normalization, fallback cascades, MCP adapters | Workflow run logs, user dashboards | `routeQuery()`, `listTools()` |
| `src/core/memory` | Memory nodes, salience scoring, decay math, project scoping | Database table migrations | `retrieveContext()`, `saveMemory()` |

===

<!-- Append-only log of changes managed by BaseVault -->

- **2026-06-25:** Executed Dashboard Drift Plan. UI views now strictly mirror backend subsystem boundaries. `GovernorUI` and MCP Manager are explicitly grouped under `RouteSwitchDashboard.tsx` (not CoreExec). SQLite Explorer, Data Sanitization, and Backups are exclusively grouped under `BaseVaultDashboard.tsx` (purged from Cerebro).
