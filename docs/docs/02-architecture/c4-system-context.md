---
title: "C4 System Context"
status: draft
owner: "williamdeldaymarketing"
last_updated: "2026-06-25"
review_cadence: "weekly"
source_of_truth: true
---

# C4 System Context

## System Context Diagram

```mermaid
graph TD
    User[Beginner Hobbyist / Freelancer] -->|Interacts with UI| PortGrid[NeuroSync Sovereign OS Cockpit]
    PortGrid -->|API Calls / Function Calls| CoreExec[Core Execution Engine]
    CoreExec -->|Persists State| BaseVault[SQLite BaseVault DB]
    CoreExec -->|Routes LLM queries| RouteSwitch[RouteSwitch universal traffic director]
    RouteSwitch -->|Local fallback queries| MockProvider[Local Mock LLM / Offline Mode]
    RouteSwitch -->|Outbound LLM queries| OpenRouter[OpenRouter / OpenCode Zen API]
    RouteSwitch -->|Executes tools| MCP[External MCP Tools]
```

## System Elements

- **User:** Manages client work and executes AI workflow tasks locally.
- **NeuroSync Cockpit:** The Next.js dashboard providing visual approval queues and Local Proof Badges.
- **CoreExec Engine:** Orchestrates transactional execution of DAGs.
- **BaseVault DB:** Local SQLite instance containing all runs, memory, and logs.
- **RouteSwitch:** Deterministic traffic router enforcing Free Mode limits.
