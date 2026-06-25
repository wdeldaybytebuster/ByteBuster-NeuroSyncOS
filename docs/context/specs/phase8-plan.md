# Implementation Plan: PortGrid Phase 8 — The Local OS Expansion

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Graduate NeuroSync into a full-featured Local AI Operating System with dynamic multi-threading, hardware-aware scaling, dual-track scheduling, a centralized OS To-Do Ledger, and point-in-time backup/restore portability.

**Architecture:** 
Transition from a synchronous, single-threaded executor to a dynamically scaled `worker_threads` pool managed by `poolifier`. Resolve SQLite WAL contention using a central Dedicated Write-Queue Worker. Implement dual-track background processes (cron-based CoreExec + idle-detecting ScoutDaemon using `Atomics.pause()`). Protect the user's legacy hardware with an explicitly exposed Governor UI slider tied to live `systeminformation` thermal sensors. Centralize agent roadblocks into a Global To-Do Ledger to eliminate alert fatigue. Add stream-based `.backup()` via Hono SSE.

**Tech Stack:** Node 22 `worker_threads`, `poolifier`, `systeminformation`, `node-cron`, `better-sqlite3`, Hono SSE, React Flow.

---

## Task List

### Phase 8A: Threading & SQLite Concurrency

#### Task 1: Initialize Poolifier & Worker Setup
**Description:** Install `poolifier` and set up the base dynamic worker pool class.
- [x] Install `poolifier` (`npm install poolifier`).
- [x] Create `src/core/coreexec/worker-pool.ts` exporting a `DynamicThreadPool` initialized with `os.cpus().length - 1` max workers.
- [x] Verify pool initializes without crashing the Hono server.

#### Task 2: Dedicated Write-Queue Worker
**Description:** Build the dedicated central writer to prevent `SQLITE_BUSY` errors across multiple V8 isolates.
- [x] Create `src/core/basevault/write-queue.ts`.
- [x] Implement a singleton message-passing queue that accepts SQL payloads via `parentPort.postMessage()` and executes them sequentially.
- [x] Update `initDB()` in `src/core/basevault/db.ts` to route all mutations through this queue if running in a worker context.

#### Task 3: Migrate CoreExec Execution
**Description:** Refactor the existing DAG execution loop to dispatch tasks to the worker pool.
- [x] Modify `src/core/coreexec/engine.ts`. Instead of running tasks sequentially in the main thread, dispatch each `dag_node` execution to the `worker-pool.ts`.
- [x] Ensure the main event loop is never blocked during execution.

### Phase 8B: Hardware Governors & UI Dials

#### Task 4: System Telemetry SSE Route
**Description:** Poll live hardware data and stream to the UI.
- [x] Install `systeminformation`.
- [x] Create `src/server/routes/system.ts`.
- [x] Implement an SSE endpoint (`/api/system/metrics`) that polls `systeminformation.cpuTemperature()` and `os.cpus()` every 3 seconds.

#### Task 5: The Governor UI Slider
**Description:** Build the Autonomy Dial component.
- [x] Create `src/ui/components/GovernorUI.tsx`.
- [x] Render a slider from 1 to `os.cpus().length`.
- [x] Fetch the SSE telemetry to display live CPU temperature and utilization.

#### Task 6: Intent Preview & Thermal Warnings
**Description:** Enforce hardware safety limits on the slider.
- [x] Add logic in `GovernorUI.tsx` to detect if the slider exceeds the "safe" threshold (`cores - 1`).
- [x] If exceeded, trigger a visual "Intent Preview" modal warning about Wayland freezing and thermal throttling.
- [x] Wire the slider output to a `/api/system/config` endpoint to dynamically update the `poolifier` max-worker limit in real-time.

### Phase 8C: Background Scheduling & ScoutDaemon

#### Task 7: Track A — CoreExec Scheduling
**Description:** Empower users to schedule recurring DAGs.
- [x] Install `node-cron`.
- [x] Add a `cron_schedule` column to the `workflows` table.
- [x] Create `src/core/coreexec/scheduler.ts` that polls the DB and injects scheduled DAGs into the execution queue.

