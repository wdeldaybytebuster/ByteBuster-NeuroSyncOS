---
type: concept
title: Heterogeneous Compute Routing by Task Complexity
description: Routing planning-grade reasoning to a large, high-capacity model while routing narrower execution steps to smaller, faster, cheaper models, matched to each task's actual difficulty.
confidence: 0.95
tags: [model-routing, cost-optimization, heterogeneous-compute]
category: core-reasoning
source_doc: comparative-analysis-of-plan-and-solve-and-plan-and-execute-architectures-in-lar.md
---

# Heterogeneous Compute Routing by Task Complexity

## Core Idea
Because Plan-then-Execute cleanly separates planning from execution, production systems can route each phase to differently-sized models: planning (high-level logical synthesis) goes to a powerful frontier model, while narrower execution steps go to smaller, specialized models (the source cites 70B+ planners on premium hardware paired with 7B-14B executors on cost-effective hardware, connected via a Redis queue for backpressure). This asymmetric routing captures most of the quality of an all-frontier-model pipeline at a fraction of the compute cost, since most individual execution steps don't need frontier-level reasoning.

## When To Use
Apply heterogeneous routing whenever a workflow has a clear planning/execution split and the execution steps are individually simpler than the overall task — routing every step through the most capable (and most expensive) model available is wasteful when only the planning step actually needs that capability.

## NeuroSync Applicability
Already implemented. `src/core/routeswitch/model-selector/dynamic-router.ts` (`selectOptimalModel`) takes a `complexity: 'trivial' | 'logical' | 'complex'` parameter and a `userPriority` and scores candidate models accordingly: it heavily favors flagship, high-context models (`isFlagship`, `hasHighContext`) when `complexity === 'complex'` or priority is `'intelligence'`, and favors fast/high-throughput models (weighted by measured `avg_tps` from `src/core/routeswitch/model-selector/benchmarker.ts`) when priority is `'speed'` and complexity is `'trivial'`. This directly implements complexity-driven, asymmetric model selection, though NeuroSync routes per-call by a caller-supplied complexity label rather than automatically inferring "this is a planning step vs. an execution step" the way a dedicated Plan-then-Execute framework would.

## Tradeoffs / Risks
The routing quality is only as good as the `complexity` classification fed into `selectOptimalModel` — if a caller mislabels a genuinely hard step as `'trivial'`, it will be routed to a weaker model that may fail it. The benchmarking data driving the `'speed'` path (`avg_tps`, `failure_rate`) also needs enough historical runs per model to be reliable; a newly added model with no `model_benchmarks` row falls back to a cruder heuristic (`isFast` name matching).
