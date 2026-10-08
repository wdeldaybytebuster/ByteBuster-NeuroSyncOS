---
type: concept
title: Multi-Agent Topology Taxonomy (Horizontal vs. Vertical)
description: Interaction structures for multi-agent systems split into horizontal peer-to-peer debate and vertical hierarchies with a dedicated judge/moderator role.
confidence: 0.95
tags: [multi-agent, debate, topology, consensus, orchestration]
category: multi-agent-orchestration
source_doc: systems-engineering,-mathematical-formulations,-and-security-controls-in-multi-a.md
---

# Multi-Agent Topology Taxonomy (Horizontal vs. Vertical)

## Core Idea
Single-agent LLM generation is vulnerable to the Degeneration-of-Thought problem — premature anchoring to early, incorrect predictions with no mechanism to explore alternative paths. Multi-Agent Debate frameworks coordinate structured, multi-turn interactions among role-differentiated agents to break these self-reinforcing loops. The structural topology determines how information and consensus flow: horizontal (peer-to-peer) topologies treat agents as equals debating directly, while vertical (hierarchical) topologies introduce a dedicated meta-agent — a judge, moderator, or consensus aggregator — to prevent peer interactions from collapsing into uncritical agreement. Empirically, the right decision protocol depends on task type: consensus-based protocols win on factual recall and knowledge retrieval, while voting-based protocols win on multi-step logical deduction.

## When To Use
Choose horizontal/peer topologies for exploratory or open-ended reasoning where multiple independent perspectives should surface. Choose vertical topologies with a judge role when you need a definitive, defensible final decision (e.g. evaluation, arbitration) and want to actively guard against premature consensus.

## NeuroSync Applicability
Partially implemented. `ConsensusSynthesizer.executeCouncilMode()` (`src/core/routeswitch/council.ts`) is a horizontal, peer-to-peer topology: it runs multiple LLM providers in parallel on the same prompt and combines their outputs into a `ConsensusResult`. It has no vertical/judge role, however — disagreement is estimated with a simple length-variance heuristic (`maxDiff` across response lengths) rather than any structured critique, voting, or moderation step, and the "winning" response is just the longest one, not a judged or debated one.

## Tradeoffs / Risks
Vertical topologies add coordination overhead (a moderator role and extra reasoning rounds) that horizontal topologies avoid, but horizontal peer topologies are more exposed to disagreement collapse and majority-opinion convergence without a corrective judge. Choosing the wrong protocol for the task type (e.g. voting for factual-recall tasks) measurably degrades accuracy per the source's comparative studies.
