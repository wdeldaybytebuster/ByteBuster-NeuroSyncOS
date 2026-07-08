---
type: concept
title: Adaptive VLM Routing for Computer-Use Agents (AVR)
description: Models the difficulty of a visual grounding action as a latent variable and escalates to a stronger vision-language model when a lightweight estimator or confidence probe signals low confidence.
confidence: 0.95
tags: [routing, vlm, computer-use-agents, difficulty-estimation, escalation]
category: tooling-integration
source_doc: architectural-paradigms-and-systems-level-engineering-of-semantic-routing-in-llm.md
---

# Adaptive VLM Routing for Computer-Use Agents (AVR)

## Core Idea
In Computer Use Agents, vision-language models must ground actions (clicks, keystrokes, scrolls) in visual interface states, generating large input contexts. Adaptive VLM Routing (AVR) models each action's difficulty as a latent variable `d_i in [0,1]`, with a candidate model's grounding accuracy modeled sigmoidally as `P(correct | t_i, m_k) ≈ σ((θ_k - d_i) / γ)`, where `θ_k` is that model's capability threshold. AVR estimates difficulty two ways: a lightweight 120M-parameter multimodal embedder processes the screen region and action description directly, and a local 7B VLM performs log-probability probing on its own proposed action — if token-level confidence is low, the action escalates to a frontier model. A "Visual Confused Deputy" guardrail additionally force-escalates high-risk actions to the strongest available model regardless of confidence, specifically to prevent visual exploit injection attacks.

## When To Use
Use difficulty-aware VLM escalation specifically for agents that take real actions grounded in visual/screen state (browser or OS automation) where a misgrounded click or keystroke has real consequences, and where per-action confidence signals (embedder difficulty score, log-probability) are cheap enough to compute before committing to an action.

## NeuroSync Applicability
Not currently implemented in NeuroSync. NeuroSync has no vision-language model integration or screen/visual-grounding action layer — PortGrid (`src/core/portgrid/sandbox.ts`, `terminal-session.ts`) operates on terminal/text sessions rather than visual interface state, so there is no analog to AVR's difficulty estimator, sigmoidal accuracy model, or "Visual Confused Deputy" escalation guardrail anywhere in the codebase.

## Tradeoffs / Risks
AVR requires maintaining and serving an additional lightweight difficulty-estimation model (the 120M-parameter embedder) purely to make routing decisions, adding an inference step before the actual grounding action itself. The safety-motivated force-escalation guardrail also trades cost for security deliberately — it overrides the cost-optimal routing decision whenever an action is classified high-risk, meaning the system intentionally pays for a stronger model even when a cheaper one might have been statistically sufficient.
