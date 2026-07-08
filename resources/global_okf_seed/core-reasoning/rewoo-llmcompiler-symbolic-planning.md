---
type: concept
title: ReWOO / LLMCompiler Symbolic Evidence Planning
description: Generating a complete tool-call plan upfront using symbolic placeholders for not-yet-executed tool outputs, so the planning model never needs to be re-consulted mid-execution.
confidence: 0.95
tags: [rewoo, llmcompiler, planning, efficiency]
category: core-reasoning
source_doc: comparative-analysis-of-plan-and-solve-and-plan-and-execute-architectures-in-lar.md
---

# ReWOO / LLMCompiler Symbolic Evidence Planning

## Core Idea
ReWOO splits execution into three decoupled modules: a Planner that creates a complete blueprint upfront using symbolic placeholders (`#E1`, `#E2`) for intermediate tool outputs before any tool actually runs; a Worker that loops through the planned steps, calls tools, and fills in the placeholders with real data; and a Solver that integrates the finished plan and evidence into a final answer. Because the planner is never re-consulted after each tool call, ReWOO reports a 5x token-efficiency gain and 4% accuracy improvement over ReAct on HotpotQA. LLMCompiler goes further by compiling the plan into a full dependency DAG: a Task Fetching Unit schedules each task the instant its dependencies resolve (enabling parallel execution, not just sequential), and a Joiner — an LLM-based decision step — evaluates the trace and decides whether to finalize the answer or trigger dynamic re-planning. LLMCompiler reports up to 3.7x latency speedup and 6.7x lower API cost versus sequential ReAct.

## When To Use
Use ReWOO-style symbolic planning when tool calls are largely independent of the planner's live reasoning (the plan can be fully specified before any tool runs), and use LLMCompiler specifically when multiple planned tool calls are mutually independent and can be parallelized rather than executed one at a time.

## NeuroSync Applicability
Not currently implemented in NeuroSync. NeuroSync's `DAGProposal` (`src/core/scopelogic/interview.ts`) does specify node dependencies upfront and `CoreExec` (`src/core/coreexec/engine.ts`) does dispatch dependency-satisfied nodes in parallel (see `dynamic-task-graph-ready-set-scheduling`), which shares LLMCompiler's parallel-DAG-execution spirit — but NeuroSync has no symbolic placeholder substitution pipeline (no `#E1`-style variable referencing between not-yet-executed nodes) and no Joiner-equivalent LLM decision step that evaluates a completed trace to choose between finalizing or triggering a re-plan.

## Tradeoffs / Risks
Because the entire plan (including which tools to call with what arguments) is fixed before execution, ReWOO/LLMCompiler-style systems are less able to adapt mid-run to information a tool call reveals — a wrong assumption baked into the plan can only be corrected by the Joiner explicitly triggering re-planning, adding back some of the latency the architecture was designed to avoid. Symbolic placeholder substitution also requires careful dependency-graph validation to avoid referencing a placeholder whose producing step never actually ran.
