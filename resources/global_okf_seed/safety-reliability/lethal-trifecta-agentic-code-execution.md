---
type: concept
title: The Lethal Trifecta in Agentic Code Execution
description: Autonomous coding agents become exploitable when private-data access, untrusted-content ingestion, and outbound network reach converge simultaneously in the same execution context.
confidence: 0.95
tags: [lethal-trifecta, prompt-injection, agent-security, threat-model, code-execution]
category: safety-reliability
source_doc: principles-and-architecture-of-secure-execution-environments-for-untrusted,-ai-g.md
---

# The Lethal Trifecta in Agentic Code Execution

## Core Idea
Autonomous coding agents that can write and execute arbitrary code are vulnerable through the convergence of three factors — the "Lethal Trifecta": access to private data, consumption of untrusted or hostile content, and the capability of external network reach. Because LLMs treat natural language as both data and instruction, an agent that parses an external document, git history, or log file exposes its context window to hidden payloads. The source's concrete example is a diagnostic agent parsing a server log that contains an injected instruction to write a script exfiltrating `~/.ssh/id_rsa` or `~/.aws/credentials` — if the code-execution environment has both file access and outbound connectivity, the exfiltration succeeds silently. This is worsened by workspace automation: agentic IDEs that auto-run initialization scripts, git hooks, or MCP startup scripts on workspace load mean a poisoned git hook in a cloned repo can execute outside the sandbox before any explicit "run code" tool is even invoked.

## When To Use
Use this threat model to evaluate any agent that combines access to sensitive local files or credentials, ingestion of externally-sourced or untrusted text, and outbound network or code-execution capability — if all three are present simultaneously, the system needs isolation, not just prompt-level filtering.

## NeuroSync Applicability
Partially implemented. NeuroSync's `CommandSandbox` (`src/core/portgrid/sandbox.ts`) mitigates part of the trifecta for its ~20-command allowlisted execution path: it runs commands via `bwrap --unshare-net ...`, cutting outbound network access for allowlisted commands, and `PathValidator.validateContainment` (`src/core/coreexec/path-validator.ts`) confines file arguments to the project's base directory, limiting the "private data" surface an allowlisted command can reach. However the embedded interactive terminal (`src/core/portgrid/terminal-session.ts`) deliberately runs with open network access by explicit product decision (per its own doc comment: "a process inside this terminal now has UNRESTRICTED network access"); NeuroSync's ground rules keep AI actions draft-only rather than relying on execution-time containment to prevent AI-originated exfiltration in that terminal — the trifecta's "external reach" leg is only closed on the allowlisted path, not the interactive one.

## Tradeoffs / Risks
Closing off network access (as `CommandSandbox` does) breaks legitimate agent workflows that need outbound calls, such as installing packages or calling other CLI tools and APIs — NeuroSync's own `terminal-session.ts` documents choosing open network deliberately for exactly this reason, showing the trifecta's mitigations are in real tension with agent usefulness, not a free lunch.
