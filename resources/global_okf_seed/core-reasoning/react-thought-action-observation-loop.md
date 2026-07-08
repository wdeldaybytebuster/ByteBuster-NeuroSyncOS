---
type: concept
title: ReAct — Interleaved Thought-Action-Observation Loop
description: Interleaving linguistic reasoning traces with discrete environment actions in a closed loop, so each action's observation can correct the next reasoning step.
confidence: 0.95
tags: [react, reasoning, tool-use, agent-loop]
category: core-reasoning
source_doc: comparative-analysis-of-interleaved-cognitive-deliberation-and-tool-based-execut.md
---

# ReAct — Interleaved Thought-Action-Observation Loop

## Core Idea
ReAct combines Chain-of-Thought's internal deliberation with tool-use's external grounding: at each step the model samples a thought τ_t, then an action a_t conditioned on that thought, then receives an observation o_t from executing the action, appending all three to the running context before the next step. This closed loop lets logical deliberation guide planning while environment feedback corrects the agent's internal state, producing an auditable, human-interpretable trajectory instead of a black-box single-turn answer. Empirically it cuts factual hallucination from ~56% of CoT-only errors down to ~6% on HotpotQA-style tasks, though CoT alone still wins on purely logical/static-fact problems where forcing the strict action-format loop and imperfect search results derail otherwise-sound internal reasoning.

## When To Use
Use the interleaved ReAct loop for tasks that require grounding in external, verifiable, or time-sensitive information (e.g. fact verification, multi-hop research, environment navigation) where reasoning purely from parametric knowledge risks hallucination. Prefer plain CoT for closed-world, purely logical/arithmetic problems where tool calls add format rigidity without adding grounding value.

## NeuroSync Applicability
Not currently implemented in NeuroSync. NeuroSync's task pipeline is plan-then-execute (ScopeLogic produces a full `DAGProposal` up front in `src/core/scopelogic/interview.ts`, then `CoreExec` executes each node in `src/core/coreexec/engine.ts`) rather than an interleaved single-agent thought→action→observation loop where each action's observation directly informs the model's very next reasoning step within the same task.

## Tradeoffs / Risks
The source documents two failure modes specific to the interleaved loop: rigidity (the strict Thought-Action-Observation format causes parsing/formatting errors that a free-form scratchpad would not) and cascading observation errors (an uninformative or wrong initial search result derails the rest of the trajectory, since the agent is highly dependent on retrieved-observation quality). Long runs (50+ steps) also accumulate verbose history that clutters working context, a state the source terms "cognitive overload."
