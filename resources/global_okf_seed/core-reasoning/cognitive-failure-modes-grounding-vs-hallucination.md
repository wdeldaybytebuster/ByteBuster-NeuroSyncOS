---
type: concept
title: Cognitive Failure Modes — Parametric Hallucination vs. Grounded Rigidity
description: Pure-reasoning agents fail mostly by confidently hallucinating plausible-but-false premises, while grounded/tool-using agents fail mostly by format rigidity and cascading bad observations.
confidence: 0.95
tags: [failure-modes, hallucination, grounding, reliability]
category: core-reasoning
source_doc: comparative-analysis-of-interleaved-cognitive-deliberation-and-tool-based-execut.md
---

# Cognitive Failure Modes — Parametric Hallucination vs. Grounded Rigidity

## Core Idea
A manual error analysis on HotpotQA found CoT-only models fail due to factual hallucination in roughly 56% of incorrect outcomes — the model builds a logically coherent chain from a hallucinated or obsolete premise and confidently reaches the wrong answer. Grounding those same steps in real tool calls (ReAct) drives hallucination-driven failures down to about 6%, but trades them for new failure modes: rigid Thought-Action-Observation formatting causing parse errors, cascading errors when an early observation is uninformative, and "cognitive overload" past roughly 50 steps where accumulated reasoning-trace noise collapses planning coherence.

## When To Use
Use this failure taxonomy diagnostically: if an agent's wrong answers look internally consistent but factually wrong, the fix is grounding (more/better tool calls); if an agent's wrong answers stem from malformed actions or derailment after a bad search result, the fix is format robustness and observation-quality filtering, not more grounding.

## NeuroSync Applicability
Not currently implemented in NeuroSync. NeuroSync does not run an iterative reasoning loop that would exhibit either of these specific failure signatures (parametric hallucination chains vs. cascading-observation derailment) — its DAG nodes are single-shot dispatches (`src/core/coreexec/dispatch.ts` `classifyDirective`) rather than a multi-turn deliberation trace that could be diagnosed this way.

## Tradeoffs / Risks
This is an empirical finding from one benchmark family (HotpotQA/FEVER) and one model generation (PaLM-540B); the specific percentages are not guaranteed to transfer to other tasks or model families. The taxonomy is also binary (hallucination vs. rigidity/cascading) and does not account for hybrid failures where both a bad premise and a bad observation contribute to the same wrong answer.
