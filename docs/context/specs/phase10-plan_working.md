# Full Gap Analysis & Phase 10 Plan

After cross-referencing the architecture blueprints against the current codebase (`src/ui` and `src/core` and `src/server/routes`), there is a significant disparity between the theoretical domain definitions (e.g. Project isolation, Settings persistence) and what is physically implemented.

Here is the exhaustive mapping of missing logic, broken down by subsystem.

---

## 1. Missing Settings & Configuration Logic

### 1.1 Autonomy Dials Persistence
**The Gap:** In Phase 9, we built the `AutonomyDials.tsx` component to control the "Budget & Rigour" and "Autonomy & Delegation" settings. However, this component only uses local React `useState`.
**Missing Logic:**
- **Database:** There is no `system_settings` table in `BaseVault` (`src/core/basevault/db.ts`) to persist these values.
- **Backend:** There is no `POST /api/system/settings` route to write the changes.
- **Engine integration:** `CoreExec` is not actually reading these dial values when it launches a task; it's using hardcoded or `.env` defaults.

### 1.2 Global LLM / Provider Keys
**The Gap:** The engine relies on LLMs, but there is no native UI to input API keys.
**Missing Logic:**
- **UI:** The `SettingsModal.tsx` does not have a "Providers" tab to let the user add an Anthropic or OpenAI key.
- **Database:** Keys must be stored securely (perhaps encrypted) in the database rather than exclusively relying on `.env` file manual edits, which breaks the "OS" paradigm.

---

## 2. Missing Project & Workspace Logic

### 2.1 Project Setup & CRUD
**The Gap:** `BaseVault` has `projects`, `workflows`, and `workflow_runs` tables. However, you cannot actually create a project.
**Missing Logic:**
- **UI:** There is no `ProjectDashboard` or "Create New Project" modal in the UI.
- **Backend:** There is no `projects.ts` router. `POST /api/projects` and `GET /api/projects` do not exist. Right now, any workflow run must be attaching to a mock or hardcoded `project_id`.

### 2.2 Workspace Directory Mapping
**The Gap:** `MemorySweepScheduler` cleans up `.data/workspaces/{id}`, but what assigns a workspace to a project?
**Missing Logic:**
- A physical Project needs an isolated directory on the filesystem (e.g., `~/Projects/NeuroSync_Workspace1`).
- The `projects` SQLite table lacks a `workspace_path` column.
- When a Project is created in the UI, the backend must use `fs.mkdirSync` to provision its sandbox directory and store that path in the DB so that `CoreExec` knows *where* to mount the `CommandSandbox`.

---

## 3. Missing Workflow/DAG Logic

### 3.1 Template vs Instance Mapping
**The Gap:** We have DAG execution (`engine.ts`), but how do we link a DAG to a Project?
**Missing Logic:**
- A "Workflow Template" builder UI is missing. Currently, DAG JSONs are generated dynamically via ScopeLogic, but there's no UI to save a generated DAG as a reusable "Workflow Template" inside a Project.
- The `workflows` table exists, but there are no backend routes to interact with it.

---

## Phase 10 Implementation Plan (The "Glue" Phase)

To rectify these gaps and make NeuroSync a fully connected, usable application, we must execute the following Vertical Slices.

### Task 1: System Settings Persistence (BaseVault)
- [x] **Database:** Update `src/core/basevault/db.ts` to add a `system_settings` table (key-value pair).
- [x] **Backend:** Create `GET/POST /api/system/settings` in `system.ts`.
- [x] **UI:** Wire `AutonomyDials.tsx` to read/write to the API on mount and on slider release (debounced).

### Task 2: Project & Workspace Provisioning (Local-First Design)
- [x] **Database:** Add `workspace_path` to the `projects` table.
- [x] **Backend:** Create `src/server/routes/projects.ts`. When `POST /` is hit, it must create the database row AND create the physical folder inside `.data/workspaces/`.
- [x] **UI:** Create `src/ui/components/ProjectManager.tsx` and integrate it into the `UnifiedMasterDashboard` so users can create, view, and select active projects.
- [x] **Research Insight:** To align with robust **Local-First Architecture** best practices, the UI must be "optimistic". When a project is created, the UI updates instantly without waiting for a server round-trip. The physical directories act as the authoritative sandbox, while SQLite maintains the relational index.

