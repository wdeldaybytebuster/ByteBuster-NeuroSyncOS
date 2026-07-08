---
type: concept
title: Memory Activation via Temporal Decay and Frequency Scoring
description: Re-ranking retrieved memories using an exponential recency-decay curve combined with an access-frequency boost, so recently and repeatedly used memories outrank stale ones with similar raw similarity.
confidence: 0.95
tags: [memory, decay, forgetting, ranking]
category: memory-context
source_doc: architectures-of-mind-a-system-level-analysis-of-episodic-and-semantic-memory-sy.md
---

# Memory Activation via Temporal Decay and Frequency Scoring

## Core Idea
The source models memory activation's temporal-decay term as a power-law sum over past retrieval events (an Ebbinghaus forgetting-curve analog), combined with a log-frequency term rewarding often-used memories. Rather than scoring memories purely by semantic similarity, this decay-plus-frequency weighting ensures recently and repeatedly accessed facts are favored over stale ones, and structured forgetting/decay is explicitly recommended so systems can prune low-salience data without meaningfully hurting retrieval precision (one cited ablation found removing decay reduced Precision@5 by only 0.002).

## When To Use
Apply decay-and-frequency re-ranking whenever raw semantic similarity alone would resurface outdated or rarely-used facts just because they happen to be lexically/semantically close to the current query — i.e., any long-running memory store where facts can go stale.

## NeuroSync Applicability
Already implemented. `src/core/memory/cerebro/habituation.ts` (`HabituationScorer.rank`) computes `R_final = R_semantic * (f_access * 1.5) * e^(-(Δt * 0.3))`, where `R_semantic` is the base similarity score, `f_access` is the memory's `access_count`, and `Δt` is days since `last_accessed_at`. This is a direct, simplified instance of the source's decay-plus-frequency activation model — it omits the source's separate contextual-relevance and probabilistic-noise terms but implements the core recency-decay and frequency-boost mechanics exactly.

## Tradeoffs / Risks
A fixed decay rate (here, a constant 0.3 exponent) is a simplification — the source's Ebbinghaus-style model implies decay parameters should vary by memory type or importance, and a one-size-fits-all rate risks under-decaying trivial facts or over-decaying important-but-rarely-referenced ones. Frequency boosting can also create feedback loops where already-popular memories keep getting surfaced (and thus keep gaining access count) at the expense of newer, potentially more relevant facts.
