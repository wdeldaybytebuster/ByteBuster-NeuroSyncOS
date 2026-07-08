---
type: concept
title: Biologically-Inspired Memory Consolidation (HIMA)
description: A sleep-phase-style batch pipeline that scores episodic memories on recency, frequency, surprise, salience, and outcome to decide what gets promoted, retained, or pruned.
confidence: 0.95
tags: [memory, consolidation, decay, hima, recency, forgetting]
category: memory-context
source_doc: architecting-temporal-cognition-dynamic-state-tracking-and-temporal-knowledge-gr.md
---

# Biologically-Inspired Memory Consolidation (HIMA)

## Core Idea
The Human-Inspired Memory Architecture (HIMA) runs a periodic "sleep-phase" consolidation pipeline (defaulting to every 6 hours) that scans raw events in a warm episodic store and scores each with a weighted sum of five factors: recency (w=0.25, exponential decay from ingestion), frequency (w=0.25, inverse frequency of similar events), Bayesian surprise (w=0.20, semantic distance from the prior distribution), entity salience (w=0.15), and outcome/goal-completion signal (w=0.15). The top 20% by composite score are promoted to long-term semantic memory, the middle 60% stay in the episodic store, and the bottom 20% are pruned. Promoted events start with activation strength 0.0 so they must "mature" before influencing behavior, and unpromoted events decay passively via `I(t) = I_0 * e^(-λt)` with λ=0.001/hour (~29-day half-life).

## When To Use
Use this pattern when an agent accumulates high-volume, high-noise episodic history (conversation turns, tool outputs) and needs a principled, automated process to decide what graduates to durable long-term memory versus what fades away, rather than keeping everything indefinitely or deleting on a fixed TTL alone.

## NeuroSync Applicability
Partially implemented. `HabituationScorer.rank()` in `src/core/memory/cerebro/habituation.ts` re-ranks retrieved memories using the formula `R_final = R_semantic * (access_count * 1.5) * e^(-(daysSinceAccess * 0.3))` — a genuine recency-decay-plus-frequency-boost scoring model in the same spirit as HIMA's recency and frequency factors. However, it only covers 2 of HIMA's 5 scoring factors (no Bayesian surprise, entity salience, or outcome signal), operates as a read-time re-ranker rather than a scheduled promotion/pruning pipeline, and NeuroSync has no tiered "episodic → semantic" promotion step or activation-strength maturation gate.

## Tradeoffs / Risks
This is a costly design: it requires periodic batch processing over the entire warm episodic store and LLM-generated summaries for every promoted event. The source also flags a temporal-validation step that quarantines out-of-order or causally-inverted events for 15 minutes before promotion — without this safeguard, chronologically disjointed events risk polluting the long-term semantic graph with incorrect causal ordering.
