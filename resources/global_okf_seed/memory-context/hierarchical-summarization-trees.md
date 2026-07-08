---
type: concept
title: Hierarchical Summarization Trees (RAPTOR, DTCRS, HERCULES)
description: Multi-layered summary trees built by clustering and recursively summarizing text chunks so a model can query different levels of detail instead of relying on flat token pruning.
confidence: 0.95
tags: [hierarchical-summarization, raptor, retrieval, long-context, clustering]
category: memory-context
source_doc: memory-architectures-and-context-optimization-in-autonomous-agents-from-prompt-l.md
---

# Hierarchical Summarization Trees (RAPTOR, DTCRS, HERCULES)

## Core Idea
For very long documents or conversation histories, flat token-level pruning can break narrative structure, so hierarchical summarization instead builds a multi-layered summary tree the model can query at different levels of detail. RAPTOR (Recursive Abstractive Processing for Tree-Organized Retrieval) clusters text chunks and recursively summarizes them into a static tree, integrating information across different parts of a document for complex, multi-step questions. DTCRS (Dynamic Tree Construction for Recursive Summarization) instead builds the tree dynamically based on the document's table of contents and the semantics of the current query, focusing the summary on the active topic and reducing redundant information. HERCULES (Hierarchical Embedding-based Recursive Clustering) recursively k-means-clusters document embeddings from level 0 upward, uses an LLM to generate descriptive titles and summaries per cluster for interpretability, and supports both "direct" (raw embedding) and "description" (LLM-summary) clustering modes, optionally guided by a topic seed.

## When To Use
Use hierarchical summarization trees when a corpus or history is too large to compress via simple token pruning without losing structure, and the system needs to answer questions at varying levels of granularity — broad overview versus specific detail — rather than a single flat summary.

## NeuroSync Applicability
Not currently implemented in NeuroSync. NeuroSync's OKF knowledge graph and `CerebroVectorStore` both store flat, individually-indexed records (markdown concept nodes and memory rows) rather than a recursively clustered, multi-level summary tree — there is no RAPTOR/DTCRS/HERCULES-style clustering or level-of-detail querying in `src/core/memory` or `src/core/okf`.

## Tradeoffs / Risks
Static trees (RAPTOR) can become stale or misaligned with the specific query being asked, since they're built once independent of downstream questions. Dynamic, query-aware tree construction (DTCRS) avoids that but adds per-query tree-building cost. All three approaches depend on clustering quality — poorly separated clusters produce summaries that blur genuinely distinct topics together.
