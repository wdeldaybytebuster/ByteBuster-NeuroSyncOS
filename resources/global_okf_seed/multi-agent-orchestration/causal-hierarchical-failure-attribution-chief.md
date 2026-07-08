---
type: concept
title: Causal Hierarchical Failure Attribution (CHIEF)
description: A three-stage diagnostic method that converts flat multi-agent execution logs into causal graphs to isolate the exact agent and step responsible for a failure.
confidence: 0.95
tags: [debugging, failure-attribution, multi-agent, observability]
category: multi-agent-orchestration
source_doc: architectural-paradigms,-state-mechanics,-and-robustness-in-hierarchical-multi-a.md
---

# Causal Hierarchical Failure Attribution (CHIEF)

## Core Idea
Standard log parsers treat multi-agent execution traces as flat sequences, making it hard to tell a root cause from a downstream symptom. CHIEF instead (1) decomposes the raw trace into a DAG of subtasks using the Observation-Thought-Action-Result (OTAR) format, drawing data edges wherever an upstream step's Result becomes a downstream step's Observation; (2) performs top-down backtracking guided by LLM-synthesized "virtual oracles" per subtask (goal, preconditions, key evidence, acceptance criteria) to prune successful subgraphs without inspecting every step; and (3) applies counterfactual screening to confirm whether replacing a candidate step's action would actually have changed the outcome, filtering out agents that merely inherited corrupted upstream data.

## When To Use
Apply causal failure attribution when debugging a failed multi-agent run where the responsible agent and decisive step are not obvious from the raw log — particularly in long, branching traces where a linear read-through would mistake a downstream symptom for the root cause.

## NeuroSync Applicability
Not currently implemented in NeuroSync. NeuroSync surfaces task-level `status`/`error` fields per DAG node (via `CoreExec`'s `tasks` table and SSE events in `scoutEmitter`) but has no causal-graph reconstruction, oracle-guided backtracking, or counterfactual attribution step for isolating which node in a failed run was the actual root cause versus a downstream casualty.

## Tradeoffs / Risks
CHIEF is more expensive per-diagnosis than a flat log scan because it requires an LLM to synthesize per-subtask oracles and evaluate counterfactuals. The source notes rival approaches have their own costs — all-at-once prompting suffers context distraction, linear checking mistakes symptoms for causes, and replay-based methods like FAMAS are highly resource-intensive — so CHIEF is a tradeoff of diagnostic accuracy against added inference cost, not a free improvement.
