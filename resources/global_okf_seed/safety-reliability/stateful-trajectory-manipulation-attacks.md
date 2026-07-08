---
type: concept
title: Stateful Manipulation of Trajectory (SMT) Attacks
description: A multi-turn jailbreak class where no single message violates safety rules but the accumulated tool-calling conversation trajectory erodes the model's safety boundaries.
confidence: 0.95
tags: [prompt-injection, function-calling, multi-turn-security, jailbreak, agent-security]
category: safety-reliability
source_doc: comparative-architectures,-state-dynamics,-and-security-paradigms-of-large-langu.md
---

# Stateful Manipulation of Trajectory (SMT) Attacks

## Core Idea
LLM function-calling agents aggregate the full conversation and execution history (JSON schemas, structured arguments, tool results, validation errors, dialogue) into a single stateful context window that is resubmitted with every turn. Stateful Manipulation of Trajectory (SMT) exploits this by distributing adversarial control across multiple turns so that no single message triggers a safety refusal, while the combined trajectory systematically erodes the model's safety boundaries and shifts it from refusal to compliance. Related exploits named in the source include JailbreakFunction, which inserts fabricated validation exceptions into prior interaction records to force the model's own self-correction loop to loosen its parameters, and Odysseus, which uses dual steganography to hide malicious directives inside seemingly benign API schemas and parameters.

## When To Use
Applies to any multi-turn, tool-augmented agent architecture where the entire execution history is re-submitted as trusted context on each subsequent call — the trigger for concern is any system relying only on single-message, prompt-centric safety filters in such an environment.

## NeuroSync Applicability
Not currently implemented in NeuroSync. There is no trajectory-level auditing of accumulated tool-call history for coordinated, multi-turn manipulation anywhere in `src/core/routeswitch` or `src/core/coreexec` — RouteSwitchEngine forwards accumulated context to providers without a dedicated cross-turn safety re-evaluation pass.

## Tradeoffs / Risks
Because the complete execution history is resubmitted with each request, an instruction smuggled into one tool output becomes part of "trusted" context and can persist across many subsequent turns, subtly steering downstream tool selection and parameter generation. Prompt-centric, single-turn defenses are fundamentally insufficient against this pattern since they never see the cumulative trajectory.
