---
type: concept
title: Hybrid Retrieval Fusion and Reranking Funnel
description: A two-stage retrieval architecture that fuses dense and sparse search results via Reciprocal Rank Fusion, then compresses candidates with a precision reranker before generation.
confidence: 0.95
tags: [rag, retrieval, reranking, rrf, hybrid-search]
category: memory-context
source_doc: systemic-architectures-in-retrieval-augmented-generation-technical-specification.md
---

# Hybrid Retrieval Fusion and Reranking Funnel

## Core Idea
Production RAG pipelines run first-stage retrieval to maximize recall cheaply — dense vector search (bi-encoders) and sparse keyword search (BM25) in parallel — then apply a second-stage reranker to a smaller candidate set for precision. Combining dense and sparse scores requires reconciling incompatible distributions (BM25 is positive/unbounded, cosine similarity is bounded), typically via Reciprocal Rank Fusion: `RRF(d) = Σ w_m / (k + r_m(d))`, summing weighted reciprocal ranks across retrievers with a smoothing constant `k` (default 60). Adding a reranker adds one model call (50-150ms) but often reduces total system latency because it lets the pipeline shrink the number of chunks fed to the generator (e.g. from 50 down to 5), and generation time scales roughly linearly with prompt size.

## When To Use
Use hybrid fusion when queries mix conceptual/semantic intent with exact-phrase or keyword requirements that dense-only search misses. Add a reranker specifically when first-stage recall requires pulling in many candidate chunks to be safe, since the reranker's precision lets you compress the context window without losing relevant content.

## NeuroSync Applicability
Not currently implemented in NeuroSync. `CerebroVectorStore.search()` (`src/core/memory/cerebro/vector.ts`) uses a single retrieval channel at a time — either sqlite-vec KNN search (`_vectorSearch`) or, when no embedding is supplied, a deterministic keyword-overlap fallback (`_keywordFallbackSearch`) — with no parallel dense+sparse fusion, no RRF, and no reranking stage.

## Tradeoffs / Risks
Reconciling dense and sparse score distributions is nontrivial — naively averaging unnormalized scores biases results toward whichever channel has a wider numeric range. A reranker call adds a hard latency floor to every query even when it saves time downstream, and its benefit depends on the first-stage recall actually surfacing the right candidates in the larger initial pool.
