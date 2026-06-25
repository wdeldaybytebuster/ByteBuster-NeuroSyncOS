---
title: "C4 Container View"
status: draft
owner: "williamdeldaymarketing"
last_updated: "2026-06-25"
review_cadence: "weekly"
source_of_truth: true
---

# C4 Container View

## Container Diagram

```mermaid
graph TB
    subgraph Local Machine
        Browser[Web Browser] -->|HTTP / WebSocket| UI[Next.js PortGrid UI Container]
        UI -->|Function Calls / IPC| Server[Hono Node.js Server Container]
        Server -->|SQLite Driver| DB[(SQLite BaseVault Database)]
        Server -->|CDP / stdio| MCP[MCP Tools Processes]
    end
    Server -->|HTTPS| OpenRouter[External OpenRouter API]
```

## Containers

- **Web Browser:** Renders the PortGrid cockpit dashboard.
- **Next.js PortGrid UI:** Desktop-shell dashboard using xyflow for DAG layouts.
- **Hono Node.js Server:** Main backend process hosting CoreExec, BaseVault, RouteSwitch.
- **SQLite Database:** Local persistent database file.
