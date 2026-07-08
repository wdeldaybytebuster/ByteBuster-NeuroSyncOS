---
type: concept
title: Uncertainty Quantification for Function Calling
description: Estimating a model's confidence in its proposed tool-call parameters before executing actions with irreversible real-world effects.
confidence: 0.85
tags: [uncertainty-quantification, function-calling, safety-gate, semantic-entropy, human-in-the-loop]
category: safety-reliability
source_doc: comparative-architectures,-state-dynamics,-and-security-paradigms-of-large-langu.md
---

# Uncertainty Quantification for Function Calling

## Core Idea
Uncertainty Quantification (UQ) evaluates a model's confidence in its proposed tool-call parameters before execution, which matters most when the call has irreversible effects (transferring funds, altering configuration). Multi-sample UQ methods such as Semantic Entropy cluster N sampled tool calls into equivalence classes by Abstract Syntax Tree (AST) equality and compute entropy over the resulting class probabilities. The source explicitly flags this area as less settled than it first appears: it notes multi-sample methods that "perform well in natural language tasks... behave differently in function-calling settings," and that single-sample, logit-based uncertainty scores (computed only over semantically meaningful tokens, skipping structural JSON delimiters) "often match" multi-sample performance in practice — i.e. the multi-sample-vs-single-sample tradeoff for tool calling specifically is presented as an emerging, still-being-worked-out finding rather than a mature consensus, which is why this node carries a lower confidence than the rest of this set.

## When To Use
Gate any tool call with irreversible real-world side effects behind an uncertainty score, escalating to human review or refusing execution when confidence falls below a defined threshold.

## NeuroSync Applicability
Not currently implemented in NeuroSync. NeuroSync's `os_todos` Deference gate (`src/server/routes/todos.ts`) uses a caller-supplied `confidence` value with a 0.70 auto-approve threshold, but that is a distinct mechanism — a human-review gate keyed on a confidence field the caller passes in — not a model-computed AST-clustering or logit-based uncertainty measure derived from the proposed tool call itself.

## Tradeoffs / Risks
Multi-sample UQ requires generating N samples per call, adding latency and cost; AST-equivalence clustering can still conflate syntactically distinct but functionally identical calls, or fail to group calls that are semantically equivalent but structurally different. Single-sample logit approaches must carefully exclude structural JSON tokens (quotes, braces, commas) to avoid noise, and the source itself treats the relative maturity of these approaches for tool-calling as an open question rather than settled practice.
