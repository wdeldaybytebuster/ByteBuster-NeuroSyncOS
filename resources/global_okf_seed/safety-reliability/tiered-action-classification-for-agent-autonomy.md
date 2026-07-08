---
type: concept
title: Tiered Action Classification for Agent Autonomy
description: Partitioning agent actions into auto-approved, notify-and-proceed, human-in-the-loop, and prohibited tiers based on risk and reversibility to avoid human bottlenecks.
confidence: 0.95
tags: [governance, hitl, autonomy, deference, risk-tiers]
category: safety-reliability
source_doc: systemic-governance-of-autonomous-agents-deference,-multi-tier-guardrails,-and-h.md
---

# Tiered Action Classification for Agent Autonomy

## Core Idea
To scale autonomous agents without turning every action into a human bottleneck, agent actions are partitioned into four tiers based on risk and reversibility: auto-approved (low-risk, fully reversible, executed without pausing), notify-and-proceed (moderate-risk, logged in real time but not blocking), human-in-the-loop / HITL (high-risk or irreversible, execution pauses for explicit confirmation), and prohibited (outside the agent's scope — execution aborts and a violation is logged). This tiering is what lets high-throughput agentic systems remain both safe and useful, since demanding human sign-off on every action causes alert fatigue and destroys the efficiency gains of autonomy.

## When To Use
Apply this classification whenever an agent can take actions with materially different consequences (e.g. reading a file vs. deleting production data) — it lets low-stakes work proceed autonomously while reserving human attention for genuinely high-risk or ambiguous decisions.

## NeuroSync Applicability
Partially implemented. NeuroSync's `os_todos` table plus PortGrid's HITL approval queue implement the "pause and wait for human confirmation" tier: `src/server/routes/todos.ts` creates a sentinel task and an `os_todos` row with `required_action_type: 'APPROVE_PROPOSAL'` when a ScoutDaemon discovery needs review, and `POST /resolve-bulk` lets an operator batch-approve todos at or above a 0.70 confidence threshold ("Deference UI bulk-approve — resolves a batch of high-confidence (>=0.70) todos"). This covers the HITL tier concretely, but there is no explicit auto-approved / notify-and-proceed / prohibited tier taxonomy elsewhere in the codebase — every gated action currently funnels through the same single `os_todos` queue rather than being routed by a risk classifier into distinct tiers.

## Tradeoffs / Risks
A coarse two-tier system (gate everything vs. gate nothing) either overwhelms operators with low-value approvals or silently lets risky actions through unreviewed. Getting the risk/reversibility boundary wrong in either direction — too permissive or too conservative — undermines the entire point of tiering, and the threshold itself (e.g. a single confidence number) can be gamed or miscalibrated if not paired with genuine risk assessment.
