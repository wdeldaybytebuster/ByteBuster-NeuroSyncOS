# NeuroSync Sovereign OS

A local-first, privacy-first AI project orchestrator. It runs as a single Node.js
server with a React dashboard, schedules background agents, and routes requests
across local and free-tier LLM providers -- all state lives in a local SQLite
database, not a third-party cloud service.

## What's here

The system is organized into six modules, each with its own dashboard:

- **PortGrid** -- capability/tool governance and the workflow approval queue
- **ScopeLogic** -- guided interview engine that turns a request into a DAG proposal
- **RouteSwitch** -- LLM provider registry, fallback chains, and routing rules
- **BaseVault** -- the SQLite data layer, backups, and redaction settings
- **CoreExec** -- the DAG workflow engine, scheduler, and cron jobs
- **ScoutDaemon** -- idle-time background research and hardware monitoring

Backend: Node.js, [Hono](https://hono.dev/), `better-sqlite3` (WAL mode).
Frontend: React + Vite.

## Prerequisites

- Node.js 22 or newer
- npm

## Getting started

```bash
npm install

# Terminal 1: API server (http://localhost:3743)
npm run dev:server

# Terminal 2: UI dev server (http://localhost:3742)
npm run dev:ui
```

## Testing

```bash
npm test              # run the test suite (vitest)
npx tsc --noEmit       # typecheck
npm run build          # production build
```

## Documentation

Everything under [`docs/`](./docs) is organized as follows — read `docs/docs/00-09` for
the current state of the project; the rest are dated logs, in-flight work, or historical
record.

| Where | What it is |
|---|---|
| [`docs/docs/00-09`](./docs/docs) | **Living source of truth.** Charter, product scope, architecture (incl. C4 diagrams and the [UI/confidence model](./docs/docs/02-architecture/ui-conventions-and-confidence-model.md)), security, delivery status, quality, operations, background research, and governance (decisions/risks/open questions). |
| [`docs/implementation-plan-and-progress-tracker.md`](./docs/implementation-plan-and-progress-tracker.md) | Dated, actively-updated progress log — the place to check "is X actually done." |
| [`docs/llm-provider-testing-plan-2026-07-01.md`](./docs/llm-provider-testing-plan-2026-07-01.md) | In-flight: the LLM-provider live-test matrix, not yet complete. |
| [`docs/user-manual.md`](./docs/user-manual.md) | End-user how-to guide. |
| [`docs/archive/`](./docs/archive) | Historical audits and superseded planning docs, kept in full for the record — see its `README.md` for what's there and why. |
| [`docs/templates/`](./docs/templates) | Contributor templates (ADRs, RFCs, review checklists). |

See [SECURITY.md](./SECURITY.md) for how to report a vulnerability, and
[CONTRIBUTING.md](./CONTRIBUTING.md) for how to set up a dev environment and
submit changes.

## License

[Apache License 2.0](./LICENSE)
