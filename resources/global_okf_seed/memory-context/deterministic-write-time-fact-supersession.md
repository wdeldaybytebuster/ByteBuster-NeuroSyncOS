---
type: concept
title: Deterministic Write-Time Fact Supersession (MemStrata)
description: A lightweight three-tier write path that resolves factual contradictions with hashing and key-matching at insert time, avoiding LLM calls on the read path entirely.
confidence: 0.95
tags: [memory, temporal-reasoning, fact-invalidation, write-path, latency]
category: memory-context
source_doc: architecting-temporal-cognition-dynamic-state-tracking-and-temporal-knowledge-gr.md
---

# Deterministic Write-Time Fact Supersession (MemStrata)

## Core Idea
MemStrata is a lightweight alternative to LLM-heavy temporal knowledge graphs. Its write path routes every incoming memory through three tiers: (1) an exact-duplicate short-circuit that hashes normalized text and drops zero-cost exact repeats; (2) a deterministic assertion path that, for text expressing a clean (Subject, Relation, Object) triple, normalizes (Subject, Relation) into a unique key, looks up any existing active assertion under that key, and if the Object differs, closes the old record's validity interval and opens a new one — no vector similarity or LLM call required; (3) a "surprise gate" fallback for unstructured prose that combines vector similarity with an LLM-as-judge to classify novel/redundant/contradictory content. Critically, MemStrata retains near-duplicate non-contradictory statements rather than aggressively merging them — an alternative lossy-compression configuration tested during development dropped factual QA accuracy to 0.62, so supersession is deliberately restricted to direct factual contradictions only.

## When To Use
Use this pattern when structured (Subject, Relation, Object) assertions dominate the memory stream (e.g. "user's preferred language is X", "current API endpoint is Y") and you need to eliminate stale-fact errors without paying LLM latency on every write or read.

## NeuroSync Applicability
Not currently implemented in NeuroSync. `CerebroVectorStore.insert()` (`src/core/memory/cerebro/vector.ts`) always performs a plain `INSERT` into `cerebro_memories_meta` with a fresh UUID — there is no normalized-hash duplicate short-circuit, no (Subject, Relation) key extraction, and no conflict-detection or supersession step on the write path. Every memory is additive.

## Tradeoffs / Risks
The source reports MemStrata reduces the stale-fact-error rate from a 15-40% baseline (standard RAG on continuously-evolving datasets) to approximately 0%, while running at the baseline vector-embedding-lookup latency floor of about 2.1 seconds — an 87% latency reduction versus LLM-reranking verification baselines (16-18 seconds). The tradeoff is architectural: the deterministic path only works cleanly for text that can be parsed into a structured triple; anything else falls through to the more expensive surprise-gate path, and the "retain rather than merge" design choice means near-duplicate non-contradictory facts accumulate rather than compact.