#### Task 8: Track B — ScoutDaemon Idle Detection
**Description:** Build the intelligent background research daemon.
- [x] Build a simple UI inactivity ping (e.g., frontend sends a heartbeat to `/api/scout/heartbeat` while active).
- [x] Create `src/core/scoutdaemon/idle.ts`. Expose an `IdleDetector` class.
- [x] When `IdleDetector` fires an "idle" event (e.g., no heartbeat for 10 minutes), have it trigger a preset "Knowledge Graph Pruning" or "Documentation Linting" workflow automatically, acting as a real-time autonomous local agent.

#### Task 9: Micro-Waits & Foreground Evasion
**Description:** Ensure ScoutDaemon instantly yields to the user.
- [x] Update `idle-detector.ts` to monitor for thermal spikes (>85C) or CPU jumps (>60%).
- [x] If detected, trigger an `AbortController` signal to flush draft state to the Write-Queue and execute `Atomics.pause()` to spinlock the thread and save battery. (Implemented via zero-worker capping).

### Phase 8D: Global To-Do Ledger

#### Task 10: os_todos Schema Migration
**Description:** Create the relational ledger.
- [x] Write a migration in `db.ts` to create the `os_todos` table (`id, dag_node_id, severity, escalation_reason, required_action_type, status`).

#### Task 11: Agentic Escalation Parking
**Description:** Catch DAG failures gracefully.
- [x] Modify `engine.ts` error handling.
- [x] When an LLM RouteSwitch adapter fails after `max_retries` (e.g., KuzuDB corruption, complex API conflict), write an `os_todos` record rather than crashing the DAG.
- [x] The `tasks` row status changes to `parked`.

#### Task 12: Notification Center UI
**Description:** Build the global resolution dashboard.
- [x] Create `src/ui/components/NotificationCenter.tsx`.
- [x] Aggregate all `UNRESOLVED` rows from `os_todos`. Render dynamic inputs based on `required_action_type` (e.g. 2FA text box, File upload, Approve boolean).
- [x] Wire the submit button to a `/api/todos/resolve` endpoint that updates the database and requeues the node.

### Phase 8E: Backup, Restore & Portability

#### Task 13: Live Streaming Backup
**Description:** Implement `better-sqlite3` `.backup()` without freezing the UI.
- [x] Create `/api/system/backup` in `system.ts`.
- [x] Spawn an async operation calling `db.backup()`.
- [x] Pipe the progress callback integers into Hono's `streamSSE()` to the frontend.

#### Task 14: System Restore
**Description:** Implement full OS overwrite.
- [x] Create `/api/system/restore` accepting a `.db` file upload.
- [x] Gracefully drain the poolifier workers, close the SQLite connection, overwrite the file via `fs`, and trigger a `process.exit(0)` to let the process manager restart the Node server.

#### Task 15: Portability UI
**Description:** Add Backup/Restore controls.
- [x] Add a "Sovereign State Portability" tab to `SettingsModal.tsx`.
- [x] Add the streaming progress bar for backups and the file uploader for restores.

### Phase 8F: The Multi-Dashboard Architecture

#### Task 16: Dashboard Navigation Skeleton
**Description:** Implement the core routing for the 4 distinct OS dashboards.
- [x] Create `src/ui/layouts/OSLayout.tsx` with a sidebar containing navigation links.
- [x] Set up React Router (or custom view state) to switch between: Master Dashboard, CoreExec, RouteSwitch, and Cerebro/BaseVault.

#### Task 17: CoreExec & RouteSwitch Dashboards
**Description:** Build the dedicated views for workers and LLMs.
- [x] Build `src/ui/views/CoreExecDashboard.tsx` to manage Workspaces, Projects, and view live `poolifier` worker metrics.
- [x] Build `src/ui/views/RouteSwitchDashboard.tsx` to manage LLM API keys, token cost metrics, and provider health checks (FreeLLMAPI vs Local).

