---
type: concept
title: Episodic vs. Semantic Memory Functional Taxonomy
description: Agentic memory splits into Factual (semantic), Experiential (procedural), and Working memory classes, each retrieved via a multi-factor activation score rather than raw cosine similarity.
confidence: 0.95
tags: [memory, episodic-memory, semantic-memory, retrieval]
category: memory-context
source_doc: architectures-of-mind-a-system-level-analysis-of-episodic-and-semantic-memory-sy.md
---

# Episodic vs. Semantic Memory Functional Taxonomy

## Core Idea
Building on Tulving's 1972 distinction between semantic memory (generalized, time-independent facts) and episodic memory (personal experiences tied to a specific time/place), a 2025 engineering taxonomy reframes agentic memory by function: Factual Memory (structured facts about user/environment/domain), Experiential Memory (procedural patterns and workflow templates), and Working Memory (the active context currently in the model's window). Retrieval across these layers is modeled with a multi-factor activation score A_i(t) = semantic similarity + temporal decay (power-law, Ebbinghaus-style) + log(frequency) + contextual relevance + noise — deliberately richer than plain cosine similarity so that recency, usage frequency, and situational relevance all influence what gets surfaced.

## When To Use
Reach for a layered memory taxonomy (rather than one flat vector store) whenever an agent needs to distinguish "what happened" (episodic, instance-specific, needed for auditability) from "what is generally true" (semantic, distilled, needed for fast lookup) from "what's active right now" (working memory, bounded by the context window).

## NeuroSync Applicability
Partially implemented. `src/core/memory/cerebro/vector.ts` (`CerebroVectorStore`) stores memory rows tagged by a `type` field (e.g. `'preference'`) which is a coarse analog of the semantic/experiential split, and `src/core/memory/context-router.ts` performs intent classification to decide whether a query needs OKF (knowledge graph), GitNexus (code structure), or Vector (conversational memory) — a working-memory-adjacent routing decision. NeuroSync does not implement the full multi-factor activation score; ranking is handled separately by `HabituationScorer` (decay + frequency only, no semantic-similarity or contextual-relevance terms in the same formula).

## Tradeoffs / Risks
A richer, multi-factor taxonomy is more expensive to compute and maintain than a single vector index, and the source notes that without careful tuning of the decay/frequency/noise coefficients, the system can either over-weight stale-but-frequent facts or drop novel-but-relevant ones. Treating memory as a flat vector database (the alternative) is simpler but loses the ability to distinguish instance-specific episodes from generalized facts.
