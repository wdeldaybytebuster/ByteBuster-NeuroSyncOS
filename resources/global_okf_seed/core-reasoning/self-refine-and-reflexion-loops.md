---
type: concept
title: Self-Refine and Reflexion Iterative Correction Loops
description: Self-Refine cycles a single model through Generator/Critic/Refiner roles within one attempt; Reflexion converts execution failures into natural-language reflections stored in an episodic memory buffer for future attempts.
confidence: 0.95
tags: [self-reflection, reflexion, self-refine, episodic-memory, self-correction]
category: core-reasoning
source_doc: the-mechanics-of-cognitive-calibration-self-reflection,-intrinsic-correction,-an.md
---

# Self-Refine and Reflexion Iterative Correction Loops

## Core Idea
Self-Refine uses one frozen model in three sequential roles within a single episode: the Generator produces a candidate, the Critic evaluates it against criteria and writes a localized critique, and the Refiner produces an improved version from the original prompt, draft, and critique — repeated until a stopping criterion is met, tracking iteration history since refinement is often non-monotonic (fixing one dimension can degrade another). Reflexion extends this across attempts: an Actor generates actions, an Evaluator checks correctness against environmental signals (unit tests, exact-match), and — only on failure — a Self-Reflector writes a natural-language explanation of the failure and a suggested fix, appended to an episodic memory buffer that is re-supplied to the Actor on the next attempt, acting as a semantic gradient toward correction. Both architectures, when using the same model for generation and critique, remain vulnerable to "degeneration-of-thought" — confirmation bias where the model repeats earlier mistakes or makes only superficial edits.

## When To Use
Use Self-Refine within a single generation pass where iterative self-critique can plausibly catch surface-level issues. Use Reflexion specifically for multi-attempt tasks with an objective, external correctness signal (e.g. code that can be unit-tested) — its self-reflection step is explicitly gated on a real execution failure, not just subjective dissatisfaction.

## NeuroSync Applicability
Partially implemented. `ReflectionExecutor.runReflectionCycle()` (`src/core/memory/cerebro/reflection.ts`) is an idle-triggered, single-pass reflection loop: it extracts candidate preference facts from chat history (via LLM when wired, or a deterministic keyword fallback), then runs a lightweight evaluator step before committing each fact — it searches `CerebroVectorStore` for an existing similar fact and treats similarity `> 0.85` as `isContradiction`, skipping the insert. This is a real Evaluator-like gate analogous to Reflexion's correctness check, but it is explicitly a stub: the code comment states "We could implement contradiction logic here. For now, we skip duplicates to prevent bloat" — it detects near-duplicates, not actual logical contradictions, and there is no Self-Reflector role writing natural-language failure explanations into an episodic memory buffer for future attempts, and no multi-round Generator/Critic/Refiner loop.

## Tradeoffs / Risks
Purely intrinsic self-correction (no external signal) frequently degrades performance rather than improving it — models often fail to detect their own semantic errors and may even alter previously-correct output ("closed-loop blind confidence"). When generation, evaluation, and critique are all performed by the same model, the system is structurally prone to confirmation bias and repetitive error patterns regardless of how many iterations are allowed.
