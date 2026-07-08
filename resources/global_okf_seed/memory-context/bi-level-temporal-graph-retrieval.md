---
type: concept
title: Bi-Level Temporal Graph Retrieval (TG-RAG)
description: A two-layer graph design that separates a timestamped fact graph from a hierarchical time-summary graph, enabling incremental updates without full recomputation.
confidence: 0.95
tags: [memory, temporal-reasoning, graphrag, retrieval, incremental-update]
category: memory-context
source_doc: architecting-temporal-cognition-dynamic-state-tracking-and-temporal-knowledge-gr.md
---

# Bi-Level Temporal Graph Retrieval (TG-RAG)

## Core Idea
Temporal GraphRAG (TG-RAG) splits its representation into two layers. The lower layer is a temporal knowledge graph where identical facts occurring at different times are kept as distinct, separate timestamped edges rather than being collapsed — this preserves the historical progression of a relationship and prevents ambiguity during point-in-time lookups. The upper layer organizes all document timestamps into a hierarchical time graph, with cross-layer edges connecting time nodes to the relationship edges active during that window; each time node carries a rolled-up summary of its own facts plus its children's summaries. Because time is modeled hierarchically, ingesting a new document only requires regenerating summaries for the newly created leaf time node and its direct ancestors — never a full graph recomputation. At query time, TG-RAG runs local retrieval (fine-grained subgraphs within a time window) or global retrieval (macro-level trends via the hierarchical summaries) depending on query scope.

## When To Use
Use this pattern for large, continuously-growing document corpora with complex multi-hop temporal queries — the source notes standard RAG and baseline GraphRAG exceed a 50% failure rate on the TempEval benchmark (561 temporal queries over 1,707 documents) because they cannot perform cross-chunk temporal calculations or track evolving entity states.

## NeuroSync Applicability
Not currently implemented in NeuroSync. The OKF indexer (`src/core/okf/indexer.ts`) and directory manager build a flat concept graph from markdown files without any timestamp-hierarchy layer, per-fact temporal edges, or incremental leaf-and-ancestor-only summary regeneration — OKF concepts carry a static `confidence` value in frontmatter but no valid-time metadata or hierarchical time index.

## Tradeoffs / Risks
The bi-level design's efficiency claim rests entirely on the assumption that updates are localized to a small number of leaf time nodes and their ancestors; if the corpus lacks a natural temporal hierarchy (e.g. facts without clear timestamps, or a completely flat time distribution), the incremental-update benefit degrades. The source also notes this remains a research-stage architecture (Astral and related systems) rather than a widely productionized standard, distinct from the more mature Zep/Graphiti bi-temporal edge model.
