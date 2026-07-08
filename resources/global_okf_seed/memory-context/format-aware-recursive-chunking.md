---
type: concept
title: Format-Aware Recursive Chunking
description: A two-pass chunking strategy that splits documents on structural boundaries (Markdown headers) before falling back to recursive character splitting for token-size control.
confidence: 0.95
tags: [rag, chunking, markdown, ingestion, retrieval]
category: memory-context
source_doc: systemic-architectures-in-retrieval-augmented-generation-technical-specification.md
---

# Format-Aware Recursive Chunking

## Core Idea
Plain recursive character splitting processes a hierarchy of separators (paragraph breaks, line breaks, spaces, characters), backing off to finer separators only when a segment exceeds the target token capacity. For structured formats like Markdown, this is insufficient because it ignores header hierarchy, which provides the primary context for nested body text. The recommended pattern chains two splitters: first a header-aware splitter partitions the document at `#`/`##`/`###` boundaries and promotes headings into chunk metadata rather than leaving them in the body text; then a recursive character splitter subdivides any oversized header sections into token-capped sub-chunks while preserving the parent heading metadata. Chunk sizing should be measured in tokens (e.g. via tiktoken), not characters, because tokenization density varies by language and vocabulary.

## When To Use
Use this pipeline whenever ingesting Markdown (or other headered/structured text) into a vector store for retrieval, especially when individual header sections vary widely in length — pure recursive splitting alone would either truncate large sections or fail to exploit header context for small ones.

## NeuroSync Applicability
Not currently implemented in NeuroSync. `src/core/okf/graph-query.ts` (`OKFGraphQuery.resolveContext`) treats each OKF node's entire file body as a single retrieval unit — it strips YAML frontmatter and truncates the whole body only when the total context-token budget (`MAX_CONTEXT_CHARS`) is exceeded, with no header-aware splitting, no recursive sub-chunking, and no token-based (vs. character-based) size accounting.

## Tradeoffs / Risks
Header-based splitters alone don't support token-size constraints or sliding-window overlap natively, so a header section with a large amount of text can still exceed an embedding model's context window if not paired with a secondary recursive pass. Character-based size limits (instead of token-based ones) are inaccurate across languages and vocabularies, risking chunks that silently exceed the embedding model's real input capacity.