#### Task 18: Cerebro & Learning Approvals Dashboard
**Description:** Build the interface for memory curation.
- [x] Build `src/ui/views/CerebroDashboard.tsx`.
- [x] Implement the "Learning Approvals Queue" interface where low-confidence AI inferences are staged for user review before being committed to vector memory.
- [x] Implement a basic SQLite table visualizer for the `BaseVault`.

#### Task 19: Unified Master Dashboard
**Description:** The at-a-glance home screen.
- [x] Build `src/ui/views/UnifiedMasterDashboard.tsx`.
- [x] Aggregate key widgets: Active/Idle Agent Count, Scheduled Cron Jobs, and the Notification Center built in Task 12.

---
## Verification Checkpoints

**Checkpoint 1 (Tasks 1-3):** Worker pool successfully executes simple DAGs without SQLite lock collisions.
**Checkpoint 2 (Tasks 4-6):** Governor UI successfully reads telemetry and dynamically restricts pool size.
**Checkpoint 3 (Tasks 7-9):** ScoutDaemon safely suspends itself when a heavy foreground process is simulated.
**Checkpoint 4 (Tasks 10-12):** A simulated auth error parks a worker, creates an `os_todos` notification, and successfully resumes upon user input.
**Checkpoint 5 (Tasks 13-15):** A live multi-megabyte backup streams progress to the UI without dropping HTTP frames.
**Checkpoint 6 (Tasks 16-19):** UI successfully toggles between 4 dashboards, hiding system services from the canvas, and displaying the Unified Master widgets.

## Implementation Log Rollup (2026-06-26)

**Timestamp:** 2026-06-25T14:39:00-06:00
**Checkpoint:** Phase 8A Complete
- Installed `poolifier` and set up `worker-pool.ts` using native `worker_threads` to dynamically scale up to `cores - 1`.
- Verified `workerOptions.execArgv = ['--import', 'tsx']` to allow `poolifier` to execute `.ts` files cleanly.
- Implemented `write-queue.ts` as a main-thread singleton to process SQL safely.
- Refactored `engine.ts` execution loop to `await workerPool.execute({ taskId })` while routing DB state updates directly through the main thread, thus inherently preventing SQLite WAL collision from the V8 isolates.
- Verified test suite passes sequentially via `vitest run` on `engine.test.ts`.

**Timestamp:** 2026-06-25T14:41:00-06:00
**Checkpoint:** Phase 8B Complete
- Installed `systeminformation`.
- Created `src/server/routes/system.ts` serving `/api/system/metrics` SSE stream (polling `os.cpus` load and `cpuTemperature`) and `/api/system/config` mutator.
- Engineered `GovernorUI.tsx` to subscribe to the hardware telemetry and present a real-time slider limiting worker throughput.
- Wired Intent Preview logic directly into the UI state so any core allocation beyond `cores - 1` triggers a thermal Wayland UI freeze warning.
- Updated `engine.ts` throttle logic (`availableSlots`) to dynamically obey `systemConfig.maxWorkers` in real-time.

**Timestamp:** 2026-06-25T14:43:00-06:00
**Checkpoint:** Phase 8C Complete
- Installed `node-cron`.
- Added `workflows` table to schema in `db.ts`.
- Built `src/core/coreexec/scheduler.ts` to hydrate and trigger crons.
- Created `src/core/scoutdaemon/idle.ts` containing the `IdleDetector`.
- Integrated heartbeat routes to reset idle status.
- Implemented Micro-Waits & Foreground Evasion: The daemon directly polls hardware via `systeminformation` and yields resources (`maxWorkers = 0`) during thermal spikes (>85C).

