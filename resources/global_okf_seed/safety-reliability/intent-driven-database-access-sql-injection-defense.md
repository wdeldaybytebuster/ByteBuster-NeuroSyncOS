---
type: concept
title: Intent-Driven Database Access as SQL Injection Defense
description: Restricting LLM agent output to structured, pre-validated intents instead of raw SQL prevents injection attacks that occur when model-generated parameters are interpolated into query strings.
confidence: 0.95
tags: [sql-injection, database-security, agent-security, parameterized-queries, prompt-injection]
category: safety-reliability
source_doc: comparative-architectures,-state-dynamics,-and-security-paradigms-of-large-langu.md
---

# Intent-Driven Database Access as SQL Injection Defense

## Core Idea
Letting an LLM agent generate raw, executable SQL or interpolate model-generated parameters directly into query strings is a severe vulnerability. The source cites a real exploit class in the Anything-LLM framework where unsanitized parameters inserted into JavaScript template literals enabled SQL injection (UNION-based data exfiltration, table deletion) via direct or indirect prompt injection embedded in retrieved documents. The recommended defense restricts model output to structured JSON schemas representing specific, pre-validated intents: query structure is fixed at compilation time, and only parameters are passed separately to the database driver at runtime, which by construction prevents the model from ever influencing SQL syntax. Systems should additionally run an `EXPLAIN` plan to estimate query cost before execution, rejecting resource-intensive requests that could cause denial-of-service.

## When To Use
Any agent architecture where LLM output influences database reads or writes — never let the model construct or influence raw SQL text; restrict it to selecting among fixed, parameterized query templates.

## NeuroSync Applicability
Already implemented. NeuroSync's LLM-facing code paths never generate raw SQL — database access throughout `src/core` and `src/server/routes` uses `better-sqlite3`'s `db.prepare()` with parameterized `?` placeholders (e.g. `src/core/coreexec/engine.ts`, `src/core/memory/cerebro/vector.ts`, `src/server/routes/todos.ts`); the model only ever produces structured JSON (DAG proposals, chat responses validated by the Zod schemas in `src/core/scopelogic/schemas.ts`), which the application layer maps to fixed, hardcoded queries — it never sees or influences raw SQL text.

## Tradeoffs / Risks
This approach requires every new agent-triggered database operation to be added as an explicit, pre-defined intent/template by developers — it does not generalize to arbitrary ad hoc queries the way a text-to-SQL system would, trading flexibility for safety. The source's `EXPLAIN`-plan cost-rejection is a broader defense pattern; no evidence of that specific cost-based rejection mechanism exists in the NeuroSync codebase.
