---
title: "C4 Container View"
status: draft
owner: "williamdeldaymarketing"
last_updated: "2026-07-08"
review_cadence: "weekly"
source_of_truth: true
---

# C4 Container View

## Container Diagram

```mermaid
graph TB
    subgraph Local Machine
        Browser[Web Browser] -->|HTTP / WebSocket / SSE| UI[Vite + React 19 UI, src/ui]
        UI -->|HTTP| Server[Hono Node.js Server, src/server, port 3743]
        Server -->|better-sqlite3 driver| DB[(SQLite BaseVault DB, WAL + sqlite-vec)]
        Server -->|bwrap-sandboxed pty| Terminal[Embedded Terminal, PortGrid only, human-launched]
        Server -->|node-llama-cpp| LocalModel[Local GGUF model, local_models/]
    end
    Server -->|HTTPS| OpenRouter[External OpenRouter / OpenCode Zen APIs]
```

## Containers

- **Web Browser:** renders the dashboard suite (PortGrid, CoreExec,
  ScopeLogic, RouteSwitch, BaseVault, ScoutDaemon, CerebroDashboard,
  UnifiedMasterDashboard).
- **Vite + React 19 UI:** `src/ui/main.tsx` → `OSLayout` → one of 8
  `*Dashboard.tsx` views inside a shared `AppShell`. Built with `vite build`,
  served statically in production.
- **Hono Node.js Server:** single process hosting all 6 module backends plus
  the SSE scout router and the WebSocket terminal endpoint
  (`/api/portgrid/terminal/:projectId`).
- **SQLite Database:** local persistent file, ~16 tables (see
  `data-architecture.md`).
- **Embedded Terminal:** the one deliberate exception to the
  no-shell-escape-hatch rule — sandboxed by directory+network containment
  (`--ro-bind`, single project `--bind`, `--unshare-net`, `--clearenv`), never
  auto-opened by an agent.
