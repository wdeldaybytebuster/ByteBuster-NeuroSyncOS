---
type: concept
title: Adaptive Graph of Thoughts (AGoT)
description: Test-time framework that recursively decomposes only the sub-tasks an automated complexity check classifies as "complex," unifying chain, tree, and graph reasoning under one dynamic structure.
confidence: 0.95
tags: [reasoning, prompting, agot, dynamic-reasoning, test-time-compute]
category: core-reasoning
source_doc: advanced-computational-thought-topologies-in-large-language-models-from-linear-p.md
---

# Adaptive Graph of Thoughts (AGoT)

## Core Idea
Standard Graph of Thoughts executes a static, developer-defined "Graph of Operations" that cannot adapt to how hard an incoming query actually is. AGoT fixes this by building its directed acyclic graph layer-by-layer during inference: at each layer, an automated check classifies each generated node as "complex" or "non-complex." Complex nodes recursively spawn a nested, lower-level AGoT subgraph to decompose that sub-task further; non-complex nodes are evaluated directly and returned to the parent graph. Each node is uniquely identified by its "heritage" (the sequence of ancestor nodes), and the whole process is bounded by configurable limits on max depth, branching, and total nodes.

## When To Use
Use AGoT when task difficulty varies significantly across a query's sub-parts and you want to spend deliberation budget only where it's needed, rather than applying a fixed search depth uniformly. The source reports a 46.2% absolute improvement on the GPQA scientific benchmark from this test-time adaptive approach with no parameter fine-tuning required.

## NeuroSync Applicability
Not currently implemented in NeuroSync. The closest analog is RouteSwitch's complexity classifier (`classifyComplexity` in `src/core/routeswitch/model-selector/classifier.ts`), which buckets a prompt into `trivial` / `logical` / `complex` via keyword and length heuristics to pick a model tier — but this is a one-shot classification used for model *routing*, not a recursive per-node decomposition that spawns nested reasoning subgraphs at inference time. No recursive complexity-gated subgraph generation exists in the codebase.

## Tradeoffs / Risks
AGoT is governed by hard limits on maximum depth, branching factor, and total node count precisely because unconstrained recursive decomposition could otherwise explode combinatorially. The source also notes that the proportion of nodes classified "complex" varies significantly by task type (e.g., Game of 24 produces far more complex nodes than retrieval-style tasks), meaning the technique's cost-effectiveness is task-dependent and requires tuning the complexity classifier per domain.
