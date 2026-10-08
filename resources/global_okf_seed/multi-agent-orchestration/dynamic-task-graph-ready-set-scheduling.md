---
type: concept
title: Dynamic Task Graph Ready-Set Scheduling
description: Modeling multi-step execution as a directed acyclic task graph where a subtask becomes eligible to run only once all its predecessors are marked done.
confidence: 0.95
tags: [dag, scheduling, task-graph, parallel-execution]
category: multi-agent-orchestration
source_doc: architectural-paradigms,-state-mechanics,-and-robustness-in-hierarchical-multi-a.md
---

# Dynamic Task Graph Ready-Set Scheduling

## Core Idea
The DynTaskMAS framework models execution as a dynamic task graph G_t = (V_t, E_t, W_t, τ_t), where each vertex is an atomic subtask with a status in {pending, ready, running, done}. A vertex enters the "ready" set R_t only when its own status is pending and every predecessor's status is done. A scheduler then maps ready tasks to available agents via a partial assignment function, with the objective of minimizing total execution makespan while respecting dependency and capability constraints.

## When To Use
Apply ready-set scheduling whenever a workflow has subtasks with data or logical dependencies on each other but many of those subtasks are independent of one another — it lets independent branches run concurrently instead of being forced into an artificial sequential order.

## NeuroSync Applicability
Partially implemented. `src/core/coreexec/engine.ts` (`executeRun`) computes exactly this kind of ready set on every scheduling loop: it filters DAG nodes to those that are unclaimed (or have an expired claim lease) and whose `node.dependencies` are all present in the `completedTaskIds` set, then dispatches all eligible tasks in parallel through the worker pool (`workerPool`, bounded by `systemConfig.maxWorkers`), claiming each via `claimTask` to prevent double-execution. This implements the dependency-gated readiness and parallel dispatch mechanics of the source's formal model, but does not implement its cost-weighted makespan optimization (`W_t`, context-transfer cost minimization) — NeuroSync dispatches all eligible tasks up to the available worker-slot count rather than solving for an optimal assignment.

## Tradeoffs / Risks
Ready-set scheduling without cost-aware assignment can starve or serialize branches when the ready set exceeds available worker slots, since NeuroSync's implementation simply truncates to `availableSlots` rather than prioritizing by criticality. A malformed or cyclic DAG that never produces a ready set with all dependencies satisfied results in deadlock, which `executeRun` detects and fails the run for rather than resolving automatically.
