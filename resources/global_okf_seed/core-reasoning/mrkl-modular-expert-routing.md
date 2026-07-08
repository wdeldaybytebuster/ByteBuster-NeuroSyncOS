---
type: concept
title: MRKL — Modular Routing to Hardcoded Experts
description: Instead of one model reasoning end-to-end, a router classifies the query and dispatches it to a fixed set of specialized "expert" tools (e.g. a calculator, a SQL database), guaranteeing exact results for well-defined subdomains.
confidence: 0.95
tags: [routing, tool-use, modular-architecture, mrkl]
category: core-reasoning
source_doc: comparative-analysis-of-interleaved-cognitive-deliberation-and-tool-based-execut.md
---

# MRKL — Modular Routing to Hardcoded Experts

## Core Idea
Modular Reasoning, Knowledge, and Language (MRKL) has the model act purely as a router: it classifies an incoming request and directs it to a hardcoded expert module (a calculator, a SQL engine, a search index) rather than trying to reason the answer out itself. This avoids the recursive context overhead of an interleaved deliberation loop and guarantees exact, deterministic outputs for the subdomains covered by an expert, at the cost of only handling the fixed set of domains the router was built to recognize.

## When To Use
Use MRKL-style routing when a meaningful fraction of incoming queries fall into a small number of well-defined, deterministically-answerable categories (arithmetic, structured data lookup, known document classes) where dispatching to a purpose-built tool is both cheaper and more reliable than free-form LLM reasoning.

## NeuroSync Applicability
Partially implemented. `src/core/memory/context-router.ts` implements exactly this shape of router: `matchesAny` regex classification decides whether a query is `'code'`, `'knowledge'`, or `'conversational'` intent, then routes to a specific hardcoded backing store — GitNexus AST queries (`queryCodeStructure`) for code-structure questions, the OKF knowledge graph for decision/preference language, or `CerebroVectorStore` for general conversational memory — instead of a single flat LLM call deciding everything. The routing rules are regex/keyword-based rather than a learned or LLM-based router, and the "experts" are knowledge stores rather than computational tools like a calculator, but the core "classify-then-dispatch-to-a-fixed-expert" architecture matches.

## Tradeoffs / Risks
A fixed, regex-based router only handles the query shapes its patterns were written to recognize — ambiguous or novel phrasings can be misrouted to the wrong expert with no fallback reasoning to catch the error. Expanding coverage requires manually adding new expert modules and routing rules rather than the system generalizing on its own.
