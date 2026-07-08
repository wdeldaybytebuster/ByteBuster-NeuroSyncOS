---
type: concept
title: Debate Bias and Collusion Mitigation Controls
description: Concrete architectural interventions — response anonymization, memory masking, diverse tool augmentation, and persona balancing — that counter sycophancy and collusion in multi-agent debate.
confidence: 0.95
tags: [multi-agent, debate, bias-mitigation, anonymization, tool-use]
category: multi-agent-orchestration
source_doc: systems-engineering,-mathematical-formulations,-and-security-controls-in-multi-a.md
---

# Debate Bias and Collusion Mitigation Controls

## Core Idea
Several targeted interventions counter the failure modes of multi-agent debate. Response Anonymization strips identity markers (e.g. "Agent 1:") from transcripts before agents see them, severing the channel through which sycophancy and self-bias propagate, measured via the Identity Bias Coefficient. Memory Masking (MAD-M²) has agents act as internal censors at the start of each round, identifying and masking unverified or hallucinatory claims from prior rounds before they can pollute the context. Tool-MAD assigns heterogeneous external tools (a curated RAG corpus for one agent, a live search API for another) to eliminate overlapping blind spots, with agents dynamically reformulating queries each round and a RAGAS-derived stability score (Faithfulness, Answer Relevance) gating whether a response is even allowed to reach the judge. Persona management balances cooperative "peacemaker" personas (which accelerate consensus but suppress critical thinking) against skeptical "troublemaker" personas (which maintain adversarial tension but risk stalling if overused) — the optimum is a deliberate mix of both.

## When To Use
Apply these controls once a multi-agent debate or consensus system is confirmed to exhibit (or is at risk of exhibiting) the sycophancy, false-memory, or collusion failure modes — they are remediations layered on top of a debate architecture, not a replacement for one.

## NeuroSync Applicability
Not currently implemented in NeuroSync. `ConsensusSynthesizer.executeCouncilMode()` (`src/core/routeswitch/council.ts`) does not anonymize provider identities (it doesn't expose them to peers at all, since there is no cross-agent round), has no memory-masking step, does not assign differentiated tools per provider, and uses no persona system.

## Tradeoffs / Risks
Response anonymization only helps once agents can see each other's outputs at all — it doesn't apply to purely parallel, non-interactive ensembles. Tool-MAD's heterogeneous tool assignment adds ingestion/API cost per debate round, and its stability-score gate (RAGAS Faithfulness/Answer Relevance) requires the retrieval infrastructure that supports those metrics in the first place.
