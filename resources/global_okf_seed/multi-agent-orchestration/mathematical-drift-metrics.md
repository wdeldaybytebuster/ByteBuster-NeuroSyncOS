---
type: concept
title: Mathematical Drift Metrics (KL Divergence and Context Divergence Score)
description: Turn-wise KL divergence measures how far an agent's response distribution has drifted from a goal-consistent reference policy; Context Divergence Score measures semantic misalignment between agents in a multi-agent system.
confidence: 0.95
tags: [agentic-drift, kl-divergence, multi-agent, observability, metrics]
category: multi-agent-orchestration
source_doc: taxonomic-and-mathematical-formalization-of-agentic-drift-in-long-horizon-autono.md
---

# Mathematical Drift Metrics (KL Divergence and Context Divergence Score)

## Core Idea
Runtime context drift can be modeled as a stochastic recurrence process: at turn `t`, the contextual divergence `D_t = D_KL(q_t || p_t)` compares the target agent's predictive distribution against a goal-consistent reference policy exposed to the same history. Contrary to the assumption that this must grow unboundedly as compounding errors accumulate, empirical tests show drift typically stabilizes at a finite, noise-limited equilibrium that can be lowered with targeted intervention prompts. In multi-agent systems, each agent maintains a local context vector `c_i^t` (a compressed embedding of its state, history, and goals); the Context Divergence Score between two agents is their cosine distance, and the system-level score averages this across all pairs. When pairwise CDS exceeds a safety threshold (`τ = 0.25` in the source's setup), a Shared State Verification Protocol forces targeted resynchronization rather than continuous full-history broadcasting — catching silent multi-agent drift that would show no errors in any individual agent's execution log.

## When To Use
Use turn-wise KL divergence tracking for single-agent sessions where you need to detect gradual constraint erosion (e.g. an agent slowly abandoning a formatting or tone requirement under sustained conversational pressure). Use Context Divergence Score specifically in multi-agent deployments where agents share an environment but drift could go undetected because each agent's own logs look locally correct.

## NeuroSync Applicability
Not currently implemented in NeuroSync. There is no per-turn distributional comparison against a reference policy anywhere in `src/core`, and no cross-agent context-vector divergence tracking — NeuroSync's multi-provider paths (`src/core/routeswitch/council.ts`) execute providers once per prompt rather than maintaining ongoing per-agent context state that could be compared pairwise over time.

## Tradeoffs / Risks
Computing turn-wise KL divergence requires access to token-level predictive distributions from a reference policy, which is not always available for black-box hosted models. The CDS threshold (`τ = 0.25`) is a specific calibrated value from the source's setup — reusing it in a different embedding space or task domain without recalibration risks either over-triggering resynchronization (wasting tokens) or under-triggering it (missing real divergence).
