# NeuroSync Sovereign OS: Expansion & Dashboard Blueprints

This document captures architectural feedback, UX improvements, and ideas for expanding the NeuroSync OS Cockpit beyond Phase 7. It is designed to be ingested by NotebookLM for further research, refinement, and planning of Phase 8.

## 1. UI/UX Improvements (The PortGrid Canvas)

### 1.1 ScopeLogic Auto-Minimization
- **Current State:** The ScopeLogic chat interface remains open on the left sidebar even after an interview completes and a DAG is proposed.
- **Proposed Change:** Once the `isComplete` flag is true and the DAG is injected into the canvas, the ScopeLogic panel should automatically slide out or minimize to a small icon to maximize visual space for the DAG flow.

### 1.2 System Service Node Hiding
- **Current State:** Core system services (`ScopeLogic`, `BaseVault`, `RouteSwitch`) are sometimes interpreted by the LLM as steps in the workflow and rendered as boxes on the grid.
- **Proposed Change:** These are foundational engines, not execution tasks. The frontend DAG renderer (or the `dag.gbnf` grammar) must be updated to strictly forbid these services from appearing as workflow nodes.

### 1.3 Interactive Run History
- **Current State:** Runs appear in the Right Sidebar history, but they are static text/status indicators.
- **Proposed Change:** Clicking a past run should:
  - Re-hydrate the central PortGrid canvas with that specific DAG layout.
  - Show the stdout/stderr, execution time, and output payloads of each individual node.
  - Provide a "Retry Failed Nodes" or "Edit & Re-run" button to allow workflow adjustment without starting a new session.

## 2. Execution Engine Corrections

### 2.1 Native Sandbox Execution Wiring
- **Current State:** While the `CommandSandbox` and `StealthScraper` were built in Phase 6, the `src/server/index.ts` API route (`/api/coreexec/approve`) is still using a mock `setTimeout` resolver for `processTask` rather than dynamically mapping the DAG nodes to actual Sandbox/Scraper execution calls.
- **Proposed Change:** Wire the `executeRun` engine directly into the LLM/Sandbox so that when a user says "Output to X directory", the node physically executes the bash command to write to that directory using `CommandSandbox.execute()`.

## 3. The Dedicated Dashboard Architecture

Instead of viewing system services as nodes on a grid, NeuroSync will evolve into a multi-dashboard OS. 

### 3.1 Unified Master Dashboard (At-a-Glance)
- **Purpose:** The home screen of the OS.
- **Metrics/Widgets:**
  - Active/Idle Agent Count.
  - Currently scheduled background workflows (Cron jobs).
  - **Action Center:** Items requiring Executive Approval (e.g., High-Risk Sensory Attenuation prompts).
  - **Cerebro Health:** Memory confidence scores, total vectors stored, and Habituation decay stats.

### 3.2 CoreExec Dashboard (The Engine Room)
- **Purpose:** Managing active execution pipelines, worker agents, and workspace organization.
- **Features:**
  - **Workspace & Project Management:** Setup, create, and manage isolated Workspaces and Projects.
  - Active subagent monitoring (RAM/CPU usage per worker).
  - Workflow scheduling (Cron/Interval triggers).
  - Deep-dive execution history (Logs, DAG replays, diffs).

### 3.3 RouteSwitch Dashboard (The Synapse Router)
- **Purpose:** Managing LLM API connections and context routing.
- **Features:**
  - Provider health checks (FreeLLMAPI vs Local Llama.cpp latency).
  - Cost analysis and token counting per provider.
  - Dynamic switching rules (e.g., "If Local is busy, route to FreeLLMAPI").

### 3.4 BaseVault & Cerebro Dashboard (The Hippocampus & Learning Center)
- **Purpose:** Managing structured databases, vector embeddings, and the system's active learning.
- **Features:**
  - **Learning Approvals Interface:** A dedicated space to review new system inferences and low-confidence learnings. Instead of overwhelming the user during live execution, the system queues newly extracted "facts" here so you can carefully review, adjust, or approve what Cerebro permanently commits to long-term vector memory.
  - Visualizing the SQLite tables.
  - "Memory Browser": Searching through vectorized preferences and facts.
  - Controls to manually prune "forgotten" memories based on the biological decay algorithms.
