---
type: concept
title: Pre-Request Reservation and Post-Response Settlement
description: A two-stage transactional pattern that reserves an estimated LLM token cost before a request executes and settles the true cost afterward, preventing concurrent requests from overspending a shared budget.
confidence: 0.95
tags: [token-budgeting, rate-limiting, llm-gateway, cost-control, distributed-state]
category: safety-reliability
source_doc: dynamic-system-control-in-enterprise-llm-gateways-architectural-reference-for-di.md
---

# Pre-Request Reservation and Post-Response Settlement

## Core Idea
Because an LLM response's length — and therefore its true cost — is non-deterministic, a gateway that only logs cost after a request completes lets concurrent runaway agent loops or coordinated attacks exhaust the entire token budget before the database ever records the spend. The fix is a two-stage transactional pattern: on receipt, the gateway estimates input tokens with a local tokenizer and output tokens from `max_tokens`, computes an estimated cost, and temporarily reserves that amount in a distributed state store — blocking concurrent requests from double-spending the same budget — rejecting with HTTP 429 or 402 if the estimate exceeds remaining quota. After the provider responds, the gateway reads the actual token counts, commits the true cost, and refunds the difference between the estimate and the actual spend.

## When To Use
Any multi-tenant or multi-agent system where token cost must be strictly enforced in real time under concurrency — without this pattern, a burst of concurrent requests can overspend quota during the window between request start and cost logging.

## NeuroSync Applicability
Not currently implemented in NeuroSync. RouteSwitchEngine (`src/core/routeswitch/engine.ts`) tracks provider health reactively from response rate-limit headers via `ProviderHealthState` (`src/core/routeswitch/interceptor.ts`), but there is no pre-reservation of estimated token cost before a request nor a settle/refund step afterward — no distributed quota store or two-phase budget commit exists in the codebase.

## Tradeoffs / Risks
Requires a fast, globally consistent state store (Redis with atomic Lua scripts, or Cloud Spanner) capable of sub-millisecond check-and-set operations under horizontal scale-out. Token estimation is approximate — a local tokenizer's estimate can drift from the provider's actual tokenization — so some degree of over- or under-reservation persists until settlement corrects it.
