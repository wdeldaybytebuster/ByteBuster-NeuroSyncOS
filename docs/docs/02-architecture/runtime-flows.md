---
title: "Runtime Flows"
status: draft
owner: "williamdeldaymarketing"
last_updated: "2026-06-25"
review_cadence: "weekly"
source_of_truth: true
---

# Runtime Flows

## Standard Execution Sequence

```mermaid
sequenceDiagram
    autonumber
    User->>PortGrid: Click "Approve and Run DAG"
    PortGrid->>CoreExec: executeRun(dag_id)
    CoreExec->>BaseVault: Create Run Snapshot & State Record
    BaseVault-->>CoreExec: Snapshot Persisted
    loop Execute DAG Tasks
        CoreExec->>CoreExec: BEGIN IMMEDIATE Transaction Lease
        CoreExec->>RouteSwitch: routeQuery(task_prompt)
        RouteSwitch->>RouteSwitch: Check Quota & Fallbacks
        RouteSwitch-->>CoreExec: LLM Result
        CoreExec->>BaseVault: Save Task Output & Release Lease
    end
    CoreExec->>PortGrid: Notify Workflow Completed (Local Proof Badge updated)
```

## Restart Recovery Flow

If the system crashes during execution:
1. On boot, CoreExec queries BaseVault for runs marked `running`.
2. It expires any stale task leases.
3. Eligible tasks are requeued.
4. Finished tasks retrieve results from BaseVault, resuming the DAG without duplicating external side effects.
