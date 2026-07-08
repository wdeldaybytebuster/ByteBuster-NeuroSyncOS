---
type: concept
title: KV Cache Eviction Strategies (Attention Sinks, Heavy Hitters, Adaptive Sparsity)
description: Inference-engine techniques for keeping the autoregressive key-value cache within a fixed memory budget by evicting low-importance tokens instead of the model's parameters.
confidence: 0.95
tags: [kv-cache, attention-sink, streamingllm, inference-optimization, memory-eviction]
category: memory-context
source_doc: memory-architectures-and-context-optimization-in-autonomous-agents-from-prompt-l.md
---

# KV Cache Eviction Strategies (Attention Sinks, Heavy Hitters, Adaptive Sparsity)

## Core Idea
During autoregressive decoding, each new token attends to the keys and values of all previous tokens, and this KV cache can exceed the memory footprint of the model's own parameters on long sequences (a 7B-parameter model's cache can reach 72 GB versus 14 GB of parameters). Several eviction strategies manage a fixed memory budget: StreamingLLM exploits "attention sinks" — the softmax-driven tendency for models to dump surplus attention weight onto the first few tokens regardless of relevance — by permanently pinning those sink tokens plus a sliding window of recent tokens and discarding everything in between. H2O tracks cumulative attention scores per token and evicts the lowest scorers, while SnapKV applies the same idea to the prefill stage using an observation window at the end of the prompt. Twilight uses adaptive Top-p (rather than fixed Top-k) thresholds so focused attention layers keep few tokens and diffuse layers keep more, discarding up to 98% of tokens with minimal accuracy loss. Nexus Sampling addresses the fragility of hard Top-k cutoffs — which can permanently evict tokens that only look temporarily marginal — by computing "Nexus scores" for bridge tokens and using them as weights in a reservoir-sampling step, so every positive-weight token keeps a non-zero chance of survival.

## When To Use
Needed at the inference-engine layer for any long-context, long-running conversational or agentic deployment where GPU memory for the KV cache — not model weights — is the binding constraint. The choice between fixed-budget (H2O/SnapKV) and adaptive (Twilight/Nexus) methods trades implementation simplicity against robustness to genuinely diffuse attention patterns.

## NeuroSync Applicability
Not currently implemented in NeuroSync. NeuroSync calls external LLM providers via RouteSwitchEngine rather than hosting its own inference engine or GPU-resident KV cache, so none of these eviction algorithms — which operate inside a self-hosted inference server — apply. Its closest conceptual analog operates at a completely different layer: `HabituationScorer` (`src/core/memory/cerebro/habituation.ts`) re-ranks retrieved memory records using a recency/frequency decay formula (`R_final = R_semantic * (access_count * 1.5) * e^(-Δdays * 0.3)`), which is similar in spirit — deciding what stays "important" over time — but operates on persisted vector-store memories, not a live attention KV cache.

## Tradeoffs / Risks
Fixed Top-k/heavy-hitter methods can permanently and irreversibly discard tokens that later turn out to matter. StreamingLLM's attention-sink pinning stabilizes generation without fine-tuning, but by construction discards all "middle" content between the sinks and the recent window, which can lose genuinely relevant information on long documents.
