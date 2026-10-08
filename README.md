# NeuroSync Sovereign OS

A local-first, privacy-first AI project orchestrator. It runs as a single Node.js
server with a React dashboard, schedules background agents, and routes requests
across local and free-tier LLM providers -- all state lives in a local SQLite
database, not a third-party cloud service.

## What's here

The system is organized into eight modules, each with its own dashboard:

- **PortGrid** -- capability/tool governance, the workflow approval queue, and an
  embedded project terminal
- **ScopeLogic** -- guided interview engine that turns a request into a DAG proposal
- **RouteSwitch** -- LLM provider registry (API keys persisted in SQLite), fallback
  chains, free-tier-aware routing, and a Council Mode arbitration/confidence log
- **BaseVault** -- the SQLite data layer, backup/restore, redaction settings, and
  project storage with background sync
- **CoreExec** -- the DAG workflow engine, scheduler, crash recovery, and cron jobs
- **ScoutDaemon** -- idle-time background research and hardware monitoring
- **Cerebro** -- conversational memory with decaying vector search and a
  learning-approvals (human-in-the-loop) pipeline
- **CEPH** -- a unified observability layer (logs, metrics, traces, health) that
  consolidates the dashboard and the API behind one abstraction

Backend: Node.js 22, [Hono](https://hono.dev/), `better-sqlite3` (WAL mode),
`sqlite-vec` for local embedding search, and workers via `poolifier`.
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

The server boots a [FreeLLMAPI](https://github.com/williamdeldaymarketing/freellmapi)-compatible
provider setup by default: an OpenAI-compatible base URL and API key live in the
RouteSwitch provider registry and persist in the local SQLite database, so the UI's
RouteSwitch Set-up screen can configure and test providers without needing env vars.

RouteSwitch also supports a router-side ensemble: request `model="fusion"` on a
chat completion and the router fans the request out and returns one answer.
NeuroSync does not run that ensemble -- it passes the model id through and, for
OpenAI-compatible and FreeLLMAPI providers, reports the `X-Routed-Via` response
header so the dashboard can show which upstream served the call. Optional
per-request fields can be supplied via `extraBody` (a trusted-caller setting from
config or a provider row); it can never override the model, the prompt, or the
structured output format, and prototype-key names (`__proto__`, `constructor`,
`prototype`) are refused outright. See
[docs/architecture/FUSION.md](./docs/architecture/FUSION.md) for the full
contract, the authoritative denied-key list, the provider-by-provider coverage,
and the time budgets involved.

The UI isbuilt to use the 2026 Unified MCP standard. When deployed as a Tauri
bundle it ships its own 32-bit sidecar wrapper; the remainder of the stack -- 
server, UI dev server, tests -- all run plain under Node.js on a desktop or an edge
host.

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
