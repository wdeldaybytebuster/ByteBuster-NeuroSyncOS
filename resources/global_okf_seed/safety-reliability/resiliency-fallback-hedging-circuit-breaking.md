---
type: concept
title: Resiliency Patterns — Fallback, Hedging, and Health-Weighted Routing
description: Three progressive outage-management patterns for LLM gateways — sequential fallback chains, parallel hedged requests, and time-decayed health-weighted routing.
confidence: 0.95
tags: [resiliency, fallback-chain, hedged-requests, provider-health, llm-gateway]
category: safety-reliability
source_doc: dynamic-system-control-in-enterprise-llm-gateways-architectural-reference-for-di.md
---

# Resiliency Patterns — Fallback, Hedging, and Health-Weighted Routing

## Core Idea
Enterprise LLM gateways manage provider outages via three progressive patterns. Sequential fallback chains try a primary provider first and escalate to alternates on failure — simple, but it adds sequential latency on failure. Parallel hedged requests replicate one query to two providers simultaneously, return the fastest response, and cancel the other — trading doubled token cost for predictable latency. Active health checking with weighted routing tracks a rolling, time-decayed uptime metric that weights the most recent 0-1 minute window 10x, the 1-5 minute window 3x, and the 5-60 minute window 1x, applying an exponential penalty once uptime drops below roughly 95% (a drop to 90% uptime yields a mild ~0.07 penalty; a drop to 50% yields a severe ~5.61 penalty), effectively removing degraded providers from rotation.

## When To Use
Sequential fallback suffices for cost-sensitive, latency-tolerant workloads; hedged requests are worth the doubled cost when tail-latency predictability matters more than spend; time-decayed health weighting is needed once three or more interchangeable upstream providers exist and automatic, gradual de-prioritization is preferred over a binary up/down circuit breaker.

## NeuroSync Applicability
Partially implemented. `RouteSwitchEngine.execute()` (`src/core/routeswitch/engine.ts`, the fallback loop around lines 246-296) implements sequential fallback: it walks an ordered provider chain, skips providers where `ProviderHealthState.getState(id).isExhausted` is true, and tries the next provider on failure. There is no parallel hedged-request mode and no time-decayed rolling-window uptime scoring — `ProviderHealthState` (`src/core/routeswitch/interceptor.ts`) is a binary exhausted/not-exhausted flag driven by the most recent rate-limit response, not a weighted historical metric.

## Tradeoffs / Risks
Sequential fallback introduces a latency tax proportional to chain depth on failure. Hedged requests double cost for every hedged call, which is wasteful when failures are rare. Time-decayed weighting requires continuously tracking metrics per provider and tuning penalty curves, adding operational complexity beyond a simple binary health flag.
