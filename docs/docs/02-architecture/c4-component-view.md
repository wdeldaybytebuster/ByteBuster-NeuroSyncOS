---
title: "C4 Component View"
status: draft
owner: "williamdeldaymarketing"
last_updated: "2026-07-08"
review_cadence: "weekly"
source_of_truth: true
---

# C4 Component View

## Component Diagram

```mermaid
graph TD
    API[Hono Router - 10 routers under src/server/routes] --> CoreExec[CoreExec Queue and Executor]
    API --> ScopeLogic[ScopeLogic Interview Engine]
    API --> PortGrid[PortGrid Approval Queue and Sandbox]
    API --> BaseVault[BaseVault DB Adapter]
    API --> ScoutRouter[ScoutDaemon SSE Router]
    CoreExec --> BaseVault
    CoreExec --> RouteSwitch[RouteSwitch Traffic Director]
    RouteSwitch --> ProviderReg[Provider Registry]
    RouteSwitch --> Governor[Free Mode Governor]
    RouteSwitch --> ModelSelector[Model Selector / Dynamic Router]
    ScopeLogic --> ContextRouter[Tri-modal Context Router]
    ContextRouter --> OKF[OKF Semantic Graph]
    ContextRouter --> GitNexus[GitNexus AST Client]
```

## Key Components

- **CoreExec:** state machine executing workflow DAG tasks, with
  `resumeInProgressRuns()` for crash recovery.
- **RouteSwitch:** Provider Registry + Free Mode Governor (paid-provider
  lock) + Model Selector (`src/core/routeswitch/model-selector/`) +
  fallback/council logic.
- **BaseVault:** DB adapter, migrations, `SensitiveDataRedactor`.
- **ScopeLogic:** bounded interview engine producing draft DAGs with numeric
  confidence.
- **PortGrid:** `CommandSandbox` allowlist for the general command path, plus
  the one sandboxed exception (embedded terminal).
- **Context Router:** picks the right memory store (OKF graph, GitNexus AST,
  or knowledge graph) per query; degrades silently if the `gitnexus` CLI
  isn't installed.
