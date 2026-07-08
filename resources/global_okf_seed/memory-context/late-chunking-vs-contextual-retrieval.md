---
type: concept
title: Late Chunking vs. Contextual Retrieval
description: Two competing techniques for preserving cross-chunk context during embedding — one via post-attention pooling, the other via LLM-generated chunk descriptions.
confidence: 0.85
tags: [rag, embeddings, chunking, retrieval, cost-tradeoff]
category: memory-context
source_doc: systemic-architectures-in-retrieval-augmented-generation-technical-specification.md
---

# Late Chunking vs. Contextual Retrieval

## Core Idea
Traditional chunking embeds each text segment in isolation, losing cross-chunk context (e.g. pronoun references, continuous technical descriptions). Late chunking reverses the order: the full document is passed through a long-context transformer in a single forward pass to produce context-aware token embeddings, and only afterward are chunk boundaries applied, with each chunk's vector computed via mean-pooling over its token range. Because pooling happens after attention has propagated globally, each chunk vector retains context from outside its own boundaries. Anthropic's Contextual Retrieval takes a different approach: an LLM generates an explicit short description of each chunk's context and prepends it to the chunk text before embedding, at the cost of one LLM call per chunk during ingestion. This node is marked lower-confidence because the source's headline effect size — "a consistent 2% to 4% relative improvement in retrieval precision (nDCG) on long-document benchmarks" — is a narrow empirical band from a still-emerging technique, and the source frames late chunking's superiority over Contextual Retrieval mainly on cost grounds (no added LLM API calls) rather than on retrieval quality being definitively better.

## When To Use
Use late chunking when cross-chunk referential context matters (e.g. long technical documents with pronouns or continued explanations spanning chunk boundaries) and you want to avoid extra LLM ingestion costs. Use Contextual Retrieval instead when prompt caching makes the added LLM calls affordable and you want explicit, human-readable context descriptions attached to each chunk.

## NeuroSync Applicability
Not currently implemented in NeuroSync. OKF ingestion (`src/core/okf/indexer.ts`, `src/core/okf/parser.ts`) stores whole-file content with no embedding step at index time at all — chunk-level embeddings only happen in the separate `CerebroVectorStore` (`src/core/memory/cerebro/vector.ts`), which embeds individual inserted memory strings directly with no document-wide attention pass or LLM-generated context prefix.

## Tradeoffs / Risks
Late chunking depends on the embedding model supporting a long-context forward pass over the full document, which not all embedding models can do. Contextual Retrieval's per-chunk LLM call is expensive at ingestion scale without prompt caching, and re-ingesting a corpus after a chunking-strategy change requires a full re-embed of the vector index.