**Timestamp:** 2026-06-25T14:45:00-06:00
**Checkpoint:** Phase 8D (Tasks 10 & 11) Complete
- Altered schema in `db.ts` to include the `os_todos` ledger table.
- Upgraded `engine.ts` error handler to catch LLM / adapter exceptions and serialize them into `os_todos` parking tickets rather than crashing the DAG state entirely.
- Modified DAG layout execution verification to gracefully suspend when encountering `parked` tasks, allowing Human-in-the-Loop review.
- Built `NotificationCenter.tsx` that provides dynamic inputs for user verification (2FA, uploads, approval booleans).
- Created backend `/api/todos/resolve` route which applies user resolution data into the `tasks.output_data`, clears the `os_todos` parking ticket, and pushes the DAG back into execution seamlessly.

**Timestamp:** 2026-06-25T14:48:00-06:00
**Checkpoint:** Phase 8E Complete
- Created `/api/system/backup` utilizing `better-sqlite3`'s native `.backup()` and streaming progress chunks to the client via SSE.
- Implemented `/api/system/restore` endpoint to handle `.db` file uploads. It orchestrates a clean shutdown of the `poolifier` queue, disconnects SQLite, overwrites the vault natively, and initiates a graceful Node `process.exit(0)` to let the host process manager reboot the system safely.
- Refactored `SettingsModal.tsx` into a tabbed interface and injected the "Sovereign Portability" UI controls, providing the user with direct access to physical data ownership.

**Timestamp:** 2026-06-25T14:50:00-06:00
**Checkpoint:** Phase 8F Complete
- Established a unified React view-state router in `OSLayout.tsx`, featuring a persistent side navigation drawer.
- Built `UnifiedMasterDashboard.tsx` to act as the home screen, aggregating the `NotificationCenter`, `GovernorUI`, and `RunHistory` components into a single command center.
- Created `CoreExecDashboard.tsx` as the dedicated space for Workspaces, Projects, and Live Worker Pool metrics.
- Created `RouteSwitchDashboard.tsx` to display LLM Fleet Health and Token Cost analytics.
- Built `CerebroDashboard.tsx` to host the `ApprovalCockpit` for manual Learning Queue approvals and BaseVault SQLite inspection.
- Wired the legacy DAG Canvas (`App.tsx`) seamlessly into the `CoreExecDashboard` tab, allowing it to function completely isolated from system configuration panels.


## Implementation Log Rollup (2026-06-26)

# Phase 8 Expansion Analysis

Tab 1

Phase 8 Expansion Analysis: The Local OS Implementation Strategy

Purpose: Strategic architectural roadmap detailing how NeuroSync Sovereign OS will expand from an MVP workflow runner into a full-featured, multi-tasking Local AI Operating System.

1. The "Full Local OS" Vision

Phase 8 graduates NeuroSync from a single-track tool into a holistic operating system. The goal is to safely utilize the maximum capabilities of the user's host machine to run multiple flows, schedule user-defined agents over time, and continuously map the external AI landscape—all while maintaining the "Grit, Not Grime" philosophy of zero cloud infrastructure.

2. Proposed Implementation: Device Discovery & Dynamic Threading

To support multiple active flows without crashing the Next.js UI or the Hono event loop, CoreExec must evolve from a synchronous queue to a dynamically pooled architecture.

The "How-To" Mechanics:

Hardware Profiling: On boot, the os module records os.cpus().length and os.freemem().

Thread Pooling: We will integrate a robust worker pool (e.g., poolifier or native worker_threads).

The Formula: The system establishes a safe_max_threads integer (typically Total Cores - 1 to leave a core for the OS/UI).

Transaction Safety: Because better-sqlite3 is synchronous, worker threads cannot share the exact same database connection object. Each worker thread must instantiate its own SQLite connection. Write contention is natively handled by SQLite's WAL mode and BEGIN IMMEDIATE locks; if a worker hits a SQLITE_BUSY error, it implements an exponential backoff retry.

3. Proposed Implementation: User Empowerment & Autonomy Dials

The system sets safe defaults, but the user is the sovereign owner of their hardware. We will not enforce artificial software locks that prevent users from pushing their machines.

The "How-To" Mechanics:

