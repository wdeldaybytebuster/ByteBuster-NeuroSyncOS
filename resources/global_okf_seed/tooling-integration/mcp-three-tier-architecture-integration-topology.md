---
type: concept
title: MCP Three-Tier Architecture and the N+M Integration Topology
description: The Model Context Protocol standardizes LLM-to-tool integration into a Host/Client/Server architecture, collapsing an N-times-M custom-integration problem into N+M.
confidence: 0.95
tags: [mcp, protocol, integration, architecture]
category: tooling-integration
source_doc: architecture,-integration-mechanics,-and-security-governance-of-the-model-contex.md
---

# MCP Three-Tier Architecture and the N+M Integration Topology

## Core Idea
Before MCP, connecting N reasoning models to M application endpoints required N×M bespoke integrations, since every provider had its own API schema and function-calling parameters. MCP standardizes this boundary into an N+M topology via a three-tier client-host-server architecture: the Host Application manages the UI and LLM session lifecycle, the Client maintains a dedicated one-to-one connection to a specific server and enforces policy, and the Server is a focused process that exposes data sources and execution tools through standardized primitives. All communication uses JSON-RPC 2.0 with a required, non-null request identifier for transaction matching.

## When To Use
Reach for MCP (or a protocol like it) when a single LLM-powered application needs to talk to many heterogeneous tools/data sources, or when the same tool needs to be reachable from many different model/host combinations, and bespoke per-pair integration code would otherwise multiply.

## NeuroSync Applicability
Not currently implemented in NeuroSync. `src/server/routes/system.ts` exposes `/api/system/mcp/connections` and `/api/system/tools` endpoints, but these only read/write a JSON blob (`mcp_connections`, `tool_registry`) in the `system_settings` table for dashboard display — there is no JSON-RPC transport, no Host/Client/Server session lifecycle, and no actual protocol-level tool discovery or invocation implemented against that data.

## Tradeoffs / Risks
MCP's own transport layer adds a baseline latency penalty of roughly 600ms to 3s per round trip, which the source notes makes it unsuitable for sub-millisecond, real-time critical paths like payment processing or high-frequency trading. Adopting a standardized protocol also means inheriting its full security surface (authorization, SSRF, session handling) rather than a narrower bespoke integration's smaller attack surface.
