---
type: concept
title: Tiered Memory with Asynchronous Sleep-Time Consolidation
description: MemGPT-style Core, Recall, and Archival memory tiers combined with a background sleep-time agent that consolidates raw logs into durable facts without slowing live interactions.
confidence: 0.95
tags: [memgpt, tiered-memory, sleep-time-agent, memory-consolidation, agent-memory]
category: memory-context
source_doc: memory-architectures-and-context-optimization-in-autonomous-agents-from-prompt-l.md
---

# Tiered Memory with Asynchronous Sleep-Time Consolidation

## Core Idea
Frameworks like MemGPT/Letta partition agent memory into three layers: Core Memory (persona and user-preference blocks pinned at the top of context, agent-editable via tools, with strict character limits), Recall Memory (full chronological conversation history outside the active window, queryable back in as needed), and Archival Memory (a large external repository — documents, code, database tables — accessed via vector search or graph traversal). To keep live interactions fast, a dual-agent architecture splits duties: a fast, lightweight primary model handles live dialogue with no memory-editing capability, while a separate, more powerful "sleep-time" agent runs asynchronously during idle periods to analyze raw logs, extract key facts, and rewrite the primary agent's Core Memory blocks — keeping the active context clean without slowing down live turns.

## When To Use
Use tiered memory with async consolidation whenever an agent needs to accumulate durable knowledge (preferences, facts) across sessions without paying the latency or cost of extracting it inline on every turn.

## NeuroSync Applicability
Already implemented (structurally analogous, though simpler than MemGPT's three named tiers). NeuroSync's `ReflectionExecutor` (`src/core/memory/cerebro/reflection.ts`) is a direct instance of the sleep-time agent pattern: it runs a background timer (`IDLE_THRESHOLD_MS` = 30 minutes, checked every 5 minutes) that, once the user goes idle, calls `runReflectionCycle()` to extract preference facts from chat history and consolidate them into `CerebroVectorStore.insert(fact, 'preference')` (`src/core/memory/cerebro/vector.ts`) — with duplicate/contradiction suppression via a 0.85 similarity check — and additionally persists them as OKF markdown files via `OKFGenerator.fromChat()`. `CerebroVectorStore`'s `project_id`-scoped rows (project-tier vs. null/GLOBAL-USER-tier) function as an Archival Memory analog. There is no separately-named "Core Memory" block pinned to every prompt, so MemGPT's three-tier naming isn't literally present.

## Tradeoffs / Risks
Asynchronous consolidation means facts extracted during a session aren't available until the next idle cycle, so very recent preferences may not yet be reflected in retrieval. Contradiction/duplicate detection based on a single similarity threshold (0.85 in NeuroSync's case) is a blunt instrument — a genuinely updated preference expressed similarly to an old one could be treated as a duplicate and dropped, while a semantic contradiction phrased differently could be missed.
