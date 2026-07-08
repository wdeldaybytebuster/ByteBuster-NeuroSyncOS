---
title: "C4 System Context"
status: draft
owner: "williamdeldaymarketing"
last_updated: "2026-07-08"
review_cadence: "weekly"
source_of_truth: true
---

# C4 System Context

## System Context Diagram

```mermaid
graph TD
    User[Beginner Hobbyist / Freelancer] -->|Interacts with UI| PortGrid[NeuroSync Sovereign OS - Vite/React dashboard]
    PortGrid -->|HTTP / SSE / WebSocket| Server[Hono Node.js Server, port 3743]
    Server -->|Persists State| BaseVault[SQLite BaseVault DB, WAL mode]
    Server -->|Routes LLM queries| RouteSwitch[RouteSwitch traffic director]
    RouteSwitch -->|Local inference| LocalGGUF[node-llama-cpp local GGUF model]
    RouteSwitch -->|Free-tier queries| OpenRouter[OpenRouter / OpenCode Zen APIs]
    Server -->|Idle-time scanning| ScoutDaemon[ScoutDaemon background research]
    PortGrid -->|Human-approved only| EmbeddedTerminal[Sandboxed embedded terminal, bwrap]
```

## System Elements

- **User:** solo developer/operator managing multi-project AI workflows
  locally.
- **Dashboards:** React 19 + `@xyflow/react` frontend, 8 `*Dashboard.tsx`
  views hosted in a shared `AppShell` (top bar, sidebar, developer-mode
  toggle, theme toggle, project filter). No Next.js involved anywhere.
- **Hono Server:** single Node process, CORS-wide-open by design (local-only
  tool), 64KB payload limit, 120 req/min per-IP rate limit (exempts `/health`
  and `/api/config`).
- **BaseVault DB:** local SQLite instance containing all runs, memory, and
  logs — see `docs/docs/02-architecture/data-architecture.md`.
- **RouteSwitch:** deterministic traffic router enforcing Free Mode Governor
  limits; supports both local GGUF inference and outbound free-tier APIs.
