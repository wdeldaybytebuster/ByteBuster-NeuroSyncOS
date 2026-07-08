---
type: concept
title: The Confused Deputy Problem and Token Passthrough Anti-Pattern
description: An intermediary server with elevated privileges executing actions on behalf of a less-privileged user without properly scoping consent or tokens, letting attackers bypass per-client authorization.
confidence: 0.95
tags: [security, oauth, mcp, authorization]
category: tooling-integration
source_doc: architecture,-integration-mechanics,-and-security-governance-of-the-model-contex.md
---

# The Confused Deputy Problem and Token Passthrough Anti-Pattern

## Core Idea
The "Confused Deputy" problem occurs when a proxy server uses a single static client ID to connect many users to downstream APIs, caching consent globally so a malicious client can piggyback on another user's authorization. A related anti-pattern, "Token Passthrough," is when an MCP server accepts a bearer token from its client and forwards it unchanged to a downstream API — bypassing audience limits, rate limiting, and audit boundaries. Mitigations include validating the `aud` (audience) claim on every incoming token, maintaining a per-client-ID consent registry rather than global consent, using hardened `__Host-` prefixed cookies with `Secure`/`HttpOnly`/`SameSite=Lax`, generating short-lived single-use state parameters, and — critically — never forwarding a client's token downstream; instead the server must acquire its own independently-scoped tokens.

## When To Use
Apply these controls whenever a server sits between an untrusted or multi-tenant client and a privileged downstream API/database, particularly any proxy or gateway that terminates one auth flow and initiates another on the caller's behalf.

## NeuroSync Applicability
Not currently implemented in NeuroSync. NeuroSync has no OAuth 2.1/OIDC authorization flow, no proxy server brokering tokens between clients and downstream APIs, and no per-client consent registry — its `RouteSwitch` layer (`src/core/routeswitch/router.ts`) calls external LLM provider APIs directly using a single server-held `OPENROUTER_API_KEY` from the environment, which is a materially different (single-tenant, non-delegated) trust model than the confused-deputy scenario this concept addresses.

## Tradeoffs / Risks
Correctly scoping per-downstream tokens and maintaining a signed consent registry adds real implementation and operational overhead versus the simpler (but vulnerable) global-token-passthrough approach, which is exactly why the anti-pattern persists in practice despite being well documented.
