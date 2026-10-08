# NeuroSync Sovereign OS (ByteBuster Agent v1.0) - Knowledge Base
*Prepared for NotebookLM Ingestion*

**Date Generated:** October 1, 2026
**Project Identity:** NeuroSync Sovereign OS
**Repository:** `wdeldaybytebuster/ByteBuster-NeuroSyncOS`

---

## 1. Executive Summary & Philosophy
NeuroSync Sovereign OS is a local-first, privacy-first AI project orchestrator. It is designed to schedule background agents, route requests across local and free-tier LLM providers, and maintain all state securely in a local SQLite database.

**Core Philosophies:**
- **Sovereign Control:** All data, memories, and task orchestration states live strictly locally.
- **Zero-Budget / Free Mode:** The system is heavily optimized to run on free-tier LLM providers (e.g., OpenCode Zen) by utilizing advanced token forecasting, dynamic fallback routing, and reasoning-exhaustion recovery.
- **Defense-in-Depth Security:** Employs strict Category A safety boundaries, P0 command sandboxing, and real-time PII/API key redaction before any data hits the database.
- **Resource Constraints:** Specifically tailored to run flawlessly on resource-constrained hardware (e.g., Lenovo IdeaPad Slim 3 Chromebook, i3-N305, ~6.4 GB RAM, zero swap) through aggressive memory management and sequential task execution.

---

## 2. Technology Stack
### Backend
- **Runtime:** Node.js 22 LTS (run with `--max-old-space-size=1024` for aggressive V8 garbage collection).
- **API Framework:** Hono (`@hono/node-server`, `@hono/node-ws`).
- **Database:** SQLite (Better-SQLite3) in WAL mode for concurrent reads/writes, augmented with `sqlite-vec` for vector embeddings.
- **Process Isolation:** `node-pty` combined with `bwrap` (Bubblewrap) for secure, read-only terminal execution sandboxes.

### Frontend
- **Framework:** React 19 + TypeScript, bundled with Vite.
- **Styling:** TailwindCSS with a dark obsidian (`#0A0A0A`), system blue (`#4A90E2`), and secure green (`#27AE60`) aesthetic.
- **Interactive UI Components:** `@xyflow/react` for complex Directed Acyclic Graph (DAG) rendering, `@xterm/xterm` for live secure terminal feeds.

### Infrastructure & Operations
- **Concurrency:** Uses Node.js `worker_threads` for background memory consolidation.
- **Code Intelligence:** GitNexus (LadybugDB/KuzuDB local knowledge graph) for zero-server architectural mapping.
- **Testing:** Vitest (1161 tests, 100% passing).

---

## 3. The 6 Core Modules (System Architecture)
The orchestrator is divided into six deeply integrated pillars:

### 1. CoreExec (Orchestration)
- **Role:** The brain of task execution.
- **Functionality:** Manages the Directed Acyclic Graph (DAG) state machine. Tasks are executed with mutual exclusion (claim leases) to prevent race conditions during crash recovery.

### 2. BaseVault (Storage)
- **Role:** Secure, local persistence.
- **Functionality:** Handles all SQLite database interactions. Includes the `SensitiveDataRedactor` which acts as a real-time ledger intercepting and hiding PII, passwords, and API keys before they can be persisted to disk.

### 3. Cerebro (Memory)
- **Role:** Long-term context and reflection.
- **Functionality:** Extracts "Knowledge Items" (KIs) using a background reflection loop (via `worker_threads`). It manages memory habituation and confidence scoring for extracted concepts.

### 4. RouteSwitch (LLM Gateway)
- **Role:** Model routing and cost management.
- **Functionality:** Implements the `FreeModeGovernor` which bypasses token limits when running in zero-budget mode. It handles dynamic router fallbacks and recovers gracefully from OpenCode Zen "no content" reasoning-exhaustion loops.

### 5. ScopeLogic (Security & Validation)
- **Role:** Boundary enforcement.
- **Functionality:** Enforces Category A bounds (SA-01 to SA-06), ensuring the orchestrator cannot take destructive actions without Human-in-the-Loop (HITL) approval. Implements Grammar-Constrained Decoding via JSON schemas.

### 6. ScoutDaemon (Agents) & PortGrid (Sandbox)
- **Role:** OS-level background execution and isolation.
- **Functionality:** ScoutDaemon manages the background worker pool (scraping, refactoring). PortGrid provides the `CommandSandbox`—enforcing a strict 20-command read-only allowlist (e.g., `ls`, `cat`, `grep`) and explicitly blocking `bwrap` bypasses like `--dev-bind / /`.

---

## 4. Current Setup & Status (As of Oct 2026)
- **System Stability:** STABLE. Phase 1 through Phase 4 implementations are complete.
- **Test Coverage:** Automated validation sweep confirms 155 test files and 1161 distinct tests are completely passing.
- **Schema Updates:** The `projects` table securely maps isolated workspaces via the newly implemented `project_root_path`.
- **UI & Brand Synchronization:** The entire UI state, including all 8 modular dashboards, color palettes, and logos, has been pushed and synced to the external Stitch MCP design system (Project ID: `7354998068237680463`).
- **Terminal Auto-Scan:** Features a change-aware terminal cooldown to prevent redundant LLM invocations when no filesystem signals have changed.

---

## 5. Master Specifications & Operating Rules
- **Resource Constraints (Critical):** The system enforces strict sequential execution for memory-heavy tasks (Vite builds, npm installs, Vitest runs) to prevent Wayland compositor lockups and OOM eviction on the target 6.4GB RAM host. Thread pool is capped (`UV_THREADPOOL_SIZE=3`).
- **Code Graphing:** The system forbids standard text-based string searching (`grep`) for architecture discovery. It mandates the use of GitNexus (`gitnexus_query`, `gitnexus_impact`) to compute blast-radius and trace structural call chains.
- **Safety First:** Any action generating a HIGH or CRITICAL risk score during GitNexus impact analysis instantly halts the execution DAG and escalates to `os_todos` for human resolution.

---

## 6. Future Plans & Next Sprint Backlog
1. **PortGrid UI - Phase 5:** Wire the newly stabilized backend `FreeModeGovernor` into the frontend. This involves activating the "Budget & Rigour" and "Autonomy & Delegation" interactive dials on the RouteSwitch dashboard.
2. **Stitch UI Redesign:** Leverage the finalized `DESIGN.md` in the Stitch project to begin planning and approving visual enhancements for the Unified Master Dashboard before committing React code.
3. **Advanced Auto-Fix:** Expand the ESLint/TypeScript automatic fix heuristics within ScoutDaemon to handle larger, cross-file refactoring bounds utilizing the interactive DAG canvas.
