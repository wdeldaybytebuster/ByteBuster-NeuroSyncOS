---
type: concept
title: Three-Layer Runaway Agent Rate Limiting
description: A layered gateway defense against recursive agent loops, combining identity-scoped token buckets, pattern-based circuit breakers, and declarative fallback chains.
confidence: 0.95
tags: [rate-limiting, circuit-breaker, runaway-agent, llm-gateway, fallback-chain]
category: safety-reliability
source_doc: dynamic-system-control-in-enterprise-llm-gateways-architectural-reference-for-di.md
---

# Three-Layer Runaway Agent Rate Limiting

## Core Idea
Because agents can recurse into hundreds of LLM calls per minute, and their input context often grows quadratically as full execution history is replayed each turn, gateways enforce a 3-layer strategy at the boundary. Layer 1 is a token bucket scoped to a precise `(user, repo, model)` identity tuple rather than a coarse global limit, so a runaway script in one repository doesn't lock out the developer's ability to debug it. Layer 2 is pattern-based circuit breakers that trip on consecutive 429s ignored by the client, cost-velocity spikes (e.g. 10% of the daily budget burned in under a minute), or unusual call shapes (identical prompts, monotonically growing context windows). Layer 3 is a declarative, pre-configured per-route fallback chain the gateway drops into once a circuit trips — degrading to a cheaper model, checking a semantic cache, or returning a 503 — noting that some routes (e.g. a coding agent) should have no fallback, since degraded code is worse than an outright error.

## When To Use
Deploy this whenever autonomous agents can loop or recurse without an immediate human in the loop — it specifically targets "spend velocity" and recursive-loop failure modes that simple per-minute request limits miss.

## NeuroSync Applicability
Partially implemented. NeuroSync's RouteSwitchEngine has an analog of Layers 1 and 3: `ProviderHealthState` (`src/core/routeswitch/interceptor.ts`) tracks per-provider-model exhaustion from live rate-limit headers, and `RouteSwitchEngine.execute()` (`src/core/routeswitch/engine.ts`) walks a sequential fallback chain (`llm_routing_rules.provider_chain`) when a provider is exhausted or fails. There is no Layer 2 pattern-based circuit breaker (no detection of repeated-429 ignoring, cost-velocity spikes, or repetitive call-shape anomalies) and no per-`(user, repo, model)` token bucket — health state is keyed only by provider/model, not by identity.

## Tradeoffs / Risks
Coarse, global-only rate limits fail under generative AI workloads because a single large-context call can cost as much as 50 normal requests. Identity-scoped limiting adds bookkeeping overhead and requires the gateway to correctly attribute every call to the right identity tuple, which is easy to get wrong in multi-tenant systems.
