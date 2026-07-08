---
type: concept
title: Constrained Decoding Attack (CDA)
description: A control-plane security vulnerability where an attacker embeds a malicious instruction in an unconstrained schema field, which the model is then forced to echo and complete.
confidence: 0.95
tags: [security, structured-output, prompt-injection, constrained-decoding, jailbreak]
category: tooling-integration
source_doc: architectural-foundations-of-structured-output-generation-and-validation-in-larg.md
---

# Constrained Decoding Attack (CDA)

## Core Idea
The Constrained Decoding Attack targets the trust boundary of structured generation itself. It works in three steps: (1) grammar-enforced prefix injection — the attacker embeds a malicious instruction or prefix inside an unconstrained text field of a JSON schema or context-free grammar; because the model is forced to conform to that schema, the logit-masking engine forces the model to emit the malicious prefix as part of its generation trajectory; (2) context alignment — once emitted, that forced prefix is appended to the model's active context window, committing it into the generation path; (3) semantic completion — in later, unconstrained fields, the model naturally continues from the now-accepted malicious prefix, and because the prefix is already "in its own words" in context, safety guardrails are bypassed and it produces harmful content within otherwise-structured fields. Because the constrained decoding engine is a hard control layer, it can override system-level safety prompting, making this difficult to prevent through post-training alignment alone.

## When To Use
This is a threat model to defend against, not a technique to deploy — relevant anywhere an agent accepts externally-supplied or lightly-trusted schema definitions (e.g. dynamic tool schemas, user-configurable extraction templates) that include unconstrained free-text fields alongside forced/constrained fields, especially within MCP or tool-calling loops.

## NeuroSync Applicability
Not currently implemented in NeuroSync — no CDA-specific defense exists. NeuroSync's GBNF grammars (`OKF_CONCEPT_EXTRACTION_GBNF`, `ScopeLogicGBNF`) are hardcoded and developer-authored rather than accepting externally-supplied schema definitions at runtime, which limits (but does not eliminate, since the free-text fields like `description`/`prompt` are still unconstrained) this specific attack surface. `ValidatorLogic.validate()` (`src/core/scopelogic/validator.ts`) does scan generated DAG node prompts for forbidden SQL/shell patterns and reserved-service references after generation, but this is a content blocklist unrelated to CDA's schema-injection vector, and there is no explicit sanitization step for schema definitions themselves.

## Tradeoffs / Risks
The source's recommended defense — sanitizing schema definitions and running post-facto verification filters on all structured output before it reaches downstream systems — adds an extra validation pass distinct from the schema-conformance check itself, since a CDA-produced output can be perfectly schema-valid while still containing injected malicious content. This means schema validity alone (which NeuroSync's GBNF grammars and `ValidatorLogic` both check) is not sufficient evidence that output content is safe.
