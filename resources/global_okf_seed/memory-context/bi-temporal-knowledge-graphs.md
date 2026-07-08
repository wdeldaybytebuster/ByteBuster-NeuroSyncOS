---
type: concept
title: Bi-Temporal Knowledge Graphs (Zep/Graphiti Model)
description: Memory architecture that tracks both when a fact was true in the world and when the system recorded it, invalidating rather than overwriting contradicted facts.
confidence: 0.95
tags: [memory, temporal-reasoning, knowledge-graph, graphiti, fact-invalidation]
category: memory-context
source_doc: architecting-temporal-cognition-dynamic-state-tracking-and-temporal-knowledge-gr.md
---

# Bi-Temporal Knowledge Graphs (Zep/Graphiti Model)

## Core Idea
Standard vector-based RAG stores facts as static text chunks with no temporal dimension, so when a fact changes (an API deprecation, a policy revision), the old and new versions sit at near-identical embedding coordinates and standard cosine similarity search cannot reliably tell them apart (the source reports an AUROC of just 0.59 — barely above random — for distinguishing a contradicted fact from a duplicate). Zep's Graphiti engine solves this by maintaining two distinct timelines per edge: event time (when the fact was true in the real world) and transaction time (when the system ingested it), stored as four timestamps per edge (valid start/end, ingestion start/end). When new, contradictory data arrives, the engine never overwrites — it runs an LLM-driven invalidation check, closes the old edge's valid-end timestamp, and links it to the new edge via a `superseded_by` pointer, preserving a full historical record and enabling point-in-time queries.

## When To Use
Use bi-temporal fact tracking whenever the agent's knowledge base contains information with a real shelf life — pricing, personnel, API contracts, policies — so that retrieval can filter to facts whose validity window intersects the query's temporal target instead of surfacing stale and current values side by side.

## NeuroSync Applicability
Not currently implemented in NeuroSync. `CerebroVectorStore` (`src/core/memory/cerebro/vector.ts`) stores each memory as a flat record (`content`, `type`, `last_accessed_at`, `access_count`, `created_at`) with no valid-time/transaction-time distinction and no supersession mechanism — a grep of the codebase for `superseded`, `valid_to`, or `valid_from` finds no fact-invalidation logic in the memory layer. New memories are simply inserted; nothing marks older, contradicted memories as invalid.

## Tradeoffs / Risks
On the LongMemEval benchmark, Zep's graph architecture yields up to 18.5% absolute accuracy improvement over traditional RAG and a 90% reduction in query latency because it avoids feeding raw chat transcripts through an LLM at retrieval time — but achieving this requires an LLM-driven invalidation check on the write path for every new fact, which is itself an added inference cost compared to naive vector insertion.
