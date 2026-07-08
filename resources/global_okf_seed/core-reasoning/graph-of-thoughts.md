---
type: concept
title: Graph of Thoughts (GoT) Reasoning
description: Models LLM reasoning as an arbitrary directed graph of thoughts, enabling merging, refinement loops, and pruning that trees cannot express.
confidence: 0.95
tags: [reasoning, prompting, graph-of-thoughts, deliberation, aggregation]
category: core-reasoning
source_doc: advanced-computational-thought-topologies-in-large-language-models-from-linear-p.md
---

# Graph of Thoughts (GoT) Reasoning

## Core Idea
Graph of Thoughts represents intermediate LLM reasoning as a directed graph `G = (V, E, c)`, where vertices are thoughts and edges mean one thought was generated using another as direct input. It defines four primary transformations on this graph: generation/branching (split into k successors), aggregation/merging (combine multiple thought paths into one, useful for divide-and-conquer problems like merge-sorting sub-lists), refinement (a self-loop edge that iteratively revises a thought in place), and distillation/pruning (keep only the top-N or structurally valid nodes). GoT introduces "volume" — the count of ancestor thoughts reachable into a node — as a metric: aggregation lets volume scale while keeping "latency" (the longest path from input to solution) low, something tree topologies cannot do because they only allow unidirectional root-to-leaf flow.

## When To Use
Use GoT when a task decomposes into independent subproblems that can be solved in parallel and then merged (e.g. sorting, combinatorial optimization), when the solution needs iterative refinement through a feedback loop rather than a fresh branch each time, or when the goal is to maximize the "thought volume" contributing to a final answer while minimizing the number of sequential hops (latency).

## NeuroSync Applicability
Not currently implemented in NeuroSync. NeuroSync's DAG execution engine (`src/core/coreexec/engine.ts`) runs a directed-acyclic graph of *task* nodes with dependency-based parallelism (see `dag-workflow-orchestration.md`), but that graph structures pre-planned automation steps, not iteratively-generated LLM "thoughts" with merge/refine/prune transformations driven by a state evaluator. There is no thought-aggregation or self-loop refinement mechanism in the reasoning layer.

## Tradeoffs / Risks
Standard (non-adaptive) GoT implementations execute a pre-planned, static "Graph of Operations" defined by a developer before execution, so the structure cannot adapt to the actual difficulty of an incoming query. Prompting-based graph frameworks in general are described as "ex-post" orchestrators that rely on multiple external API calls, parsers, and custom prompters to build, score, and navigate the graph, which introduces meaningful latency and token overhead compared to a single linear pass.
