# AGENTS.md — NeuroSync Sovereign OS — Project Operating Instructions

Read this file before planning, editing, generating, or refactoring code.

---

## Mandatory Context Read Order

1. `context/project-overview.md` — What has been built and what the system does.
2. `context/architecture.md` — **Most critical.** Module inventory, DB schema, server routes, UI components, invariants.
3. `context/ui-context.md` — UI component registry, CSS tokens, SSE integration.
4. `context/code-standards.md` — Naming, testing, API patterns, prohibited patterns.
5. `context/ai-workflow-rules.md` — Operating rules, GitNexus workflow, DAG execution rules.
6. `context/progress-tracker.md` — Current phase, open questions, completed work.
7. Active implementation spec under `context/specs/`

---

## Non-Negotiable Rules

- Do not write code until the active implementation unit has a spec.
- Do not modify unrelated files to make a task appear complete.
- Do not introduce a dependency unless the active spec explicitly permits it.
- Do not bypass security, ownership, auth, validation, or persistence rules.
- Do not infer product behavior when the docs are silent. Record the gap in `context/progress-tracker.md` under Open Questions.
- Do not rewrite architecture. Propose an ADR first.
- Keep changes small, reviewable, and aligned with one implementation unit.
- Do not run multiple memory-heavy terminal commands concurrently (sequential only).

---

## Critical Architecture Rules (Enforced — Do Not Violate)

1. **Human-in-the-Loop:** AI proposals are `status: 'draft'` only. Never auto-approve or self-execute a DAG.
2. **Single Validator Gate:** Both cron (`scheduler.ts`) and interactive (`/api/coreexec/approve`) paths MUST call `validateDAGTemplate()` / `validateDAGProposal()`. Inline coreexec handlers in `server/index.ts` are **explicitly forbidden** — they bypass the gate.
3. **Schema-as-Truth:** `WorkflowRunSchema` / `TaskSchema` in `src/core/basevault/schema.ts` own the status enums. Use `partitionBySchema<T>()` at all `/api/basevault/*` endpoints.
4. **Reserved Labels:** Never put `scopelogic`, `basevault`, `routeswitch`, `scoutdaemon`, `coreexec`, `portgrid`, `cerebro` in DAG node prompts. SA-07 violation.
5. **FK-Safe Escalation:** `escalateBlockedDAGToOsTodos()` must always run inside `db.transaction()`. Never write `os_todos` rows outside of it.
6. **ALLOWLIST:** Import from `sandbox.ts` (named export). Never duplicate.
7. **Encryption:** API keys must use `encrypt()` / `decrypt()` from `crypto.ts`. Never store plaintext in DB, logs, or HTTP responses.

---

## Active Module Registry

| Module | Primary Files | Entry Function |
| --- | --- | --- |
| **BaseVault** | `src/core/basevault/db.ts`, `schema.ts`, `crypto.ts` | `initDB()`, `partitionBySchema<T>()` |
| **CoreExec** | `src/core/coreexec/engine.ts`, `validateDAG.ts`, `scheduler.ts` | `executeRun()`, `validateDAGProposal()`, `initScheduler()` |
| **RouteSwitch** | `src/core/routeswitch/engine.ts`, `governor.ts`, `council.ts` | `RouteSwitchEngine.execute()`, `FreeModeGovernor` |
| **ScopeLogic** | `src/core/scopelogic/interview.ts`, `validator.ts` | `ScopeLogicSession`, `ValidatorLogic.validate()` |
| **ScoutDaemon** | `src/core/scoutdaemon/sse.ts`, `idle.ts` | `scoutEmitter`, `scoutRouter`, `idleDetector` |
| **ScoutLogic** | `src/core/scoutlogic/benchmarker.ts`, `classifier.ts`, `dynamic-router.ts` | `Benchmarker`, `classifyComplexity()`, `selectOptimalModel()` |
| **Cerebro** | `src/core/memory/cerebro/vector.ts`, `reflection.ts` | `CerebroVectorStore`, `ReflectionExecutor` |
| **PortGrid** | `src/ui/App.tsx`, `src/ui/components/`, `src/ui/views/` | React component tree, port 3743 |
| **Gateway** | `src/server/index.ts`, `src/server/routes/` | Hono app, `serve({ fetch, port: 3743 })` |

