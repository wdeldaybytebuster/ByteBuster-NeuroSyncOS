---
type: concept
title: Activation Probing and Persona Drift Detection
description: Linear probes on model hidden states can predict trajectory failure several steps in advance, and embedding-space centroid distance can quantify conversational persona decay over a multi-turn session.
confidence: 0.95
tags: [agentic-drift, interpretability, persona, observability, activation-probing]
category: multi-agent-orchestration
source_doc: taxonomic-and-mathematical-formalization-of-agentic-drift-in-long-horizon-autono.md
---

# Activation Probing and Persona Drift Detection

## Core Idea
Checking text outputs with an LLM-as-judge introduces too much latency for high-throughput, low-latency agents, so an alternative is to monitor geometric changes in intermediate model activations directly. Linear classifiers trained on a ReAct agent's residual stream can decode its internal task representation with 83.4% balanced accuracy and predict trajectory failure three steps in advance (AUC 0.989) — a "single about-to-fail geometric axis" shared across task types, providing a low-overhead, content-blind monitor. Separately, a major diagnostic trap is the "surface fidelity paradox": models can restate their own constraints with 96-100% accuracy while actively violating them in execution, meaning surface-level prompt-response validation cannot detect real behavioral drift. In conversational settings, persona drift manifests as three failure modes — "the slow relax" (gradual loss of on-brand style), "the pushback fold" (caving under user disagreement), and "the register flip" (failing to adapt tone to a frustrated user) — measured by projecting turn-by-turn outputs into embedding space and tracking the slope of cosine distance to an in-brand style centroid.

## When To Use
Use activation probing when you need early, low-latency drift/failure detection in a live agent loop and have access to model internals (hidden states) — not viable for closed hosted-API models. Use the embedding-centroid persona-drift metric for any long, multi-turn conversational agent where maintaining consistent tone/style across many turns matters (e.g. a branded assistant).

## NeuroSync Applicability
Not currently implemented in NeuroSync. NeuroSync calls external LLM providers through `src/core/routeswitch/providers.ts` and has no access to their internal hidden states, so activation-level probing is not architecturally possible against hosted models. There is also no embedding-centroid style-drift tracking anywhere in `src/core/memory` — `CerebroVectorStore` embeds and retrieves discrete memory facts, not turn-by-turn conversational style vectors compared to a persona centroid.

## Tradeoffs / Risks
Activation probing only works for models where you can access internal hidden states, ruling it out for most commercial hosted-API deployments (the source's example uses an open, locally-run Qwen2.5-7B model). The surface fidelity paradox means that any drift-detection strategy relying solely on asking the agent to restate its own constraints is fundamentally unreliable and must be paired with behavioral or structural checks instead.
