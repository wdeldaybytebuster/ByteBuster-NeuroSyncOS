---
title: "API Contracts"
status: draft
owner: "williamdeldaymarketing"
last_updated: "2026-07-08"
review_cadence: "weekly"
source_of_truth: true
---

# API Contracts

## HTTP Endpoint Schema Contracts

All backend routes are hosted by the local Hono server on port `3743`
(`src/server/index.ts`, mounts 10 routers from `src/server/routes/`, plus the
SSE scout router and the WebSocket terminal endpoint). CORS is wide-open by
design (local-only tool); payload limit 64KB; naive 120 req/min per-IP rate
limit (exempts `/health` and `/api/config`).

### `coreexecRouter` (`src/server/routes/coreexec-router.ts`)
- `POST /approve` — approve a staged workflow/task proposal.
- `GET /task-health` — completed/parked task counts, retry stats.
- `GET /run/:runId/status` — current status of a `workflow_runs` row.
- `GET /metrics` — task counts and average duration.
- `POST /retry/:runId` — retry a failed run.

### `todosRouter` (`src/server/routes/todos.ts`)
- `GET /` — list `os_todos`, including numeric `confidence` for the
  Deference UI.
- `POST /resolve` — mark a todo resolved.

### Other routers
`cerebro.ts` (memory/chat), `llm.ts` (RouteSwitch provider calls),
`models.ts` (model registry), `okf.ts` (concept graph),
`projects.ts`, `scheduler-list.ts` (CoreExec cron schedules),
`scopelogic-router.ts` (interview engine), `system.ts`, `telemetry.ts`.

This is a routing map, not a full request/response schema reference — read
the router source directly for exact Zod shapes; they change often enough
that hand-copied examples here would drift.
