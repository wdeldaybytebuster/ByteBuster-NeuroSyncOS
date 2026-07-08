---
type: concept
title: Prompt Compression via LLMLingua's Budget Controller and Segment-Wise Pruning
description: Entropy-based hard prompt compression that allocates different compression rates per prompt section and prunes low-information tokens segment by segment to preserve grammatical cohesion.
confidence: 0.95
tags: [prompt-compression, llmlingua, context-optimization, token-pruning, cost-reduction]
category: memory-context
source_doc: memory-architectures-and-context-optimization-in-autonomous-agents-from-prompt-l.md
---

# Prompt Compression via LLMLingua's Budget Controller and Segment-Wise Pruning

## Core Idea
Hard prompt compression selects a verbatim subsequence H of an original prompt O that minimizes token length while keeping the KL divergence between the model's output distributions on O vs H below a threshold. LLMLingua implements this via three coordinated modules: a Budget Controller that allocates different target compression rates to system instructions, in-context demonstrations, and the active query (compressing demonstrations first, then reallocating leftover budget to instructions and the query); Segment-Wise Iterative Token Compression, which processes the prompt in segments and prunes tokens whose conditional probability under a small reference language model falls below a dynamic threshold, preserving grammatical cohesion across segment boundaries; and Distribution Alignment, which fine-tunes the small reference model on the target model's own instruction-output pairs so the compressor's notion of "low information" tokens matches the target model's actual vocabulary distribution rather than introducing formatting artifacts.

## When To Use
Apply prompt compression when long, information-dense prompts (long few-shot demonstrations, retrieved documents) are driving up cost and latency but the semantic content must be preserved with bounded divergence from uncompressed behavior — not when every token is already load-bearing.

## NeuroSync Applicability
Not currently implemented in NeuroSync. There is no LLMLingua-style entropy-based token pruning, budget controller, or segment-wise compression pipeline anywhere in `src/core/memory` or `src/core/routeswitch` — context is either included in full or selectively excluded by the Tri-Modal Context Router's source classification (`src/core/memory/context-router.ts`), not compressed.

## Tradeoffs / Risks
Because the small reference model (e.g. Phi-2) can have a different vocabulary distribution than the target model, uncorrected compression can introduce formatting artifacts that degrade downstream performance — this is exactly why LLMLingua's Distribution Alignment step exists, and skipping it undermines the whole approach.
