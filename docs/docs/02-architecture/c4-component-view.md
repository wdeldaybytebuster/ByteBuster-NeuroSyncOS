---
title: "C4 Component View"
status: draft
owner: "williamdeldaymarketing"
last_updated: "2026-06-25"
review_cadence: "weekly"
source_of_truth: true
---

# C4 Component View

## Component Diagram

```mermaid
graph TD
    API[Hono Router API] --> CoreExec[CoreExec Queue & Executor]
    API --> ScopeLogic[ScopeLogic Interview Engine]
    API --> BaseVault[BaseVault DB Adapter]
    CoreExec --> BaseVault
    CoreExec --> RouteSwitch[RouteSwitch Traffic Director]
    RouteSwitch --> ProviderReg[Provider Registry]
    RouteSwitch --> PolicyEngine[Routing Policy Engine]
    RouteSwitch --> QuotaLedger[Quota Ledger Adapter]
    RouteSwitch --> MCPAdapter[MCP Adapter Layer]
```

## Key Components

- **CoreExec:** Asymmetric state machine executing workflow DAG tasks.
- **RouteSwitch:** Composed of the Provider Registry, Routing Policy Engine, Quota Ledger, and MCP Adapter to manage model and tool routing.
- **BaseVault:** DB adapter managing read-write SQLite locks.
- **ScopeLogic:** Bounded interview logic creating draft DAG layouts.
