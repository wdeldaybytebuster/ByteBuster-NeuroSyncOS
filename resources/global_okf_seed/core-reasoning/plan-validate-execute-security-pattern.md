---
type: concept
title: Plan-Validate-Execute (P-V-E) Security Pattern
description: An independent Verifier component, ideally built on a different engine than the planner, inspects a generated plan against security/compliance rules before an executor is allowed to run any step of it.
confidence: 0.95
tags: [plan-and-execute, security, validation, control-flow-integrity]
category: core-reasoning
source_doc: comparative-analysis-of-plan-and-solve-and-plan-and-execute-architectures-in-lar.md
---

# Plan-Validate-Execute (P-V-E) Security Pattern

## Core Idea
Plan-then-Execute already contains indirect prompt injection better than ReAct, because the plan is locked in before the agent touches any untrusted external data — a malicious payload encountered during execution cannot rewrite the already-generated global plan. P-V-E strengthens this further by inserting an independent Verifier between the Planner and Executor: it checks the generated plan against security schemas, compliance policies, and logical constraints, and a Refiner modifies the plan if violations are found. The source explicitly recommends the Verifier be built on a different model family or statistical engine than the Planner to avoid shared biases, and notes that injections targeting the planner stage achieve far higher attack success rates than those targeting the executor — because compromising the planner lets an attacker rewrite the entire downstream workflow.

## When To Use
Add an independent Verifier stage whenever a planner's output can trigger consequential downstream actions (data mutation, financial transactions, destructive commands) — the isolation of Verifier from Planner matters most exactly when the two would otherwise share the same failure modes (e.g. both being the same LLM).

## NeuroSync Applicability
Already implemented. `src/core/scopelogic/validator.ts` (`ValidatorLogic.validate`) is an independent Verifier that runs on every `DAGProposal` before `CoreExec` ever dispatches a node — enforced centrally in `src/core/coreexec/validateDAG.ts` (`validateDAGTemplate` / `validateDAGProposal`) for both the cron-driven scheduler path and the interactive `/api/coreexec/approve` path, so a malicious `dag_template` inserted directly into SQLite cannot bypass validation. `ValidatorLogic` checks structural integrity (SA-06), reserved-system-service references (SA-07), forbidden SQL/shell patterns (SA-01/02), forbidden node types (SA-04), and an agent allowlist (SA-05) — and critically, it is a deterministic regex/rule engine, not an LLM, which satisfies the source's recommendation to build the Verifier on a different kind of engine than the (LLM-based) Planner in `interview.ts` by construction.

## Tradeoffs / Risks
A rule-based Verifier like `ValidatorLogic` only catches the specific patterns it was written to check (forbidden keywords, reserved labels, an agent allowlist) — it cannot catch a semantically dangerous plan that doesn't match any of its regexes, unlike an LLM-based Verifier that could reason about intent. The source's full P-V-E model also includes an automatic Refiner that modifies non-compliant plans; NeuroSync's validator only accepts or rejects (`error: string | null`) rather than repairing a rejected proposal.