The Governor UI: PortGrid will introduce an "Engine Tuning" slider. It defaults to the safe_max_threads calculated above.

The Overdrive Warning: If the user drags the slider into the "Red Zone" (e.g., demanding 8 parallel workflow threads on a 4-core machine), a stark modal interrupts: "Warning: Overriding safe hardware limits will cause severe thermal throttling, system freezing, and high battery drain. NeuroSync will attempt to recover if the Node process is killed by the OS. Proceed at your own risk."

Dynamic Update: Modifying this setting dynamically updates the poolifier max-worker limit in real-time.

4. Proposed Implementation: Dual-Track Autonomous Scheduling

Background operations in a true Local OS serve two distinct purposes: executing the user's personal workflows on a timetable, and continuously researching the external environment. Phase 8 strictly separates these concerns.

## Track A: CoreExec Flow Scheduling (User-Defined Routines)

The Goal: Empower the user to manage the timing and execution of the various custom agents and DAGs they have designed (e.g., tracking to-dos, executing daily data processing, or running multi-agent workflows at specific intervals).

The "How-To" Mechanics: 1. We will integrate a lightweight scheduling layer (like node-cron) directly into CoreExec.2. When a schedule triggers, it does not bypass the system; it injects the DAG into the CoreExec queue.3. The execution is strictly governed by the dynamic thread pool from Section 2. If the user's hardware is tapped out, the scheduled flow waits safely in the SQLite queue until a thread frees up.

## Track B: ScoutDaemon (The Research & Discovery Vanguard)

The Goal: ScoutDaemon is not a general workflow runner. It is a specialized, headless system process dedicated exclusively to research and self-discovery. It monitors the external AI landscape (new models, API changes, emerging OS techniques) to gather the intelligence needed to dynamically ground and adjust the OS (e.g., automatically updating routing fallback tables).

The "How-To" Mechanics:

Idle-Detection: ScoutDaemon operates strictly as a "respectful guest." Before executing a heavy web-scraping task or pulling down API docs, it reads os.loadavg(). If the 1-minute load average is high (meaning the user is running their own heavy CoreExec flows), the daemon skips its cycle and sleeps.

Passive Ingestion: Instead of active, high-frequency polling that drains battery life, ScoutDaemon will prioritize WebSocket connections or Server-Sent Events (SSE) for data feeds, waking only when external developments occur.

5. Proposed Implementation: Global To-Do Ledger

We must prevent "AI Brain Fry" (alert fatigue) when running multiple flows. If three agents hit roadblocks simultaneously, they shouldn't spawn three separate modal popups.

The "How-To" Mechanics:

Schema Expansion: Introduce an os_todos table in BaseVault (id, project_id, workflow_id, task_id, status, human_prompt, required_action_type).

The Escalation Flow: If a scheduled CoreExec agent receives an auth error, or hits a confidence threshold below 70%, it pauses its DAG branch and writes an Action Required row to the ledger.

Unified Cockpit: PortGrid aggregates this ledger into a single "Notification Center." The user can review all blocked workflows globally, provide the necessary input (e.g., pasting a 2FA code), and click "Resume," which unpauses the CoreExec worker.

6. Proposed Implementation: Backup, Restore & Portability

A true OS must protect its state and allow the user to easily migrate to new hardware.

The "How-To" Mechanics (Phase 8 - All or Nothing):

Backup: A simple HTTP endpoint triggers the native better-sqlite3 .backup() function. This safely streams a point-in-time snapshot of the active WAL database to a .db download file without blocking active writes.

Restore: A "Restore System" endpoint accepts a .db upload. The system must elegantly drain the CoreExec queue, close all active SQLite connections, overwrite the file on the filesystem, and reboot the Node server.

Future Horizon (Phase 9+): As researched via the Competitor Prompt, we will eventually evaluate integrating cr-sqlite to turn our flat database into a CRDT (Conflict-Free Replicated Data Type), allowing users to seamlessly sync their workflows between their laptop and desktop via a local network, bypassing cloud storage entirely.

