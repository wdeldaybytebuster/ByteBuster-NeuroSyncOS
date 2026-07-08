---
type: concept
title: Glass Sandbox — Why Language-Level Isolation Fails in Reflective Runtimes
description: AST filters, blocklists, and in-process WASM runtimes provide an illusion of security in highly reflective languages like Python, and have been repeatedly bypassed via magic-method and object-graph traversal escapes.
confidence: 0.95
tags: [glass-sandbox, python-security, sandbox-escape, code-execution, cve]
category: safety-reliability
source_doc: principles-and-architecture-of-secure-execution-environments-for-untrusted,-ai-g.md
---

# Glass Sandbox — Why Language-Level Isolation Fails in Reflective Runtimes

## Core Idea
Attempting to secure code execution using AST analysis, blocklists, or overridden built-ins inside a highly reflective, dynamic language like Python produces a "glass sandbox" — an illusion of security that fails against deliberate escape attempts, because every runtime object inherits from a common base (`object`) and an attacker can traverse that interconnected object graph to rebuild restricted capabilities the blocklist tried to remove. Concretely, Python's string serialization (via `__str__`/`__format__` magic methods, triggered automatically on exceptions) is an active execution step, not passive formatting — CVE-2026-0863 (n8n's python-task-executor) let an attacker craft a custom object with a malicious `__str__` that executed arbitrary code during exception formatting, a phase that occurred outside the sandbox's attribute blocklist checks. In-process WebAssembly runtimes (Pyodide) aren't safe either: CVE-2025-68668 bypassed Pyodide's WASM boundary, and because the runner shared process memory with the parent Node.js application, the escape granted direct access to database credentials and master encryption keys held in that process's memory.

## When To Use
Treat this as a hard architectural constraint whenever evaluating "sandboxing" that runs untrusted code inside the same process or interpreter as the host application — any custom AST filter, blocklist, or in-process WASM runtime for a reflective language should never be trusted as the sole security boundary for AI-generated code.

## NeuroSync Applicability
Already implemented (avoids this failure mode by design). NeuroSync does not rely on language-level sandboxing of Python or JavaScript — `CommandSandbox` (`src/core/portgrid/sandbox.ts`) enforces isolation via an OS-level allowlist of root commands plus `bwrap` process/namespace isolation (not AST rewriting or built-in overriding), and the interactive terminal (`src/core/portgrid/terminal-session.ts`) likewise uses a hardened `bwrap` invocation (ro-bind of `/usr`+`/etc`, single read-write bind of the project directory, fresh `/proc`/`/dev`/`/tmp`, `--clearenv`) rather than any in-process interpreter-level restriction — consistent with this source's core recommendation that isolation must be enforced at the infrastructure level, not inside the application process.

## Tradeoffs / Risks
`bwrap`-based process isolation, while far stronger than a glass sandbox, is still weaker than true microVM/kernel-boundary isolation. `CommandSandbox`'s `--dev-bind / /` for allowlisted commands binds the entire host filesystem read-write into the sandboxed process, so its real security relies on the command allowlist and `PathValidator` rather than filesystem containment for that particular code path — the terminal path is the one with genuine filesystem confinement, per its own documentation.
