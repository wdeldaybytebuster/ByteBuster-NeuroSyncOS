# Implementation Plan: PortGrid Phase 5 — Cerebro & Memory

## Overview

Phase 5 introduces the "Cerebro" memory module, transitioning the AI from stateless execution to a continuously learning entity. This phase implements robust local vector storage, mathematical habituation scoring to manage the context window, and an asynchronous background reflection daemon that learns from both user interactions and document ingestion.

## Phase 5 Task List

### Unit 24: Vector Search & Fallback Foundation
**Goal:** Establish the foundational memory layer using zero-dependency SQLite vector capabilities.
- Install `sqlite-vec` (or implement a pure JS Float32 cosine similarity table structure if native compilation is unviable for the legacy host).
- Create the `cerebro_memories` table in `BaseVault` (ID, content, embedding BLOB, type).
- **Keyword Fallback Engine:** If offline embeddings fail, implement the deterministic fallback algorithm:
  - Filter tokens > 3 characters.
  - Apply formula: `Similarity = 0.7 + (matchCount * 0.05)`

### Unit 25: Habituation Scoring & Decay Logic
**Goal:** Prevent context-window bloat and hallucination by mimicking biological memory decay.
- Add `last_accessed_at` (timestamp) and `access_count` (integer) to `cerebro_memories`.
- Implement the `HabituationScorer` module that applies the scoring formula at retrieval time:
  - `R_final = R_semantic * (f_access * 1.5) * e^(-(Δt * 0.3))`
  - *Where `Δt` is calculated in days, and `R_semantic` is the base vector/fallback similarity score.*
- Ensure idle memories naturally fall out of the context injection window, while frequently accessed facts remain pinned.

### Unit 26: Asynchronous Memory Reflection (The Learning Engine)
**Goal:** Convert daily chat history and workflow execution results into permanent, actionable knowledge.
- Build the `ReflectionExecutor` daemon.
- **Debouncing:** Ensure it only runs if the `ScopeLogicSession` and `CoreExec` have been completely idle for >30 minutes, protecting the Node.js event loop during active work.
- **Pre-Consolidation Validation:** Extract user preferences from recent ScopeLogic chats and cross-reference them with previously failed DAGs. Check new facts against existing ones to prevent semantic drift.
- Save the validated, synthesized facts into `cerebro_memories`.

## Acceptance Criteria for Phase 5
- A piece of knowledge can be injected into `BaseVault` and successfully retrieved via both Vector similarity and the Keyword Fallback Engine.
- The Habituation Scorer mathematically demonstrably lowers the rank of an item that hasn't been accessed in 30 days compared to an item accessed today.
- `ReflectionExecutor` correctly parses a dummy chat history, identifies a user preference, and saves it to the database without blocking the main event loop.
