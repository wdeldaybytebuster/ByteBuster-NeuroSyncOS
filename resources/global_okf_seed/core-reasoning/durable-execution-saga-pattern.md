---
type: concept
title: Durable Execution and the Saga Pattern (Temporal.io)
description: Enterprise workflow engines like Temporal guarantee crash-recoverable execution by replaying an immutable event history, and use compensating "saga" activities to roll back multi-step transactions on failure.
confidence: 0.95
tags: [orchestration, durable-execution, saga-pattern, temporal, fault-tolerance]
category: core-reasoning
source_doc: architectural-evolution-of-large-language-model-workflows-from-linear-chaining-t.md
---

# Durable Execution and the Saga Pattern (Temporal.io)

## Core Idea
Temporal separates workflow execution into deterministic Workflows (pure orchestration logic) and non-deterministic Activities (side-effect-prone actions like calling an LLM or writing to a database). It guarantees durability by storing a complete, immutable transaction history of every step; if a worker crashes mid-workflow, a new worker reconstructs state by replaying that history rather than restarting from scratch. For distributed transactions that touch external systems (e.g. banking, EHR), Temporal implements the Saga Pattern: the workflow registers a compensating activity for every action taken, and if a downstream step fails, the engine executes the compensating steps in reverse order to gracefully roll the system back to its initial state — rather than leaving it in a half-completed condition.

## When To Use
Use durable execution with saga-style compensation for long-running, multi-step pipelines that interact with external, stateful systems where a partial failure must not leave real-world side effects half-applied (e.g. a payment charged but a shipment never scheduled).

## NeuroSync Applicability
Not currently implemented in NeuroSync. `src/core/coreexec/engine.ts` tracks task and run status in SQLite (`tasks`, `workflow_runs` tables) and `validateDAG.ts` can escalate a blocked DAG to `os_todos` for human review, but there is no replay-from-event-history crash recovery, no Activities/Workflow determinism separation, and no compensating-transaction (saga) mechanism that automatically reverses completed steps when a later step in the same run fails.

## Tradeoffs / Risks
The source lists concrete constraints that come with adopting Temporal specifically: a strict 2MB payload limit on inputs/outputs/event history (forcing large documents or context windows to be stored externally and passed by reference), a maximum history size that requires "ContinueAsNew" patterns to truncate long-running loops, and a hard determinism requirement — workflow code cannot make direct network calls, generate random numbers, or read system time outside of an Activity. Temporal is also explicitly general-purpose infrastructure with no native concepts for prompts, token counting, or model providers, requiring custom application-level abstractions on top.
