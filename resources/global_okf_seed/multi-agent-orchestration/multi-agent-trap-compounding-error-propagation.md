---
type: concept
title: The Multi-Agent Trap: Compounding Error Propagation
description: In unstructured multi-agent pipelines, per-step error rates compound exponentially across the chain, causing overall success probability to decay sharply as pipeline length grows.
confidence: 0.95
tags: [multi-agent, reliability, failure-modes, error-propagation]
category: multi-agent-orchestration
source_doc: architectural-paradigms,-state-mechanics,-and-robustness-in-hierarchical-multi-a.md
---

# The Multi-Agent Trap: Compounding Error Propagation

## Core Idea
When agents pass data sequentially without validation, early errors cascade and compound. For a k-step pipeline where each agent independently succeeds with probability p, overall pipeline success is P(success) = p^k. Even at a high per-step success rate of 0.95, a 20-step pipeline decays to roughly 35.8% end-to-end success. Empirically, unstructured multi-agent configurations amplify errors up to 17.2x versus a single-agent baseline, and the Multi-Agent Systems Failure Taxonomy (MAST) study found coordination breakdowns account for 36.9% of all failures across 1,642 traces.

## When To Use
Use this model as a design check before chaining agents sequentially: compute the expected end-to-end success rate for the proposed pipeline length and per-step reliability, and decide whether validation checkpoints, structured failure contracts, or a shorter pipeline are needed before shipping.

## NeuroSync Applicability
Not currently implemented in NeuroSync. NeuroSync's `CoreExec` DAG runner (`src/core/coreexec/engine.ts`) does fail a run outright the moment any single task reaches `failed` status, rather than silently propagating a corrupted intermediate result forward — which sidesteps the specific "silent compounding" failure mode this concept describes — but there is no explicit success-probability modeling, per-step reliability tracking, or budget/loop-safeguard system that reasons about compounding error rates across a chain.

## Tradeoffs / Risks
This is a purely mathematical framing (independent per-step probabilities) that may not hold when errors are correlated rather than independent, so the exponential-decay estimate can be optimistic or pessimistic depending on the failure mode. It is primarily useful as a design heuristic for deciding whether a workflow needs structured failure handling, not as a precise reliability guarantee.
