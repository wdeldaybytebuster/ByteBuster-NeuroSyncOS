---
type: concept
title: Constrained Decoding and the Projection Tax
description: Token-level logit masking that guarantees schema-compliant LLM output but can measurably distort the model's reasoning trajectory.
confidence: 0.95
tags: [constrained-decoding, structured-output, logit-masking, pushdown-automata, inference-engine]
category: safety-reliability
source_doc: comparative-architectures,-state-dynamics,-and-security-paradigms-of-large-langu.md
---

# Constrained Decoding and the Projection Tax

## Core Idea
Constrained decoding enforces schema compliance by masking invalid tokens at every generation step: a logit mask sets disallowed tokens to negative infinity before softmax, so the sampled probability of an invalid token is exactly zero. Early engines (Outlines) implemented this with Finite-State Machines that transition token-by-token, blocking parallel batched execution; newer engines like XGrammar instead use recursive Pushdown Automata that can evaluate complex context-free grammars and nested JSON structures across multiple tokens simultaneously, aided by techniques such as TagDispatch, JIT-compiled adaptive token mask caching, and cross-grammar caching. Constrained decoding is not a passive formatting filter, however — zeroing and renormalizing invalid tokens can force the model into locally-valid but globally-incorrect trajectories. This distortion is formalized as a "projection tax" measured via the KL divergence between the constrained and unconstrained output distributions, which grows as the model's own probability mass on valid tokens shrinks. Draft-Conditioned Constrained Decoding (DCCD) mitigates this by having the model first generate an unconstrained draft capturing its reasoning, then constraining generation conditioned on that draft.

## When To Use
Use PDA-based constrained decoding when absolute schema compliance is required at the inference-engine level (e.g. strict JSON tool-call arguments) and batched throughput matters; be aware of reasoning-degradation risk at low-entropy grammar points (quotes, brackets) repeated over long outputs.

## NeuroSync Applicability
Not currently implemented in NeuroSync. Structured LLM outputs are enforced via post-hoc Zod schema validation on the application side (`src/core/scopelogic/schemas.ts` — `DAGProposalSchema`, `InterviewResponseSchema`), not via token-level constrained decoding or logit masking at inference time; NeuroSync calls external provider APIs through RouteSwitchEngine and does not control their token-level sampling.

## Tradeoffs / Risks
FSM-based engines block parallel execution in batched serving environments; boundary mismatches between character-level grammars and the model's subword tokenizer can cause an engine to incorrectly mask valid tokens when a tokenizer merges a semantic string with a structural character. Aggressive renormalization at low-entropy syntax points, repeated across hundreds of tokens, induces a measurable reasoning-quality degradation per the source's KL-divergence formalization.
