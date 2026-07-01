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

Further documentation lives under [`docs/`](./docs), including:

- [User manual](./docs/user-manual.md)
- [Security & privacy model](./docs/docs/04-security/security-privacy-model.md), [threat model](./docs/docs/04-security/threat-model.md)
- [Architecture blueprint](./docs/docs/02-architecture/architecture-blueprint.md)
- [Contributor templates](./docs/templates) (ADRs, RFCs, review checklists)

See [SECURITY.md](./SECURITY.md) for how to report a vulnerability, and
[CONTRIBUTING.md](./CONTRIBUTING.md) for how to set up a dev environment and
submit changes.

## License

[Apache License 2.0](./LICENSE)
