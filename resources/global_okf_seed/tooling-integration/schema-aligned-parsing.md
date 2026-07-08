---
type: concept
title: Schema-Aligned (Post-Facto) Parsing
description: Instead of constraining generation, let the model output freely, then use resilient, error-tolerant parsing to coerce and align raw text to the target schema.
confidence: 0.95
tags: [structured-output, parsing, baml, pydantic, error-tolerance]
category: tooling-integration
source_doc: architectural-foundations-of-structured-output-generation-and-validation-in-larg.md
---

# Schema-Aligned (Post-Facto) Parsing

## Core Idea
Post-facto schema-aligned parsing is the opposite strategy to inference-time constrained decoding: let the model generate text unconstrained (avoiding the format tax), then apply a tolerant parser downstream that cleans, coerces, and aligns the raw output to the target schema. BAML's Schema-Aligned Parsing (SAP), written in Rust, uses an edit-distance algorithm with a custom cost function to strip conversational preambles/postambles and markdown fences, coerce single elements into lists (`"Amazon"` → `["Amazon"]`), map misspelled or hallucinated keys back to canonical field names, and parse expressions like `"1/2"` into `0.5`. Pydantic V2 applies a related philosophy (Postel's Law — "be liberal in what you accept") via its Rust `pydantic-core` engine, attempting lossless coercion (e.g. string `"10"` → int `10`) rather than outright rejection.

## When To Use
Use schema-aligned parsing for external/closed-model APIs where you cannot control decode-time token masking, or whenever preserving the model's natural token distribution (and thus reasoning quality) matters more than guaranteeing zero-retry structural validity at generation time.

## NeuroSync Applicability
Partially implemented. Both `OKFGenerator._extractConcepts()` (`src/core/okf/generator.ts`) and `ScopeLogicSession._parseLLMProposal()` (`src/core/scopelogic/interview.ts`) apply the same tolerant-parsing shape described here: strip markdown code fences via regex (`` ```(?:json)?\s*([\s\S]*?)``` ``), locate the actual JSON array/object boundaries within surrounding preamble text (`indexOf`/`lastIndexOf`), then `JSON.parse` the isolated substring — degrading gracefully to an empty result (OKF) or the template fallback (ScopeLogic) if parsing still fails. This is a genuine, if manual and less sophisticated, implementation of the "strip noise, then coerce" pattern SAP formalizes; NeuroSync does not have BAML's edit-distance key-remapping or type-coercion (e.g. no automatic scalar-to-list coercion or fraction parsing).

## Tradeoffs / Risks
Because SAP evaluates the lowest-cost transformation to align a raw string to a schema, it can in principle "successfully" parse an output that is a poor semantic match to what was intended, silently masking a generation-quality problem as a parsing success. The source separately warns that Zod-generated JSON schemas can include validation-only keywords (like `exclusiveMinimum`) that specific provider APIs reject outright with a 400 error, requiring schema sanitization as its own downstream concern distinct from parsing tolerance.