### Task 3: Sandbox Workspace Binding
- [x] **Engine:** Refactor `src/core/coreexec/sandbox.ts` so that it no longer uses a hardcoded base directory, but dynamically mounts into the `workspace_path` associated with the current `project_id` passed into the workflow run.

### Task 4: Secure Provider Key Management (Legacy/Crostini Optimized)
- [x] **UI:** Add an "LLM Providers" tab to `SettingsModal.tsx` for entering API keys.
- [x] **Backend/Engine:** Refactor `src/core/routeswitch/adapters/openai-compatible.ts` to fetch the key dynamically from the `system_settings` table if it is not found in `process.env`.
- [x] **Research Insight (Security):** Because NeuroSync runs in a resource-constrained Chromebook Linux container (Crostini), relying on OS-level credential managers (like `keytar` interacting with DBus/Secret-Service) is notoriously flaky and prone to crashing. Instead, we will implement **AES-GCM Node.js cryptography**.
   - [x] When the user first sets a key, a local `.master.key` file will be generated in the secure `.data` directory.
   - [x] The API keys will be encrypted via `AES-GCM` before insertion into the `system_settings` SQLite table, ensuring that even if the `neurosync.db` file is compromised, the API keys remain completely unreadable without the companion `.master.key` file.

## Checkpoint Log

| Date | Round | Tasks | Description | Files Verified |
|------|-------|-------|-------------|----------------|
| 2026-06-25 | Implementation | Tasks 1–4 | Phase 10 "Glue" layer fully implemented. `db.ts` updated with `system_settings` table. `system.ts` exposes `GET/POST /api/system/settings`. `AutonomyDials.tsx` wired to API (debounced). `projects.ts` creates DB row + physical folder. `ProjectManager.tsx` built with optimistic UI. `sandbox.ts` refactored to read `workspace_path` from DB. `crypto.ts` implements AES-256-GCM key derivation + IV:AuthTag:Ciphertext storage format. | `src/core/basevault/crypto.ts` ✅ `src/server/routes/projects.ts` ✅ `src/ui/components/ProjectManager.tsx` ✅ `src/core/coreexec/sandbox.ts` ✅ |
| 2026-06-25 | E2E Round 1 | Task 2 & 3 | `scripts/e2e-test.ts` verified that `POST /api/projects` correctly provisions a physical folder on disk. Also proved that `CommandSandbox` properly catches SA-02 directory traversal attempts (e.g. `/non_existent_folder`) out of bounds, and correctly routes the extracted error back to `output_data` for the Test-Fix-Retest Rationale loop. | `src/core/coreexec/path-validator.ts` ✅ |
| 2026-06-25 | E2E Round 2 | Task 4 | `scripts/crypto-test.ts` verified that API keys are strictly encrypted as `IV:AuthTag:Ciphertext` in the SQLite `system_settings` table, successfully decrypted by BaseVault natively, and completely masked (`sk-...****`) when accessed via the `/api/system/settings` endpoint. | `src/core/basevault/crypto.ts` ✅ |
| 2026-06-25 | E2E Round 3 | Task 3 | `scripts/dag-test.ts` verified that the `CoreExec` execution engine accurately resolves multi-node dependencies (Node C waiting for A and B) and dispatches them efficiently to the thread pool for sandbox execution without deadlock. | `src/core/coreexec/sandbox.ts` ✅ |
| 2026-06-25 | ALL | All | **Phase 10 100% COMPLETE.** Settings persistence, AES-256-GCM cryptography, optimistic UI project provisioning, and strictly isolated command sandbox mapping are all live. | All files ✅ |

---
*Last audited: 2026-06-25 by Documentation Auditor Subagent*
