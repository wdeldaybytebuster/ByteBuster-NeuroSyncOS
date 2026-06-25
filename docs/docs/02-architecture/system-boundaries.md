---
title: "System Boundaries"
status: draft
owner: "williamdeldaymarketing"
last_updated: "2026-06-25"
review_cadence: "weekly"
source_of_truth: true
---

# System Boundaries

## Boundary Mapping

| Module | Owns | Must Not Own | Public Interface |
| --- | --- | --- | --- |
| `src/core/coreexec` | Workflow runs, task execution queues, retries, restart states, task leases | Model routing, UI components, raw SQL schemas | `executeRun()`, `claimTask()` |
| `src/core/basevault` | SQLite database schema, state saving, sensitive data redaction | CoreExec task execution, RouteSwitch providers | `saveRunState()`, `getRedactedLog()` |
| `src/core/routeswitch` | Provider registration, error normalization, fallback cascades, MCP adapters | Workflow run logs, user dashboards | `routeQuery()`, `listTools()` |
| `src/core/memory` | Memory nodes, salience scoring, decay math, project scoping | Database table migrations | `retrieveContext()`, `saveMemory()` |

## Implementation Log Rollup (2026-06-26)

- [2026-06-25] Realized system boundaries in code: src/core/coreexec, src/core/basevault, src/core/scopelogic, and src/ui for PortGrid.
