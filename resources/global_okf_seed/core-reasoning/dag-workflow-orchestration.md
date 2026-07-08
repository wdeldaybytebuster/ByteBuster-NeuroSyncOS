---
type: concept
title: DAG Workflow Orchestration vs Linear Chaining
description: Representing multi-step LLM pipelines as directed acyclic graphs so independent steps execute concurrently, bounded by critical-path latency instead of total step count.
confidence: 0.95
tags: [orchestration, dag, parallelism, workflow, latency]
category: core-reasoning
source_doc: architectural-evolution-of-large-language-model-workflows-from-linear-chaining-t.md
---

# DAG Workflow Orchestration vs Linear Chaining

## Core Idea
Linear prompt chains force strictly sequential execution even when steps are logically independent, producing an all-or-nothing failure model (a late failure discards the entire run) and total latency `T_seq = sum of t(n_i)` across all N nodes. Representing the workflow as a Directed Acyclic Graph instead lets a scheduler start any node as soon as its direct predecessors complete, bounding latency by the critical path — `T_DAG = max over all paths P of sum of t(n) for n in P` — rather than the sum of every step. Production systems exploiting this report substantial gains: LLMCompiler achieves up to 3.6x speedup by dispatching tool calls as concurrent DAG nodes, and enterprise pipelines report 36-37% wall-clock reductions after migrating from sequential chains to parallelized execution.

## When To Use
Use DAG-based orchestration whenever a workflow contains steps that don't depend on each other's outputs — the more independent branches, the larger the gap between sequential and critical-path latency, and the more parallelization pays off.

## NeuroSync Applicability
Already implemented. `src/core/coreexec/engine.ts` (~lines 95-209) selects "eligible" tasks whose `dependencies` array is fully satisfied by already-completed task IDs (`node.dependencies.every(depId => completedTaskIds.has(depId))`), then dispatches all eligible tasks concurrently through the worker pool via `Promise.all(promises)`. This is a genuine dependency-driven parallel DAG scheduler, not a linear chain. `src/core/coreexec/validateDAG.ts` validates the `dag_template`/`DAGProposal` structure (non-empty `nodes` array with dependency lists) before a run is allowed to execute.

## Tradeoffs / Risks
DAGs forbid cycles by construction, so iterative agentic patterns like reflection loops or self-correction require a different topology (e.g. LangGraph's cyclic state-machine model) layered on top or alongside the DAG. Translating a workflow into a well-formed DAG also requires either manual authoring or a natural-language-to-DAG compilation step (see `natural-language-to-dag-compilation.md`), and a malformed or cyclic graph must be caught by validation before execution — an unchecked DAG proposal risks an infinite dependency wait or unsafe task ordering.
