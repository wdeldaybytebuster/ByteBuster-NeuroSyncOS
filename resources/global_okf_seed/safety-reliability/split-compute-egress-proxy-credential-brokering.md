---
type: concept
title: Split-Compute with Egress-Proxy Credential Brokering
description: Keeping sensitive credentials on a trusted host and injecting them only at a TLS-terminating egress proxy so sandboxed, LLM-generated code never sees the raw secrets it authenticates with.
confidence: 0.95
tags: [credential-brokering, egress-proxy, sandbox-fallacy, secret-management, agent-security]
category: safety-reliability
source_doc: principles-and-architecture-of-secure-execution-environments-for-untrusted,-ai-g.md
---

# Split-Compute with Egress-Proxy Credential Brokering

## Core Idea
To prevent data exfiltration while still letting a sandboxed agent call external services, the architecture withholds raw credentials from the sandbox entirely: the orchestration harness (holding sensitive tokens) runs on a trusted host, while all generated code executes inside an isolated sandbox configured with default-deny egress. Allowed outbound traffic is routed through a secret-injection proxy that deploys an ephemeral Certificate Authority inside the sandbox's trust store, terminates the sandbox's outbound TLS connections, evaluates configured Matchers (path, method, headers) to decide whether the request targets a legitimate allowed endpoint, injects the real authorization header only for matching requests, and re-encrypts before forwarding — with injected headers configured to overwrite any matching headers the sandboxed code tried to set itself, preventing credential-substitution attacks. This is the direct fix for the "Sandbox Fallacy": running the orchestration harness and untrusted code in the same process boundary, where a container escape gives direct access to decrypt stored tokens.

## When To Use
Any architecture where sandboxed, LLM-generated code needs to call external APIs but must never see the actual API keys or tokens used to authenticate those calls.

## NeuroSync Applicability
Not currently implemented in NeuroSync. There is no TLS-terminating egress proxy or credential-injection-at-the-perimeter layer in `src/core/portgrid` — `CommandSandbox`'s allowlisted commands run with `--unshare-net` (no network at all, so no proxy is needed for that path), while the interactive terminal (`src/core/portgrid/terminal-session.ts`) intentionally has open, unproxied network access with no credential-brokering layer between the sandboxed shell and any external endpoint it might reach.

## Tradeoffs / Risks
Operating a TLS-terminating proxy requires installing a custom CA into the sandbox's trust store, which some TLS-pinning clients may reject, and maintaining a Matcher rule set that must be kept current with which endpoints and paths are legitimately allowed — an overly permissive Matcher set defeats the purpose, while an overly narrow one breaks legitimate agent workflows.
