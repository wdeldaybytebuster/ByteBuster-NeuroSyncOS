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
| `src/core/memory` | Memory nodes, salience scoring, decay math, project scoping, Context Router | Database table migrations | `retrieveContext()`, `saveMemory()` |
| `src/core/portgrid` | Approval queue, `CommandSandbox` allowlist, embedded terminal (`terminal-session.ts`) | Workflow execution logic (owned by CoreExec) | `approveTask()`, terminal WS endpoint |
| `src/core/scopelogic` | Interview loop, draft DAG proposal generation, confidence scoring | Execution (draft-only, never runs its own output) | `runInterview()`, `proposeDag()` |
| `src/core/scoutdaemon` | Idle detection, background research, OKF scanning, SSE event emission | Task execution, UI rendering | `scoutEmitter` events |

`src/core/portgrid` and `src/core/coreexec` are permanently separate modules
and dashboards — this boundary must never be merged, even though they once
shared a directory.
