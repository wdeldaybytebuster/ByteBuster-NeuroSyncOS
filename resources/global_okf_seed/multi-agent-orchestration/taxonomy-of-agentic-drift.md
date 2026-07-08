---
type: concept
title: Taxonomy of Agentic Drift
description: Long-horizon autonomous agents degrade along distinct axes — goal drift, context drift, reasoning drift, and collaboration drift — with a key distinction between upstream data-layer drift and runtime in-context drift.
confidence: 0.95
tags: [agentic-drift, long-horizon, goal-alignment, observability]
category: multi-agent-orchestration
source_doc: taxonomic-and-mathematical-formalization-of-agentic-drift-in-long-horizon-autono.md
---

# Taxonomy of Agentic Drift

## Core Idea
Agentic drift is performance degradation that emerges over long time horizons, classified across goal drift, context drift, reasoning drift, and collaboration drift, each operating at a different level of the stack. A critical distinction is between data-layer context drift — a governance failure where upstream schemas, semantic glossaries, and metadata catalogs stop reflecting operational reality (e.g. a cross-domain definition conflict like finance using a 90-day "active customer" window vs. sales using 30 days) — and runtime in-context drift, which unfolds dynamically within a single session as a model generates responses across turns or tool-execution steps. Data-layer drift is especially insidious because it produces outputs that look structurally correct and logically sound while being confidently wrong, since the agent is reasoning correctly over stale premises. Left unmanaged, both vectors expose production agents to goal manipulation, memory poisoning, workflow misalignment, and agent-to-agent propagation of flawed assumptions.

## When To Use
Use this taxonomy when diagnosing why a long-running agent's behavior has degraded — first localize whether the failure is upstream (stale metadata/definitions feeding the agent) or in-session (accumulated context pushing the agent off its original goal), since the two require entirely different fixes.

## NeuroSync Applicability
Not currently implemented in NeuroSync. No component in `src/core` compares live system state or agent output against a stored specification or decision record over time to detect drift — `src/core/coreexec/validateDAG.ts` validates a DAG's structure and semantics at execution time (its own comment notes this "prevents drift" between the parser and structural/semantic checks), but that is internal consistency validation of a single workflow definition, not longitudinal drift detection across sessions or against an evolving spec.

## Tradeoffs / Risks
Data-layer drift is a governance failure, not a model failure, so no amount of prompting or model-level fixes addresses it — it requires lineage tracking and glossary consistency checks outside the agent entirely. The source cites a claim that a large majority of data governance initiatives will fail by 2027 specifically due to lacking this kind of explicit lineage and accountability, underscoring that this is an organizational problem as much as a technical one.
