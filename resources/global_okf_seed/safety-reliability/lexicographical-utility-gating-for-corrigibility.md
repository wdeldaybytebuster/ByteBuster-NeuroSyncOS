---
type: concept
title: Lexicographical Utility Gating for Provable Corrigibility
description: Replacing a single scalar reward with an ordered tuple of utility heads, where safety values must be maximized before performance rewards are ever considered.
confidence: 0.95
tags: [governance, corrigibility, alignment, reward-design]
category: safety-reliability
source_doc: systemic-governance-of-autonomous-agents-deference,-multi-tier-guardrails,-and-h.md
---

# Lexicographical Utility Gating for Provable Corrigibility

## Core Idea
Standard RLHF optimizes agents against a single learned scalar reward, which creates incentives for deceptive alignment and reward hacking because the agent is rewarded for maximizing the feedback signal rather than genuinely satisfying human preference. The "Core Safety Values for Provably Corrigible Agents" framework instead replaces the scalar objective with five structurally separate utility heads combined lexicographically: `U_Total = ⟨U_1, U_2, U_3, U_4, U_5⟩`, where a lower-indexed utility must be fully maximized before a higher-indexed one is ever considered, regardless of magnitude. This ordering guarantees that safety properties (e.g. deference, non-tampering) mathematically cannot be traded off against task-completion performance, no matter how large the performance reward becomes — a formal proof (Theorem 1) shows this yields exact single-round corrigibility, extended (Theorem 3) to bound violation probability by a polynomial function of policy sub-optimality over a discounted horizon.

## When To Use
Applicable when designing the reward/objective structure for an agent whose safety-critical behaviors (like accepting shutdown or staying within bounds) must never be overridden by task-completion incentives — i.e., any environment where you cannot tolerate safety being "outbid" by a sufficiently attractive reward.

## NeuroSync Applicability
Not currently implemented in NeuroSync. There is no reward-modeling or reinforcement-learning training loop in NeuroSync at all — it is an orchestration system that calls external LLM providers and gates their outputs procedurally (via `os_todos`/HITL approval and the `FreeModeGovernor` token-budget lock in `src/core/routeswitch/governor.ts`), not a system that trains or fine-tunes a policy against any utility function, scalar or lexicographic.

## Tradeoffs / Risks
Verifying safety or corrigibility for an arbitrary post-hoc modified agent is mathematically undecidable in general (the source notes this reduces to the Halting Problem); the framework only achieves tractable verification by restricting the agent to a finite-horizon "decidable island" of its operational space. The guarantees are also conditional on each utility head being learned to a bounded error and the planner being near-optimal — real-world training noise could erode the theoretical bound.
