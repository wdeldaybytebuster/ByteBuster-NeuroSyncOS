---
type: concept
title: Passive Checkpointing vs Active Durable Execution
description: Checkpointing snapshots agent state but requires manual, operator-driven recovery, while durable execution replays an event-sourced log to automatically resume without redundant LLM billing.
confidence: 0.95
tags: [durable-execution, checkpointing, crash-recovery, event-sourcing, agent-reliability]
category: safety-reliability
source_doc: engineering-resilient-agentic-systems-a-comprehensive-blueprint-for-idempotent-e.md
---

# Passive Checkpointing vs Active Durable Execution

## Core Idea
Passive checkpointing (e.g. LangGraph, CrewAI) serializes agent state snapshots at execution boundaries but has no automatic recovery mechanism — a separate orchestration layer must detect a crash, spin up a new process, deserialize state, and manually route past completed steps. It also typically does not persist the agent's exact internal execution cursor (e.g. mid-ReAct-loop position), so a crash there forces re-running the whole logical step, and concurrent resume attempts without distributed locking can duplicate execution. Active durable execution (Temporal, DBOS, AWS Step Functions Standard Workflows) is event-sourced: every step and side effect is a deterministic log entry in an append-only history, and the runtime automatically detects failure, reassigns workers, and replays the event log — when replay hits an activity that already succeeded, it returns the stored result instead of re-invoking the LLM, avoiding redundant token spend.

## When To Use
Use checkpointing when periodic state snapshots for observability/debugging suffice and manual, operator-driven resume is acceptable; use durable execution when agents must survive infrastructure failures fully automatically without human intervention or redundant LLM billing.

## NeuroSync Applicability
Partially implemented. `resumeInProgressRuns()` (`src/core/coreexec/engine.ts`) is called once at server boot and re-drives any `workflow_runs` left at `status='running'` or `'pending'` after a crash by calling the same `executeRun()` loop again. Because `executeRun()` re-reads live task state and skips tasks already marked `'completed'` (per the source code's own comment: "task-state-driven... re-reads live task state, recognises tasks already 'completed' and never re-runs them"), this is closer to automatic durable-execution-style resume than to passive checkpointing requiring manual operator intervention — but it is not full event-sourced replay: there is no append-only event log of every LLM call and side effect, just current task status in the `tasks` table.

## Tradeoffs / Risks
Full event-sourced durable execution frameworks add significant infrastructure complexity (a durable execution engine, activity/workflow separation, deterministic replay constraints on workflow code). LangGraph's naive full-snapshot checkpointing exhibits quadratic (O(N^2)) storage growth over a long-lived thread, which its Delta Channels optimization addresses by persisting only per-step diffs — reducing a 200-turn agent's storage footprint from 5.3 GB to 129 MB in the source's benchmark.
