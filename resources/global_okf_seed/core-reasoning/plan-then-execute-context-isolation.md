---
type: concept
title: Plan-then-Execute Context Isolation
description: A strategic planner generates a complete, ordered plan up front; a separate executor is then invoked per-step with only that step's inputs, never the full running history — preventing quadratic context growth and stopping local failures from corrupting the global plan.
confidence: 0.95
tags: [plan-and-execute, architecture, context-management, isolation]
category: core-reasoning
source_doc: comparative-analysis-of-plan-and-solve-and-plan-and-execute-architectures-in-lar.md
---

# Plan-then-Execute Context Isolation

## Core Idea
In a canonical Plan-then-Execute (P-t-E) agent, a strategic planner π_g receives the user goal, environment state, and planner memory, and produces a structured plan p = (s_1, ..., s_m) — an ordered sequence of subgoals. A separate executor π_θ is then invoked per subgoal, conditioned only on the global objective, the single active plan step, and that step's own local action/observation history — not the full accumulated trace. This resolves ReAct's core scaling flaw: because a standard ReAct loop must re-append its entire running history at every turn, it suffers quadratic context growth, rising token cost, and error propagation if any single tool call fails. P-t-E's unidirectional flow keeps the executor's input flat and isolates local failures from the global plan.

## When To Use
Use Plan-then-Execute when a task decomposes cleanly into a known sequence of subgoals up front, latency/cost from repeatedly re-serializing full history is a concern, or isolating tool-call failures from corrupting the overall plan matters more than the flexibility of re-planning after every single action.

## NeuroSync Applicability
Partially implemented. `src/core/scopelogic/interview.ts` generates a complete `DAGProposal` (the plan) which is persisted before execution begins, and `src/core/coreexec/engine.ts` (`executeRun`) then dispatches each node to a worker with only that node's own `prompt` (via `classifyDirective`/`_coreExecGenerateFn(prompt)`) plus its dependency-completion status — not the full accumulated run history of every other node's thoughts/actions/observations. This matches the source's core context-isolation mechanic, though NeuroSync's "executor" is a deterministic command/LLM dispatcher per node rather than a full agentic sub-executor with its own action/observation sub-loop.

## Tradeoffs / Risks
Because the plan is generated once up front, P-t-E is less adaptive than ReAct to genuinely novel information discovered mid-execution — a step that reveals the original plan is wrong requires an explicit re-planning trigger rather than adapting on the next turn automatically. The source notes LangGraph implementations typically add a conditional edge back to the planner for this reason; NeuroSync's `CoreExec` currently fails the entire run on any task failure (see `dynamic-task-graph-ready-set-scheduling`) rather than triggering dynamic re-planning.

## Note
This node's Core Idea intentionally overlaps with `dynamic-task-graph-ready-set-scheduling` (multi-agent-orchestration) — that node covers the DAG *scheduling* mechanics (ready-set, parallel dispatch), while this node covers the *context-isolation* property (why the executor only sees one step's data) from the Plan-and-Execute literature specifically.
