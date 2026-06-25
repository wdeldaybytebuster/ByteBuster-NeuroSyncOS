---
title: "Architecture Blueprint"
status: draft
owner: "williamdeldaymarketing"
last_updated: "2026-06-25"
review_cadence: "weekly"
source_of_truth: true
---

# Architecture Blueprint

## System Overview

NeuroSync Sovereign OS is designed around a single-repository, single-process architectural layout to prevent dependency bloat and microservice drift. It runs entirely on the operator's local machine, utilizing pure Node.js 22 LTS for backend services, Hono for API routing, and SQLite in WAL mode for transactional persistence. Any Rust, Tauri, or alternative runtime (e.g. Node v24.16.0) is strictly prohibited in Phase 1 and relegated to a future V2 phase.

## Architectural Subsystems

1. **PortGrid UI:** Cockpit dashboard built with Next.js/React and `@xyflow/react` for visual DAG editing and human approval gates.
2. **CoreExec Engine:** Asynchronous, durable task executor managing workflow state transitions and retries using `BEGIN IMMEDIATE` SQLite transaction locks.
3. **BaseVault Storage:** SQLite database management, handling schema migrations, data persistence, and automatic JSON logging redactions. If/when `sqlite-vec` or heavy semantic vector searches are introduced, they MUST be offloaded to a Node.js Worker Thread to prevent blocking the main HTTP routing and control-plane event loop.
4. **RouteSwitch Router:** Multi-provider LLM routing policy engine managing fallback cascades and enforcing the Free Mode Governor.
5. **Search Context / Memory:** Local key-value and index retrieval module for project-scoped memory nodes.
