---
type: concept
title: Grammar-Constrained Decoding
description: Enforces syntactically valid structured output by masking a language model's token logits at each decoding step against a formal grammar (FSM or PDA).
confidence: 0.95
tags: [structured-output, constrained-decoding, gbnf, grammar, json]
category: tooling-integration
source_doc: architectural-foundations-of-structured-output-generation-and-validation-in-larg.md
---

# Grammar-Constrained Decoding

## Core Idea
Constrained decoding intervenes directly in autoregressive generation: at each step, a formal grammar parser produces a boolean mask `m` over the vocabulary, and any token that would drive the output into a syntactically invalid sequence gets its logit set to `-infinity` before the softmax, guaranteeing zero probability. Regular-language constraints (enums, fixed formats) compile to a finite state machine; recursive, nested structures like JSON compile to a pushdown automaton that tracks bracket/brace nesting with an auxiliary stack. Optimized libraries like llguidance implement this with an Earley-algorithm CFG parser over regex-derivative lexing, computing token masks in roughly 50 microseconds per step even for 128k-token vocabularies.

## When To Use
Use grammar-constrained decoding for highly predictable, schema-bound generation — tool-calling arguments, fixed-shape extraction tasks — where syntactic validity must be guaranteed at the model level rather than caught and retried after the fact.

## NeuroSync Applicability
Already implemented. `src/core/okf/generator.ts` defines `OKF_CONCEPT_EXTRACTION_GBNF`, a GBNF grammar that forces the local GGUF model (via node-llama-cpp's `createGrammar()`) to emit a valid JSON array matching the concept schema exactly — the code comment states this "constrains token generation at the logit level — the model CANNOT produce malformed output." `src/core/scopelogic/gbnf-grammar.ts` similarly defines `ScopeLogicGBNF`, a grammar constraining llama.cpp output to a valid DAG-proposal JSON shape. Both are real GBNF grammars wired to local-model generation paths, not aspirational comments.

## Tradeoffs / Risks
The source documents a "token misalignment problem": formal grammars operate on characters/lexical terminals while LLMs generate subword tokens (BPE), so a single token can straddle multiple parser states, and forcing a specific character boundary can push the model onto non-canonical, out-of-distribution token sequences it rarely saw in pretraining — degrading output quality (the "alignment tax"). Naive/early implementations also introduced real latency: older FSM-per-token CPU-bound mask computation caused severe Time-to-First-Token degradation at batch sizes >= 8 before optimized backends (XGrammar, LLGuidance) moved mask computation off the critical path.
