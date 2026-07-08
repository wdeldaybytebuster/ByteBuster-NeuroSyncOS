---
type: concept
title: Tree of Thoughts (ToT) Reasoning
description: A search-based prompting framework that generalizes chain-of-thought into a tree of intermediate "thought" states explored via BFS or DFS.
confidence: 0.95
tags: [reasoning, prompting, search, tree-of-thoughts, deliberation]
category: core-reasoning
source_doc: advanced-computational-thought-topologies-in-large-language-models-from-linear-p.md
---

# Tree of Thoughts (ToT) Reasoning

## Core Idea
Tree of Thoughts frames problem-solving as a structured search over a decision tree, where each node is a partial solution state `s = [x, z_1...z_i]`. It requires four components: thought decomposition (defining how big a "step" is), thought generation (sampling k candidates per node, either independently or sequentially), state evaluation (scoring each candidate via a scalar value or a vote), and a search algorithm (BFS for shallow, prunable trees; DFS with backtracking for deep, constrained tasks). Unlike linear chain-of-thought, ToT lets the model compare parallel candidate solutions and backtrack from unpromising paths instead of committing irreversibly to one line of reasoning.

## When To Use
Use ToT when a task is highly constrained and benefits from deliberate lookahead and pruning — for example the Game of 24, where GPT-4 with ToT reaches a 74% success rate versus 4% for single-path chain-of-thought, or creative writing tasks where GPT-3.5+ToT (6.62) outperforms GPT-4 with plain IO prompting (6.19).

## NeuroSync Applicability
Not currently implemented in NeuroSync. ScopeLogic's interview-to-DAG generation (`src/core/scopelogic/interview.ts`) and RouteSwitch's model routing are single-pass generation flows with a template-based fallback on failure — there is no branching thought generation, state evaluation, or search-based exploration of multiple candidate solutions anywhere in the codebase.

## Tradeoffs / Risks
ToT's cost premium is substantial — the source reports roughly 5x the token consumption of standard prompting for writing tasks, and evaluation of every candidate state requires additional model calls (via scalar scoring or cross-state voting). The framework also imposes rigid unidirectional information flow: separate branches cannot communicate or merge their partial findings, and a model cannot loop back to refine an existing thought without spawning an entirely new sub-branch.
