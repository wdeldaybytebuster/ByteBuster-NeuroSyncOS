---
type: concept
title: Schema-Aligned Parsing vs Constrained Decoding for Structured Output
description: Three competing families for enforcing structured LLM output — prompt-and-retry libraries, native strict-mode APIs, and post-hoc schema-aligned parsing — trade off portability, cost, and reasoning freedom differently.
confidence: 0.95
tags: [structured-output, schema-validation, baml, json-schema, retry-loop]
category: safety-reliability
source_doc: comparative-architectures,-state-dynamics,-and-security-paradigms-of-large-langu.md
---

# Schema-Aligned Parsing vs Constrained Decoding for Structured Output

## Core Idea
Three families exist for enforcing structured LLM output. Prompting-and-retry libraries (Instructor, Pydantic-AI) serialize a verbose JSON Schema into the prompt and, on validation failure, retry the model with the error message until it complies or hits a retry limit — simple but adds latency, token cost, and requires a capable tool-calling model. Native schema-enforced APIs (e.g. OpenAI Strict Mode) guarantee 100% compliance via constrained decoding at the inference-engine level, but are tied to one provider and support only a JSON Schema subset (all fields required, `additionalProperties: false`, max nesting depth 5, no `minLength`/`pattern`/`format`). BAML's Schema-Aligned Parsing (SAP) instead lets the model reason freely in loose or malformed text, then uses a Rust-based parser to extract structured data by stripping comments and markdown fences, correcting missing quotes and unescaped newlines, coercing types, and resolving trailing commas — avoiding the retry-loop cost and provider lock-in while cutting prompt token overhead by up to 4x via a compressed schema DSL.

## When To Use
Choose SAP-style post-hoc parsing for provider portability and unconstrained reasoning; choose native strict-mode constrained decoding when guaranteed 100% compliance outweighs reasoning quality or portability concerns; treat prompt-and-retry as a prototyping-only pattern given its latency and token cost on every validation failure.

## NeuroSync Applicability
Partially implemented. NeuroSync validates LLM outputs against Zod schemas after generation (`src/core/scopelogic/schemas.ts` — `DAGProposalSchema`, `InterviewResponseSchema`), which is architecturally closest to the prompt-and-retry family (post-hoc schema validation against a fixed schema), not to BAML's SAP-style malformed-text recovery or to native provider-level constrained decoding.

## Tradeoffs / Risks
Prompt-and-retry increases latency and token consumption on every validation failure and only works reliably with capable, tool-calling-supporting models. Native strict mode locks the system to one provider's JSON Schema subset. SAP requires trusting a separate parsing engine to correctly recover intent from loose text rather than guaranteeing syntactic compliance up front.
