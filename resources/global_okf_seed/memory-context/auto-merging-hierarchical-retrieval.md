---
type: concept
title: Auto-Merging Hierarchical Retrieval
description: A retrieval pattern that indexes small leaf chunks for precise matching but promotes the shared parent document when enough sibling chunks are retrieved together.
confidence: 0.95
tags: [rag, retrieval, hierarchical-chunking, context-precision]
category: memory-context
source_doc: systemic-architectures-in-retrieval-augmented-generation-technical-specification.md
---

# Auto-Merging Hierarchical Retrieval

## Core Idea
This pattern (LlamaIndex's `AutoMergingRetriever`) resolves the tension between precise vector matching (which favors small chunks) and coherent generation context (which favors large chunks). Documents are parsed into a multi-tier hierarchy (e.g. 2048-token root nodes, 512-token mid-level nodes, 128-token leaf nodes), but only leaf nodes are embedded and indexed; parent nodes live in a separate document store linked by metadata. At query time, the retriever finds the top-K matching leaves, then for each parent computes the merge ratio `|R_p| / |C_p|` (retrieved children over total children). If the ratio meets a threshold (typically 0.5), the individual leaf chunks are discarded and the full parent node is substituted instead, recursively up the hierarchy — collapsing fragmented snippets into cohesive, structurally intact context.

## When To Use
Use this when a document's logical units are much larger than the ideal embedding-search granularity — e.g. long technical sections where a query might match several small pieces of the same section, and feeding the reconstructed whole section produces more coherent generation than disjointed fragments.

## NeuroSync Applicability
Not currently implemented in NeuroSync. `OKFGraphQuery.resolveContext()` (`src/core/okf/graph-query.ts`) has no parent-child chunk hierarchy at all — each OKF node is one whole markdown file treated as a single atomic chunk. Its `getRelated()` graph traversal (depth-limited BFS over `okf_edges`) surfaces linked concept nodes, which is a different mechanism (explicit authored links, not automatic sibling-count merging) than auto-merging.

## Tradeoffs / Risks
The technique requires an upfront investment in hierarchical document parsing and a separate document store for parent nodes, adding pipeline complexity. A poorly tuned merge threshold can either promote parents too eagerly (bloating context with irrelevant sibling content) or too rarely (leaving generation stuck with fragmented leaf chunks).
