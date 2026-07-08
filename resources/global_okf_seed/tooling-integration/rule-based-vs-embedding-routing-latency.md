---
type: concept
title: Routing Strategy Latency Tiers (Rule-Based to LLM-as-Router)
description: The four dominant query-routing strategies form a strict latency/accuracy tradeoff curve, from sub-millisecond keyword rules up to 200-800ms LLM-based classification.
confidence: 0.95
tags: [routing, semantic-routing, latency, keyword-matching, classification]
category: tooling-integration
source_doc: architectural-paradigms-and-systems-level-engineering-of-semantic-routing-in-llm.md
---

# Routing Strategy Latency Tiers (Rule-Based to LLM-as-Router)

## Core Idea
Because router latency adds directly to user-perceived time-to-first-token, the source ranks four routing strategies by overhead: rule-based routing (regex/keyword parsing) adds under 1ms and is highly debuggable but cannot capture semantic nuance; embedding-based similarity (projecting a query and predefined route utterances into a shared vector space, then cosine-comparing) adds 5-15ms; lightweight model-based classifiers (e.g. ModernBERT) add 10-50ms with more robust handling of overlapping intents; LLM-as-a-router (e.g. Claude Haiku, Phi-4-mini) offers the highest reasoning quality but costs 200-800ms and raises API spend. A production semantic router (Aurelio AI) reportedly reaches 92-96% classification precision within 1-2 weeks of tuning static routes, at sub-penny cost per query versus roughly $0.65 per 10,000 queries for an LLM-based classifier.

## When To Use
Choose the cheapest strategy that meets the accuracy bar for the routing decision at hand — rule-based/regex for high-confidence, low-ambiguity dispatch; embedding similarity when queries are lexically diverse but conceptually clustered; LLM-as-router only when the decision genuinely requires open-ended reasoning that can't be captured by a fixed route set.

## NeuroSync Applicability
Already implemented (rule-based tier). `classifyIntent()` in `src/core/memory/context-router.ts` routes each Cerebro chat query to one of `code` / `knowledge` / `conversational` using ordered regex pattern arrays (`CODE_PATTERNS`, `KNOWLEDGE_PATTERNS`) — a direct instance of the "Rule-Based Routing" tier described here, explicitly documented in-code as intentional ("ML-grade routing is explicitly NOT required for v1"). Separately, `classifyComplexity()` in `src/core/routeswitch/model-selector/classifier.ts` buckets prompts into `trivial`/`logical`/`complex` via keyword lists and length thresholds to drive model-tier selection — the same sub-millisecond keyword-rule pattern applied to model routing rather than context routing.

## Tradeoffs / Risks
The source is explicit that if a router's own latency overhead is too high, it can erase the latency savings gained by routing to a faster downstream model — so the routing layer's cost must be weighed against what it saves. Pure keyword/regex routing (NeuroSync's current tier) is also the strategy most prone to missing semantic nuance: a query that expresses "code structure" intent without matching any of the hardcoded regex patterns silently falls through to the conversational-memory path instead.