---

## Documentation Sync

Update the relevant documentation whenever a change affects:

- Product scope or user flow → `context/project-overview.md`
- Architecture, modules, DB schema, routes → `context/architecture.md`
- Security requirements, SA assertions → `context/architecture.md` + `context/ai-workflow-rules.md`
- Build order, milestone status → `context/progress-tracker.md`
- Zod schema status enum → `context/architecture.md` + `context/code-standards.md`
- UI components → `context/ui-context.md`

---

## Implementation Workflow

1. Read the required context files (mandatory read order above).
2. Check GitNexus index: `/usr/bin/gitnexus status`. If stale, run `gitnexus analyze`.
3. Run `gitnexus_impact()` on any symbol you plan to modify.
4. Mark the active unit as in progress in `context/progress-tracker.md`.
5. Implement only the active spec.
6. Run vitest (sequential, `--maxWorkers=4`).
7. Run `gitnexus_detect_changes()` to verify scope.
8. Update progress, decisions, and any changed docs.
9. Stop when the unit is complete. Do not start the next unit without instruction.

---

## Documentation Immutability & Working Copies

For all planning documents in the `./docs/` folder:

1. **Original Documents:** Updated only when implementation changes require it, following the evidence-based source-of-truth process.
2. **Working Copies (`_working` files):** For every `filename.md`, there must be a `filename_working.md`. Structure:
   - Summary of the original document at the top.
   - Separator: `===`
   - Append-only log of changes in **reverse chronological order** (newest first, immediately under separator).

---

## Strategic Directives (Current)

- **Target Stack:** Node.js 22 LTS, Vite + React, Hono, SQLite (WAL) + sqlite-vec. **Not** Next.js, Tauri, or Rust.
- **Server Port:** 3743 (hardcoded in `server/index.ts`).
- **Performance:** Isolate `sqlite-vec` searches to worker threads to protect the Hono event loop.
- **Free-Tier Readiness:** System currently uses `MockProvider` by default. Real LLM integration via `NEUROSYNC_LLM_BASE_URL` env var (auto-configured in `server/index.ts`).
- **Safety:** `FreeModeGovernor` defaults to 100,000 token quota (configurable via constructor arg).

---

## GitNexus Code Intelligence Engine (MANDATORY)

To prevent breaking existing architecture and to minimize token usage, the **GitNexus Zero-Server Code Intelligence Engine** MUST be used for all development workflows.

**Repository:** NeuroSyncMega | **Status:** ✅ Up-to-date (df328cb) | **Symbols:** 1358 | **Relationships:** 2205

### Mandatory GitNexus Workflow
1. **Index Check** (`/usr/bin/gitnexus status`): Verify freshness before any task.
2. **Exploration** (`query`, `context`, `cypher`): Map dependencies BEFORE writing code.
3. **Pre-Edit Blast Radius** (`impact`): Run before modifying any function, class, or endpoint. **HIGH/CRITICAL risk → halt and report to user.**
4. **Refactoring** (`rename`): Use AST-aware renames, never text replacement.
5. **Post-Edit Validation** (`detect_changes`): Verify scope before staging/committing.

### Banned
- `gitnexus wiki` — DO NOT CALL (requires external LLM API billing).
- Open-coded `grep` searches when GitNexus `query` or `context` can answer the question.

---

## System Resource Rules

| Rule | Value |
| --- | --- |
| Node.js memory ceiling | `NODE_OPTIONS="--max-old-space-size=1024"` |
| Thread pool cap | `UV_THREADPOOL_SIZE=3` |
| Max CPU cores | 6 of 8 (2 reserved for OS/Wayland) |
| Test runner max workers | `--maxWorkers=4` |
| Concurrency | Sequential terminal commands only. No concurrent builds. |
