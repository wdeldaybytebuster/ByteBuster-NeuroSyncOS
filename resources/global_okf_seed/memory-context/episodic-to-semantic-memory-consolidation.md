---
type: concept
title: Episodic-to-Semantic Memory Consolidation Pipeline
description: An asynchronous background process that extracts candidate facts from raw conversation history, resolves conflicts with existing knowledge, and merges verified facts into a persistent semantic store.
confidence: 0.95
tags: [memory, consolidation, background-processing, extraction]
category: memory-context
source_doc: architectures-of-mind-a-system-level-analysis-of-episodic-and-semantic-memory-sy.md
---

# Episodic-to-Semantic Memory Consolidation Pipeline

## Core Idea
Memory consolidation converts raw, noisy episodic logs into structured, durable semantic knowledge across three stages: (1) an asynchronous extractor model scans sliding windows of dialogue to identify candidate facts and preference assertions; (2) a conflict-resolution step compares new facts against existing entries and resolves contradictions, typically by prioritizing newer information; (3) verified facts are merged into the persistent semantic store with provenance links back to the source episode. The source contrasts "hot-path" writes (consolidate before responding — accurate but adds response latency) against "background asynchronous writes" (consolidate via a message broker/daemon after responding — low latency but risks staleness on rapid successive queries).

## When To Use
Use background asynchronous consolidation when interactive response latency matters more than having the very next turn immediately reflect a just-extracted fact, and use hot-path consolidation only when the next turn genuinely depends on the newly extracted information.

## NeuroSync Applicability
Partially implemented. `src/core/memory/cerebro/reflection.ts` (`ReflectionExecutor`) runs exactly this pipeline as a background daemon: it fires after 30 minutes of idle time (`IDLE_THRESHOLD_MS`, checked every 5 minutes), extracts candidate preference facts from chat history via `_extractPreferences`, and before inserting each fact into `CerebroVectorStore` checks for an existing similar memory (similarity > 0.85) to skip near-duplicates — a simplified version of the source's conflict-resolution stage. It does not implement the source's fuller conflict resolution (prioritizing newer info or updating confidence scores on contradiction) — NeuroSync currently just skips the new fact rather than reconciling it with the old one.

## Tradeoffs / Risks
Idle-triggered (rather than every-turn) consolidation means facts asserted late in an active session are not captured until the user goes idle for 30 minutes, so a session that ends abruptly without an idle period may lose unconsolidated facts. Skipping near-duplicate facts instead of reconciling them also means genuinely updated preferences (e.g. a changed decision) that are semantically similar to the old one risk being silently dropped rather than superseding it.
