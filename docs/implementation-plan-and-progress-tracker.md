# NeuroSync Sovereign OS — Implementation Plan & Progress Tracker

**Started:** 2026-06-30
**Source audit:** `docs/sovereign-os-reality-audit-2026-06-30.md` (read that first for full "why" context on every gap listed below)

---

## 0. READ THIS FIRST — How to pick up this task if you are a new coder or a new AI session

This document is the **single source of truth** for an in-progress set of fixes. It is a **living document** — whoever is doing the work must update the **Status Dashboard** (section 1) and add an entry to the **Progress Log** (section 9) every time they finish, pause, or get blocked on a step. Do not just fix code and walk away without updating this file — the entire point of this file is so someone else (or a future session with no memory of this conversation) can resume without re-doing research.

**To resume work:**
1. Read the Status Dashboard (section 1) to see which task is `IN PROGRESS` or next up.
2. Read that task's full section below — it has the goal, the why, the exact files and line numbers as they were at last update, the steps, and the tests.
3. Read the Progress Log (section 9) bottom entry to see exactly what the last session did and where they stopped.
4. Before writing code, re-check the cited line numbers are still accurate (files may have shifted since this was written) — treat line numbers as "last known location," not gospel.
5. Do the work, run the tests listed for that task, then update both the Status Dashboard and the Progress Log before stopping.

**Ground rules that must never be broken while doing this work** (confirmed from the codebase and from direct user instruction):
- **Do not merge the PortGrid and CoreExec dashboards.** They must stay two separate screens with two separate Set-up buttons, permanently. (User was explicit about this.)
- **No external databases, no paid libraries.** Everything stays on `better-sqlite3` (already in use). See `package.json` dependencies for what's already installed — use it before adding anything new.
- **No shell escape hatches.** Any new terminal/CLI feature must go through the existing `CommandSandbox` allowlist pattern (`src/core/coreexec/sandbox.ts`), never a raw unrestricted shell.
- **AI actions stay draft-only.** Any new code path that lets an AI/agent do something must still require a human click to confirm, per the existing worktree-quarantine pattern (`src/core/coreexec/worktree.ts`).
- **Run `npm test` before considering any step done.** Test command: `npm test` (runs `vitest run --fileParallelism=false`). The codebase already has good test coverage with `.test.ts` files sitting next to the source files they test — follow that pattern for new tests.

---

## 1. STATUS DASHBOARD (update this first, every session)

| # | Task | Priority | Status | Last updated |
|---|------|----------|--------|---------------|
| 1 | Numeric confidence score (replace High/Medium/Low) | P0 | VERIFIED (tests pass) | 2026-07-01 |
| 2 | Add `confidence` column to `os_todos` | P0 | VERIFIED (tests pass) | 2026-07-01 |
| 3 | Port Deference UI pill-bar into the live app | P0 | VERIFIED (tests + browser confirmed) | 2026-07-01 |
| 4 | Delete `src/ui-next/` after port is verified | P0 | VERIFIED (tests pass + build succeeds) | 2026-07-01 |
| 5 | Split `src/core/coreexec/` into `portgrid/` + `coreexec/` (dashboards stay separate, always) | P0 | VERIFIED (tests + typecheck + build + runtime) | 2026-07-01 |
| 6 | Rename/relocate `src/core/scoutlogic/` → `src/core/routeswitch/model-selector/` | P0 | VERIFIED (tests + typecheck + build) | 2026-07-01 |
| 7 | Build the Tri-Modal Context Router (+ real GitNexus integration) | P1 | VERIFIED (tests + typecheck + build + runtime) | 2026-07-01 |
| 8 | Build real embedded terminal in PortGrid (CLI/MCP windows) | P1 | VERIFIED (tests + typecheck + build + empirical containment proof + E2E WS runtime) | 2026-07-01 |
| 9 | Developer Mode toggle + 6th-grade default copy | P2 | VERIFIED (tests + typecheck + build + browser confirmed) | 2026-07-01 |
| 10 | Delete or wire in 6 orphaned components | P2 | VERIFIED (tests + typecheck + build + browser confirmed) | 2026-07-01 |
| 11 | Per-project `neurosync-config.yaml` | P2 | VERIFIED (tests + typecheck + build + manual write/update/import) | 2026-07-01 |

Status values to use: `NOT STARTED`, `IN PROGRESS`, `BLOCKED (reason)`, `DONE (needs test)`, `VERIFIED (tests pass)`.

---

## 2. System context (short version — see the audit doc for the long version)

NeuroSync Sovereign OS is a local-first, single-repo Node.js app. Backend: Node 22, Hono, `better-sqlite3` in WAL mode (`src/core/basevault/db.ts`). Frontend: Vite + React (`src/ui/`), NOT Next.js — there's an abandoned Next.js prototype at `src/ui-next/` that this plan retires (Task 3-4). Six real modules exist as both a dashboard (`src/ui/views/*.tsx`) and backend logic (`src/core/*/`): PortGrid, ScopeLogic, RouteSwitch, BaseVault, CoreExec, ScoutDaemon. The goal of this plan is to close the gap between what's built and the Master Architect Specification the user provided, focused first on "Deference UI" (the confidence-based approval system), which is the single biggest visible gap.

---

## 3. Task 1 — Numeric confidence score

**Goal:** Replace the `'High' | 'Medium' | 'Low'` confidence label with a real number from 0.0 to 1.0, so the UI can apply the spec's "≥ 0.70 = quick approve" rule.

**Why:** You can't compare a word to a number. The spec's entire Deference UI rule (0.70 threshold) is mathematically impossible to build against a 3-word enum. The underlying math to produce a real number already exists — it's being thrown away.

**Current code (as of 2026-06-30):**
- `src/core/routeswitch/engine.ts:31-37` — `RouteResponse.confidence?: 'High' | 'Medium' | 'Low'`
- `src/core/routeswitch/engine.ts:158-176` (`_executeWithProvider`) — computes `qualityScore` (a real number: `-2.0`, `-0.8`, or `0.0` based on response length) then immediately discretizes it into just `'High'` or `'Low'` (never even uses `'Medium'` on this path).
- `src/core/routeswitch/council.ts:39-51` — computes `maxDiff` (a real 0.0+ float representing how much responses disagree), then discretizes it into `'High' | 'Medium' | 'Low'` via two if-statements (`:49-51`), and *separately* already returns the undiscretized `disagreementScore: maxDiff` in `ConsensusResult` (`council.ts:6,58`) — so the raw number is already being computed and returned, just not used by the caller.
- `src/core/routeswitch/engine.ts:212,219,264-269` — takes whatever `confidence` (the word) comes back and puts it straight into the final `RouteResponse`.

**Steps:**
1. In `src/core/routeswitch/council.ts`: change `ConsensusResult.confidence` from `'High'|'Medium'|'Low'` to `number` (0.0–1.0). Compute it as `1 - Math.min(maxDiff, 1)` (low disagreement → high confidence, clamped to [0,1]). Keep `disagreementScore` as-is for anyone who wants the raw variance too.
2. In `src/core/routeswitch/engine.ts`:
   - Change `RouteResponse.confidence` from `'High'|'Medium'|'Low'` to `number`.
   - In `_executeWithProvider` (`:158-176`), replace the binary Low/High logic with a formula that produces a real number, e.g.: start at `1.0`, subtract `0.3` if `qualityScore < 0.0`, subtract `0.6` if `abortController.signal.aborted`. Clamp to [0,1]. (Exact formula is a judgment call — the important part is it must be a continuous number, not a 3-step ladder.)
   - Everywhere `confidence: 'High'` etc. is set as a literal (`:169,212`), replace with a numeric literal or the computed value.
3. Search the whole repo for anyone reading `.confidence === 'High'` or similar string comparisons and update them to numeric comparisons (e.g. `grep -rn "confidence.*High\|confidence.*Medium\|confidence.*Low" src/`).
4. Update `src/core/routeswitch/engine.test.ts` and `src/core/routeswitch/council.ts`'s existing tests (check for a `council.test.ts` — if none exists, this is a good time to add one) to assert numeric ranges instead of string equality.

**Testing:**
- Run `npm test -- routeswitch` (or `npm test` for the whole suite) and confirm all existing RouteSwitch/council tests pass with the new numeric type.
- Add a new test case: council mode with 2 providers returning near-identical responses should yield confidence close to 1.0; council mode with wildly different response lengths should yield confidence below 0.5.
- Manually verify no leftover `'High'|'Medium'|'Low'` string literals remain: `grep -rn "'High'\|'Medium'\|'Low'" src/core/routeswitch/`.

**Acceptance criteria:** `RouteResponse.confidence` and `ConsensusResult.confidence` are both `number` types across the codebase; `npm test` passes; no string-based confidence comparisons remain in `src/core/routeswitch/`.

**Files touched:** `src/core/routeswitch/engine.ts`, `src/core/routeswitch/council.ts`, their `.test.ts` files, plus any caller found by the grep in step 3.

**Status:** VERIFIED (tests pass) — completed 2026-07-01
**Notes:** Implemented exactly as planned, no deviations.
- `council.ts`: `ConsensusResult.confidence` is now `number`; single-response case returns `0`; multi-response case computes `1 - Math.min(maxDiff, 1)` (line ~48-49), replacing the two-if-statement ladder.
- `engine.ts`: `RouteResponse.confidence` and `_executeWithProvider`'s return type are now `number`. `_executeWithProvider` starts at `1.0`, subtracts `0.3` for `qualityScore < 0.0`, subtracts `0.6` if AgentStop aborted, clamps to [0,1]. The `execute()` method's local `confidence` variable initializer changed from `'High'` to `1.0`.
- Grepped `src/` for `confidence === 'High'|'Medium'|'Low'` and for any other importer of `RouteResponse`/`ConsensusResult` (`routeswitch.test.ts`, `council.ts`, `engine.ts` only) — no other call sites existed anywhere in the codebase reading confidence as a string, so no additional files needed changes. This was a smaller blast radius than the plan anticipated (plan step 3 assumed there might be scattered callers; there weren't any outside these two files).
- Added 2 new tests to `council.test.ts` (near-identical responses → confidence > 0.9; wildly different lengths → confidence < 0.5). Both pass.
- Full suite: `npm test` → 203/204 passing. The 1 failure (`routeswitch.test.ts > LlamaCppProvider should format correctly`) is **pre-existing and out of scope** — confirmed via `git diff --stat` that `src/core/routeswitch/adapters/llama-cpp.ts` was already modified (uncommitted) before this task began; the failure is an unrelated string-format mismatch in that file, not caused by this change.
- `gitnexus detect_changes` (repo-wide, since other uncommitted changes predate this task) confirms my specific symbols (`ConsensusSynthesizer`, `ConsensusResult`, `executeCouncilMode`, `RouteRequest`, `RouteSwitchEngine`) only affect the two council-mode execution flows (`GenerateFn → ExecuteCouncilMode`, `_cerebroGenerateFn → ExecuteCouncilMode`), matching the pre-edit LOW-risk impact assessment — no surprise blast radius.
- No open questions raised — nothing required stopping to ask the user.
- **Task 2 is now unblocked.**

---

## 4. Task 2 — Add `confidence` column to `os_todos`

**Goal:** Give every pending human-approval item a saved numeric confidence score, so the UI can sort/split by it.

**Why:** Task 1 makes confidence a number in memory during a single request. This task makes it *persist* — so a pending approval sitting in the database for hours still has its number when the UI loads it later.

**Current code:**
- `src/core/basevault/db.ts:70-79` — `os_todos` table schema has `severity`, `escalation_reason`, `required_action_type`, `status` — **no `confidence` column exists today.**
- `src/server/routes/todos.ts:1-14` — `GET /` returns `SELECT * FROM os_todos WHERE status = 'open'`. Once the column exists, `SELECT *` will automatically include it — no route change needed for reads.
- `src/server/routes/todos.ts:47-73` (`/promote`) — inserts new `os_todos` rows with a hardcoded `'MEDIUM'` severity string, no confidence value. This is the main insert path to update.
- Other insert sites for `os_todos`: search with `grep -rn "INSERT INTO os_todos" src/` to find every place that creates a todo (there may be more than the one in `todos.ts` — check `src/core/coreexec/` for DAG-escalation inserts too, since `src/server/index.ts:127-132` mentions an `escalateBlockedDAGToOsTodos` gate).

**Steps:**
1. Add a migration in `db.ts`'s init block (follow the existing pattern used for other `ALTER TABLE` migrations at `db.ts:202-216`, which already handles adding columns to existing tables safely — copy that pattern):
   ```sql
   ALTER TABLE os_todos ADD COLUMN confidence REAL NOT NULL DEFAULT 0.5;
   ```
   (Default `0.5` puts un-scored legacy rows in the middle — they'll show in the "needs a look" bucket rather than silently auto-approving.)
2. Update every `INSERT INTO os_todos` call site found in step above to pass a real confidence number instead of relying on the default. For `/promote` in `todos.ts`, that likely means accepting a `confidence` field in the request body (default to something sensible if the caller doesn't provide one, but wire it through wherever possible).
3. Wire the DAG-escalation gate (`escalateBlockedDAGToOsTodos`, likely in `src/core/coreexec/validateDAG.ts` or `engine.ts` — grep to confirm exact file) to pass through whatever confidence number Task 1 now produces from the RouteSwitch call that triggered the escalation.

**Testing:**
- `npm test` — check for and update `src/core/basevault/db.test.ts` (or wherever the schema is tested) to assert the new column exists with the right default.
- Manually run the dev server (`npm run dev:server` in one terminal, `npm run dev:ui` in another), trigger a `/promote` call (or use existing UI flow that creates a todo), then check the row in SQLite directly (`sqlite3 <path-to-db> "SELECT confidence FROM os_todos LIMIT 5;"` — find the DB path in `db.ts`'s `initDB()`).

**Acceptance criteria:** `os_todos` table has a `confidence REAL` column; every code path that inserts a row provides a real value (not just relying on the `0.5` default going forward); `npm test` passes.

**Files touched:** `src/core/basevault/db.ts`, `src/server/routes/todos.ts`, plus whichever file contains `escalateBlockedDAGToOsTodos` (confirm via `grep -rn "escalateBlockedDAGToOsTodos" src/`).

**Status:** VERIFIED (tests pass)
**Notes:** Implemented as planned, with one refinement found during implementation: there are actually **3** `INSERT INTO os_todos` call sites, not 2 — `src/core/coreexec/engine.ts:138-139` (`executeRun`'s worker-failure path) was a third one the plan didn't call out by name. Handled it too.

Confidence semantics decided (all high-confidence, no user check-in needed):
- `src/core/coreexec/validateDAG.ts` (`escalateBlockedDAGToOsTodos`/`insertBlocked`, ~line 132-143) and `src/core/coreexec/engine.ts` (`executeRun`'s catch block, ~line 137-140): these are **deterministic failures** (structural DAG validation rejection, or a worker throwing) — not an AI expressing self-doubt. There is no "AI confidence" to thread through because no AI judgment produced these rows. Set both to a hardcoded `0.0` (always below the 0.70 threshold, always routed to the low-confidence/human-review queue), with a comment explaining why. This is different from the column's own `DEFAULT 0.5` (which exists only for legacy rows written before this column existed).
- `src/server/routes/todos.ts` `/promote` (ScoutDaemon discovery promotion): the one path that IS a genuine "AI found something, uncertain, needs a look" case. Added an optional `confidence` field to the POST body, validated to a `[0,1]` number, defaulting to `0.5` if omitted — exactly as the plan specified.
- Migration: added `ALTER TABLE os_todos ADD COLUMN confidence REAL NOT NULL DEFAULT 0.5;` only (no CREATE TABLE change), matching the `project_root_path` precedent in the same file (the newer/cleaner of the two existing migration styles) rather than the older `workspace_path` style (which duplicates the column into both CREATE TABLE and ALTER TABLE). Verified against the actual on-disk `.data/neurosync.db` (a real pre-existing database, not just a fresh test DB) via a one-off `tsx` script calling `initDB()` and reading back `PRAGMA table_info(os_todos)` — column added cleanly, `REAL`, default `'0.5'`, no crash.
- Also updated both frontend `OsTodo` interfaces (`PortGridDashboard.tsx:38`, `NotificationCenter.tsx:4-12`) to add `confidence: number`, so Task 3 has the type ready to consume.

Tests: added a schema test in `db.test.ts` (asserts the column via `PRAGMA table_info`), added a confidence assertion to the existing `escalateBlockedDAGToOsTodos` test in `validateDAG.test.ts`. Did not add a new `todos.test.ts` for the `/promote` route since no test file existed for `todos.ts` before this task and adding one was out of this task's stated scope — flagging as a gap Task 3 (or a dedicated follow-up) should close given `/promote` now has real conditional logic (`confidenceValue` validation) worth covering.

`npm test`: 204/205 passing — the 1 failure is the same pre-existing, unrelated `LlamaCppProvider should format correctly` failure Task 1 already flagged (confirmed via `git diff --stat` before this task started: `llama-cpp.ts` was already modified prior to any of this session's work).

`detect_changes(scope: unstaged)` came back **risk: critical, 25 files, 33 symbols** — but this is misleading if read at face value: this repo had substantial pre-existing uncommitted changes *before this whole implementation effort started* (confirmed against the session's original `git status`: `sandbox.ts`, `reflection.ts`, `llama-cpp.ts`, `idle.ts`, `server/index.ts`, `projects.ts`, `BaseVaultDashboard.tsx`, `CerebroDashboard.tsx`, `RouteSwitchDashboard.tsx`, `ScoutDaemonDashboard.tsx` were already modified before Task 1 or Task 2 touched anything). `detect_changes` with `scope: unstaged` reports the entire dirty working tree, not a per-task diff, so it can't be used to isolate this task's actual risk — it's flagging pre-existing drift, not something Task 2 introduced. Task 2's own actual footprint (the files listed above) is small and low-risk on its own. **Worth surfacing to the user separately: there's a meaningful amount of unrelated uncommitted work already sitting in this working tree from before this session began**, which will eventually need its own review/commit decision independent of this tracker's 11 tasks.

---

## 5. Task 3 — Port the Deference UI pill-bar into the live app

**Goal:** Give the running app (not the dead prototype) a real "quick-approve" pill bar for high-confidence items, plus keep the existing per-item modal-style row for low-confidence items.

**Why:** This is the single most spec-visible missing feature. A working version already exists — it just needs to be moved into the app that actually runs, and wired to endpoints that actually exist (the dead prototype was wired to endpoints that were never built).

**Current code:**
- `src/ui-next/src/components/DeferenceUI.tsx` (full file already captured below for reference — copy logic, not necessarily every class name, since `ui-next` used Tailwind CSS variables like `--color-sovereign-gold` that may not exist in the live app's Tailwind config — check `tailwind.config` / `src/ui/index.css` for equivalents or substitute the live app's existing accent-color pattern, e.g. the `ACCENT` constant used in `PortGridDashboard.tsx`):
  ```tsx
  // props: { tasks: {id, description, confidence}[], onApproveAll(ids), onRejectAll(ids) }
  // renders a fixed-position pill showing "{N} high-confidence tasks pending approval"
  // with "Reject" and "Approve All" buttons calling the passed-in handlers
  ```
- `src/ui-next/src/components/TaskQueue.tsx` — **do not port this file's networking as-is.** It calls `/api/scout/events` (this endpoint DOES exist — confirmed at `src/core/scoutdaemon/sse.ts:15`), but also calls `/api/scout/approve` and `/api/scout/reject`, which **do not exist anywhere in the server** (confirmed via `grep -rn "scout/approve\|scout/reject" src/server/` returning nothing, and `src/core/scoutdaemon/sse.ts` only defines `/heartbeat` and `/events`). These were aspirational endpoints in the abandoned prototype that were never built.
- The live app's real, working equivalent endpoints are `GET /api/todos` and `POST /api/todos/resolve` (`src/server/routes/todos.ts:6-13,15-39`), already used by `PortGridDashboard.tsx:164,184`.
- `src/ui/views/PortGridDashboard.tsx:289-322` — the current "HITL Approval Queue" widget. Every item renders the same way regardless of confidence (`:304-320`).

**Steps:**
1. Create `src/ui/components/DeferenceUI.tsx` — a new file in the live app, adapted from the `ui-next` version's structure (props, layout, accessibility attributes like `role="region"`, `aria-live="polite"` — keep those, they're good) but using the live app's existing color/Tailwind conventions instead of `ui-next`'s CSS variables.
2. In `PortGridDashboard.tsx`, split `approvalQueue` (fetched at `:164`) into two arrays based on `todo.confidence` (now available after Task 2): `lowConfidenceTodos = approvalQueue.filter(t => t.confidence < 0.70)` and `highConfidenceTodos = approvalQueue.filter(t => t.confidence >= 0.70)`.
3. Keep the existing per-item widget (`:289-322`) rendering only `lowConfidenceTodos`.
4. Render the new `<DeferenceUI>` pill bar for `highConfidenceTodos`, with `onApproveAll` looping a call to the existing `POST /api/todos/resolve` for each id (or add a new bulk endpoint `POST /api/todos/resolve-bulk` in `todos.ts` if looping individual calls is too slow/chatty — a bulk endpoint is preferable and not much extra code, following the same transaction pattern already used in `todos.ts:19-38`).
5. Add an "Attention Required" heading/section explicitly labeled as such above the low-confidence queue, since the spec names this exact widget and it currently has no matching label anywhere (currently it's just called "HITL Approval Queue" — keep that internal queue working, just add the spec's expected label so the feature is discoverable/nameable).
6. Also check `UnifiedMasterDashboard.tsx` (the actual global dashboard) — the spec wants this widget aggregating alerts *across* modules, not just PortGrid-local ones. If time allows in this task, mirror the same split/render there too; otherwise note it as a follow-up in the Progress Log.

**Testing:**
- Run `npm run dev:server` and `npm run dev:ui`, open PortGrid in a browser.
- Manually create test `os_todos` rows with varying confidence values (via the `/promote` endpoint or direct SQL insert) — some above 0.70, some below.
- Verify: items below 0.70 show in the existing individual-approve list; items 0.70+ show in the new pill bar; clicking "Approve All" on the pill bar actually resolves those todos (check they disappear and `status` flips to `resolved` in the DB).
- Check the browser console is clean (no errors) per this project's browser-testing-with-devtools skill standard.
- If a new bulk-resolve endpoint was added, write a test for it following the pattern in an existing `*-router.test.ts` file (e.g. `src/server/routes/coreexec-router.test.ts`).

**Acceptance criteria:** Opening PortGrid with mixed-confidence pending todos shows a visibly different UI for high vs. low confidence items; bulk-approve actually resolves the underlying DB rows; no console errors; `npm test` passes.

**Files touched:** new `src/ui/components/DeferenceUI.tsx`, `src/ui/views/PortGridDashboard.tsx`, `src/server/routes/todos.ts` (added bulk endpoint).

**Status:** VERIFIED (tests pass + manual runtime verification)
**Notes:** Built exactly per plan, with these findings/decisions:
- **Correction to the plan's CSS assumption:** `src/ui/index.css` *does* already define `--color-sovereign-gold`, `--color-report-green`, and a `.glass-enclave` class (checked directly) — the plan's assumption that `ui-next`'s CSS variables "don't exist in the live app" was wrong. However, `grep -rln "glass-enclave" src/ui --include="*.tsx"` (excluding `ui-next`) returns zero hits — no live dashboard actually uses that class, it's dead CSS. Decision: styled `DeferenceUI.tsx` to match `PortGridDashboard.tsx`'s own actual established look (the `GLOW_BOX`/`ACCENT` teal + green/red/amber palette already used throughout that file) rather than reviving an unused utility class, since real visual consistency means matching what's actually rendered, not what's defined-but-unused in CSS.
- Added `POST /api/todos/resolve-bulk` to `src/server/routes/todos.ts`, mirroring `/resolve`'s per-item transaction logic in a loop inside one `db.transaction()`, returning `{resolved: string[], failed: {id,error}[]}`.
- Added `DEFERENCE_THRESHOLD = 0.70` constant in `PortGridDashboard.tsx`; split `approvalQueue` into `lowConfidenceTodos`/`highConfidenceTodos`; renamed the existing widget heading to "Attention Required — HITL Approval Queue" (kept the existing internal queue working, just added the spec's expected label per step 5); low-confidence rows now also display their numeric confidence value.
- `onRejectAll` on the pill bar currently only clears local UI state — there is no bulk-reject *backend* endpoint, because there's no bulk-resolve semantic for "reject" (rejecting doesn't resolve the todo, it just leaves the DAG parked). Worth noting: the pre-existing single-item "Decline" button (now in the Attention Required list) also has no `onClick` handler at all — this is a pre-existing gap from before this task, not introduced here, left untouched as out of scope.
- Did NOT touch `UnifiedMasterDashboard.tsx` (step 6, marked optional/follow-up in the plan) — still a follow-up.
- Tests: 204/205 pass, same single pre-existing/unrelated `llama-cpp.ts` formatting failure already flagged by Task 1.
- Runtime verification performed via curl against a live `npm run dev:server` instance (no browser tool was available in this environment, so visual/DOM verification was NOT performed — recommend the user do a quick visual pass in-browser): seeded 4 test `os_todos` rows via `/api/todos/promote` at confidence 0.30, 0.70, 0.85, 0.92; confirmed `GET /api/todos` returned all 4 with correct values; called `/api/todos/resolve-bulk` with the three ≥0.70 ids; confirmed all 3 resolved (`{"resolved":[...3 ids...],"failed":[]}`) and only the 0.30 item remained in the open list afterward. Test rows and their associated `tasks`/`workflow_runs`/`projects` rows were deleted from `.data/neurosync.db` afterward — no test data left behind.
- `mcp__gitnexus__detect_changes` ran clean: all touched symbols matched expectations (this task's edits to `PortGridDashboard`, plus the already-reviewed pre-existing diff). The "critical" risk label is from aggregate file count across the whole dirty tree (25 files, mixed pre-existing + plan work), not from anything new/alarming in this task's diff specifically.
- **No open questions below the 0.70 confidence bar** — the one ambiguous item (bulk endpoint vs. loop) was pre-authorized in the plan as a judgment call, and was resolved in favor of a bulk endpoint per the plan's own reasoning.

**Follow-up browser verification (2026-07-01, same day, separate pass):** the recommended visual/DOM check above was performed using Chrome DevTools browser automation. Confirmed visually: the "Attention Required — HITL Approval Queue" widget correctly shows only the low-confidence test item (confidence 0.35) with its per-item Approve/Decline buttons; the floating pill bar correctly appeared reading "1 high-confidence task pending" for the 0.88-confidence test item; clicking the pill bar's "Approve" button correctly resolved it (pill disappeared, confirmed via `GET /api/todos` that only the 0.35 item remained `open`). No console errors related to the Deference UI feature itself.

**Bug found and fixed during this browser pass (unrelated to Task 3's own code, but in the same feature area — user approved fixing it inline):** `src/ui/components/NotificationCenter.tsx` was polling `fetch('/api/todos')` and `fetch('/api/todos/resolve', ...)` with relative URLs (no `${API}` prefix), which fail in dev mode because `vite.config.ts` has no proxy for `/api` — Vite's dev server was serving `index.html` back instead of JSON, causing a `SyntaxError: Unexpected token '<'` every 10-second poll cycle (visible in browser console). Fixed by adding `const API = 'http://localhost:3743';` (matching the pattern already used in `PathBrowser.tsx`, `OKFMindmap.tsx`, `ProjectSwitcher.tsx`, `OKFWorkspaceWidget.tsx`, `CerebroChatbot.tsx`) and prefixing both fetch calls. Verified fixed: after the change, a full reload + 13-second wait (covering one poll cycle) produced zero "Failed to fetch OS Todos" errors. `npm test` re-run afterward: still 204/205, same pre-existing unrelated failure — this fix did not break anything.

**A second, separate pre-existing bug was found but NOT fixed (out of scope, flagged for the user):** a React hydration warning — `<button>` (the "Edit project" icon button) nested inside another `<button>` — in `src/ui/components/ProjectSwitcher.tsx`, part of the already-reviewed "Project Root Directory Mapping" pre-existing work. Not a functional break, just an accessibility/HTML-validity warning. Left untouched.

**Test data and dev servers:** all test `os_todos` rows were deleted from the real `.data/neurosync.db` (2 rows, confirmed via `better-sqlite3` delete). Both `dev:server` and `dev:ui` background processes were stopped after verification.
- **Task 4 (delete `src/ui-next/`) is now unblocked** — the port is verified and solid.

---

## 6. Task 4 — Delete `src/ui-next/`

**Goal:** Remove the abandoned Next.js prototype once Task 3 has ported everything useful out of it.

**Why:** A second, unused copy of the frontend is a trap — a future edit could land in the dead copy by mistake and quietly do nothing.

**Steps:**
1. Confirm Task 3 is fully done and verified first — do not delete until the pill-bar UX is confirmed working in the live app.
2. Check nothing else references `src/ui-next/` (`grep -rn "ui-next" --include="*.ts" --include="*.tsx" --include="*.json" . | grep -v node_modules`).
3. Delete the directory: `rm -rf src/ui-next`.
4. Check the root `package.json`/`tsconfig.json`/`.gitignore` for any stray references to `ui-next` and clean those up too.
5. Run `npm test` and `npm run build` to confirm nothing broke.

**Testing:** `npm test` passes; `npm run build` succeeds; app still runs via `npm run dev:ui` + `npm run dev:server`.

**Acceptance criteria:** `src/ui-next/` no longer exists in the working tree; build and tests are green.

**Files touched:** deletion of `src/ui-next/` and any stray config references.

**Status:** VERIFIED (tests pass + build succeeds)
**Notes:** Done exactly per plan. `src/ui-next/` was tracked in git (23 files, not gitignored, clean/unmodified) so the deletion is fully recoverable via git history if ever needed — done via `rm -rf src/ui-next`, showing as 23 deletions in `git status`, not yet committed. Confirmed via `mcp__gitnexus__impact` (target not found in the graph — `ui-next` was already excluded from indexing/build) and a repo-wide grep that the only references anywhere outside the directory itself were the two build-exclusion entries: `vite.config.ts:14` (`optimizeDeps.exclude`) and `tsconfig.json:44` (`exclude`) — both removed. `npm test`: 204/205 (same pre-existing unrelated `llama-cpp.ts` failure). `npm run build`: succeeds (pre-existing, unrelated "chunk larger than 500kB" warning, not something this task needs to address). No confidence-below-0.70 situations.

---

## 7. Task 5 — Split `src/core/coreexec/` so PortGrid and CoreExec each get their own backend, without ever merging the dashboards

**Goal:** Match the backend folder structure to the fact that PortGrid and CoreExec are — and must remain — two separate dashboards with two separate Set-up buttons.

**Why (this was a point of confusion last round, now corrected):** The two dashboards are staying separate, permanently — that was already decided by the user. The problem this task solves is different: right now, both dashboards' frontend code calls the exact same backend files (confirmed: both `PortGridDashboard.tsx:84,92,138` and `CoreExecDashboard.tsx:69,79` call `/api/coreexec/*` endpoints, all handled by one file, `src/server/routes/coreexec-router.ts`, which calls `src/core/coreexec/engine.ts`). This task does NOT touch the two dashboard files' separateness at all — it only reorganizes the *backend* folder underneath them so each dashboard's logic has its own home, matching the two permanent front-end doors with two real, separate backend rooms instead of one shared room.

**Current code:**
- `src/core/coreexec/` currently holds: `dispatch.ts`, `engine.ts`, `memory-sweep.ts`, `path-validator.ts`, `queue.ts`, `sandbox.ts`, `scheduler.ts`, `scraping.ts`, `validateDAG.ts`, `worker-pool.ts`, `worker.ts`, `worktree.ts` (plus `python_scripts/`).
- `src/server/routes/coreexec-router.ts` imports from `../../core/coreexec/engine` and `../../core/coreexec/validateDAG`.
- `PortGridDashboard.tsx` — its actual content (per the audit) is about the Zero-Trust Quarantine/HITL queue, Verifiable Confidence Badges, Active Tool Telemetry, OKF Workspace, and a Set-up view with Capability Broker/Tool Registry (`SetupView`, `:375+`) — this is about **hosting and governing external tools/capabilities**.
- `CoreExecDashboard.tsx` — imports `AutonomyDials`, `CronSummary`, deals with run status polling (`:69,79`) — this is about **running and scheduling task chains**.

**Steps:**
1. Create `src/core/portgrid/` for anything that's really about tool/capability governance: move `sandbox.ts` (CommandSandbox — the tool execution gate) here, since PortGrid's Set-up view is literally the "Capability Broker (Tool Registry)" UI for this exact sandbox.
2. Keep `src/core/coreexec/` for the run/scheduling engine: `engine.ts`, `scheduler.ts`, `queue.ts`, `worker.ts`, `worker-pool.ts`, `validateDAG.ts`, `worktree.ts`, `dispatch.ts`, `memory-sweep.ts`.
3. Update every import path across the codebase that references the moved file(s) (`grep -rn "coreexec/sandbox" src/` to find every caller — likely includes `dispatch.ts`, `path-validator.ts` usage, and any route file).
4. Consider a parallel split on the route layer too: a new `src/server/routes/portgrid-router.ts` for capability/tool-registry endpoints (currently mixed into `system.ts` per the `/api/system/tools`, `/api/system/agents/permissions` calls seen in `PortGridDashboard.tsx:389-390`) vs. keeping `coreexec-router.ts` purely for run/approve/status. This is a larger refactor — do it only if step 1-3 goes cleanly and there's time; otherwise log it as a follow-up in the Progress Log.

**Testing:**
- Run `npm test` after each file move — fix import errors immediately, one file at a time (don't move everything then debug all errors at once).
- Manually verify both dashboards still load with no console errors and no broken network calls after the move.

**Acceptance criteria:** `src/core/portgrid/` exists and contains capability/tool-governance logic; `src/core/coreexec/` contains only run/scheduling logic; both dashboards still work exactly as before from the user's perspective (this is an invisible-to-the-user refactor); `npm test` and `npm run build` pass.

**Files touched:** `src/core/coreexec/sandbox.ts` (moved), every file importing it, possibly `src/server/routes/coreexec-router.ts` / a new `portgrid-router.ts`.

**Status:** VERIFIED (tests + typecheck + build + runtime endpoint checks)
**Notes:** Done exactly per plan, steps 1-3 only (step 4, the route-layer split, deliberately skipped as marked optional — still a follow-up). PortGrid and CoreExec dashboards were NOT touched at all — this was strictly a backend reorg, confirmed by grep and by the fact that neither `PortGridDashboard.tsx` nor `CoreExecDashboard.tsx` appear in the git diff for this task.

Corrected importer list (the plan's original guess of "dispatch.ts, path-validator.ts" was incomplete — verified via `mcp__gitnexus__impact` on `CommandSandbox`, MEDIUM risk/5 direct callers, plus a direct grep): `src/core/coreexec/scraping.ts`, `src/core/coreexec/worker.ts`, `src/core/coreexec/dispatch.ts` all needed their `./sandbox` import path updated to `../portgrid/sandbox`. `src/core/coreexec/worker.test.ts` only *mentions* `CommandSandbox` in a test description string — no actual import, nothing to fix there.

**One import break the plan didn't anticipate, found and fixed:** the moved `sandbox.ts` itself imports `PathValidator` from `./path-validator` — since `path-validator.ts` stayed behind in `coreexec/`, this needed updating to `../coreexec/path-validator`. Its other relative import, `require('../basevault/db')`, needed no change since `portgrid/` sits at the same depth under `src/core/` as `coreexec/` did.

Verification performed: `npm test` after the move (204/205, same single pre-existing unrelated `llama-cpp.ts` failure — no new failures, no regression). `npx tsc --noEmit` clean (zero errors) — this catches import-resolution breaks that `vite build` alone wouldn't, since the moved files are backend-only and not part of the UI bundle. `npm run build` also succeeds. Runtime-verified (not just static): booted `npm run dev:server`, confirmed clean boot log (no `MODULE_NOT_FOUND`/import errors), and curled both dashboards' real backing endpoints — `GET /api/system/tools` and `GET /api/system/agents/permissions` (PortGrid's Set-up view) both returned valid data, and `GET /api/coreexec/run/:id/status` (CoreExec's polling endpoint) correctly returned a 404 JSON error for a nonexistent run rather than crashing. Dev server stopped afterward. No visual/browser check was done this time (endpoint-level runtime verification was judged sufficient for a backend-only, UI-invisible refactor — the two dashboards' actual rendering logic wasn't touched by this task at all).

`mcp__gitnexus__detect_changes` was run but its symbol-level diff report didn't surface these changes at all (likely because single-line import-path edits don't map to a specific symbol body in its diff-to-symbol matching) — cross-verified directly with `git diff`, which confirmed the change set was exactly the 4 files above, nothing more, nothing missed.

No confidence-below-0.70 situations; the PortGrid/CoreExec separation boundary was never at risk of being blurred.

---

## 8. Task 6 — Rename/relocate `src/core/scoutlogic/`

**Goal:** Remove the confusing folder name `scoutlogic`, which looks like it should belong to `ScoutDaemon` or be a sibling of `ScopeLogic`, but is actually neither.

**Why:** Confirmed by checking every importer (`grep -rln "scoutlogic" src/`): only `src/core/routeswitch/engine.ts`, `src/core/routeswitch/live-test.ts`, and `src/ui/components/RoutingDials.tsx` use it. Nothing in ScoutDaemon or ScopeLogic touches it. It's a private helper that picks which AI model to use, living inside RouteSwitch's territory under a name that suggests otherwise.

**Current code:**
- `src/core/scoutlogic/classifier.ts` — `classifyComplexity(prompt)` → `'trivial'|'logical'|'complex'` based on keyword matching and prompt length.
- `src/core/scoutlogic/dynamic-router.ts` — `selectOptimalModel(complexity, userPriority, availableModels, benchmarks)` → picks the best model ID by scoring.
- `src/core/scoutlogic/benchmarker.ts`, `cerebro-assist.ts` — also live here; check their actual importers too before moving (`grep -rln "benchmarker\|cerebro-assist" src/core/routeswitch/ src/core/scoutdaemon/` to confirm they're RouteSwitch-only or shared).
- `src/core/routeswitch/engine.ts:6` — `import { selectOptimalModel, Benchmark, Model } from '../scoutlogic/dynamic-router';`
- `src/core/routeswitch/engine.ts:127-152` (`_resolveProviderViaScoutLogic`) — the whole method is explicitly named after ScoutLogic already, confirming the team already thinks of this as "RouteSwitch calling out to ScoutLogic," not "ScoutLogic as a peer module."

**Steps:**
1. Confirm every file in `src/core/scoutlogic/` is only used by RouteSwitch (grep each filename individually — don't assume, verify, since `cerebro-assist.ts` in particular sounds like it might be shared with the Cerebro chat feature).
2. Move the whole directory: `src/core/scoutlogic/` → `src/core/routeswitch/model-selector/`.
3. Update the 3 known import sites (`engine.ts:6`, `live-test.ts`, `RoutingDials.tsx`) plus any others found in step 1.
4. Update comments referencing "ScoutLogic" as if it were a standalone concept (e.g. `engine.ts:16` docstring "OQ-001: Optional ScoutLogic hints...", `engine.ts:51` "for ScoutLogic model selection") to instead say "model selector" or "RouteSwitch's model selector" — purely a naming/comment cleanup so nobody reads these comments and thinks there's a 7th module.
5. Rename the exported method `_resolveProviderViaScoutLogic` to something like `_resolveProviderViaModelSelector` for consistency (optional polish, do if time allows).

**Testing:** `npm test` — run the full suite since `engine.test.ts`, `classifier.test.ts`, `dynamic-router.test.ts` all need their import paths (if any test imports scoutlogic directly) updated too.

**Acceptance criteria:** No directory named `scoutlogic` exists anywhere in `src/`; RouteSwitch's model-selection logic lives at `src/core/routeswitch/model-selector/`; `npm test` passes; a `grep -rn "scoutlogic\|ScoutLogic" src/` (case-sensitive) returns zero hits outside of intentionally-updated comments.

**Files touched:** entire `src/core/scoutlogic/` directory (moved), `src/core/routeswitch/engine.ts`, `src/core/routeswitch/live-test.ts`, `src/ui/components/RoutingDials.tsx`.

**Status:** VERIFIED (tests + typecheck + build)
**Notes:** Done, with one significant scope expansion beyond the plan's file list, handled without escalation (high confidence, backward-compatible, not near the PortGrid/CoreExec hard boundary):

Moved all 7 files (`benchmarker.ts`, `cerebro-assist.ts`, `cerebro-assist.test.ts`, `classifier.ts`, `classifier.test.ts`, `dynamic-router.ts`, `dynamic-router.test.ts`) via `git mv` to `src/core/routeswitch/model-selector/`. Updated the 3 known import sites (`engine.ts`, `live-test.ts`) plus fixed 3 broken *internal* relative imports inside the moved files themselves that the plan didn't anticipate — moving one directory level deeper shifted their `../` paths: `cerebro-assist.ts`/`cerebro-assist.test.ts`'s `'../routeswitch/discovery'` → `'../discovery'`, and `benchmarker.ts`'s `'../basevault/db'` → `'../../basevault/db'`.

**Scope expansion (found during work, not in the original plan):** `RoutingDials.tsx` doesn't import from `scoutlogic/` at all — it has no code dependency. But it has a persisted settings key `scoutlogic_priority` (read/written via `/api/system/settings`, a generic key-value store) AND a **user-visible UI heading, "ScoutLogic Routing Priority"** — the most user-facing instance of the confusing name in the whole codebase, and plausibly the actual thing that originally confused the user. Fixed both: renamed the settings key to `model_selector_priority` with a backward-compatible fallback read (`data.settings.model_selector_priority || data.settings.scoutlogic_priority`, clearly commented as legacy) so any already-saved user preference isn't silently lost; renamed the visible heading to "Model Selection Priority".

Also did the plan's optional polish item: renamed `_resolveProviderViaScoutLogic` → `_resolveProviderViaModelSelector` in `engine.ts` (single definition, single call site, both verified via grep before renaming), and reworded 5 comments/log strings in `engine.ts` that referenced "ScoutLogic" as a standalone concept.

Final grep check: `grep -rn "scoutlogic|ScoutLogic" src/` returns exactly 2 hits, both intentional — the legacy-fallback comment and code line in `RoutingDials.tsx`, needed for backward compatibility with already-saved settings. Not a leftover miss.

`npm test`: 204/205 (same pre-existing unrelated `llama-cpp.ts` failure, checked incrementally after each file move, not just at the end). `npx tsc --noEmit`: clean. `npm run build`: succeeds. Cross-verified the exact file footprint with `git diff --stat`/`git status` (not just `gitnexus detect_changes`, which — as expected given it reports the whole dirty tree — showed the same aggregate "critical"/37-symbols reading as every prior task; the `RoutingDials`/`handleChange`/`RouteSwitchEngine.execute` symbols it flagged as "touched" matched this task's actual edits exactly, nothing unexpected). This was a backend/naming-only change with one small user-visible UI text change (the heading) — judged that a full browser check wasn't necessary since the only visible diff is a label string, but noted here in case the user wants to glance at RouteSwitch's Set-up view to confirm "Model Selection Priority" reads correctly.

No confidence-below-0.70 situations.

---

## 9. Task 7 — Build the Tri-Modal Context Router

**Goal:** Make Cerebro's chat feature actually choose which memory store to query (OKF / GitNexus / Knowledge Graph / raw vector chat memory) based on the question being asked, instead of always querying just one store.

**Why:** Confirmed the four stores exist independently but nothing routes between them. `src/server/routes/cerebro.ts` doesn't have a chat endpoint calling all four in this excerpt — re-check the full file for the actual chat/`assist` endpoint (the audit referenced `cerebro.ts:63-72` for vector search; confirm the real chat-message handler's exact line range before editing, since this file may have grown).

**Current code:**
- `src/core/memory/cerebro/vector.ts` — `CerebroVectorStore.search()`, keyword-heuristic similarity (`similarity = 0.7 + matchCount * 0.05`, not true embeddings).
- `src/core/okf/graph-query.ts` — `OKFGraphQuery.searchNodes()`, `.getRelated()`, `.resolveContext()`, `.formatContextForPrompt()` — a fully working graph query API that already does exactly the kind of "find relevant knowledge" work a router would delegate to. Already used by `routeswitch/engine.ts:196-199` for prompt enrichment before LLM calls — so the pattern for "call OKF for context" already exists in one place; it just needs to be reachable from Cerebro chat too.
- `src/server/routes/cerebro.ts` — chat/query endpoints currently only touch `CerebroVectorStore`.

**Steps:**
1. Read the full current `src/server/routes/cerebro.ts` to find the exact chat-handling endpoint (search for the route handling incoming user chat messages — likely a `/chat` or `/assist` POST route; the audit's line citation may be stale by the time this is picked up).
2. Create `src/core/memory/context-router.ts` exporting a function like `routeQuery(query: string, projectId?: string): { source: 'okf'|'gitnexus'|'vector'; chunks: ... }`.
3. Implement simple keyword/intent classification for v1 (the spec explicitly says ML-grade routing isn't required, just a router that exists): e.g., if the query matches code-structure language ("function", "class", "calls", "imports", "where is X defined") → prefer GitNexus; if it matches knowledge/preference language ("what did we decide", "why did we choose") → prefer OKF via `OKFGraphQuery.resolveContext()`; otherwise → fall back to `CerebroVectorStore`.
4. Wire the chat handler in `cerebro.ts` to call `routeQuery()` first, then feed whichever result it gets into the existing prompt-building logic instead of calling `CerebroVectorStore.search()` unconditionally.
5. For the GitNexus path specifically: this project already has GitNexus MCP tools available in the Claude Code session (per this project's own `CLAUDE.md`) — but the *app's own backend* needs its own way to query GitNexus data, likely via the existing `src/core/scoutdaemon/gitnexus-worker.ts` wrapper. Check what that worker already exposes before building a new interface to GitNexus.

**Testing:**
- Add `src/core/memory/context-router.test.ts` with cases: a code-structure question routes to GitNexus/OKF-code-type nodes, a preference question routes to OKF, a generic chat question falls back to vector search.
- Manually test via the Cerebro chat UI (`CerebroDashboard.tsx` or the floating chatbot) with one question of each type, and confirm (e.g., via server console logs) which store actually got queried.

**Acceptance criteria:** A single router function exists and is actually called by the live chat path (not just written and unused, like `OKFGraphQuery` currently is from Cerebro's perspective); `npm test` passes; manual test of 3 different question types shows 3 different data sources being consulted.

**Files touched:** new `src/core/memory/context-router.ts` (+ test), `src/server/routes/cerebro.ts`.

**Status:** VERIFIED (tests + typecheck + build + runtime multi-query verification) — completed 2026-07-01

**SCOPE EXPANSION (approved by user before this task ran):** The original plan above assumed GitNexus integration already existed via `src/core/scoutdaemon/gitnexus-worker.ts`. That was FALSE — that file is an entirely mocked stub (hardcoded fake AST, literally comments "Mocking parsing oxc-parser", unrelated dead code doing a fake AST-parser-worker-thread job). There was NO real GitNexus integration in the app. The user chose the larger-scope option: build the router AND make GitNexus integration real. So Task 7 became two things: **(A)** a real intent router wired into the live Cerebro chat path, and **(B)** a real, optional, gracefully-degrading GitNexus subprocess client as the third modality. `gitnexus-worker.ts` was left untouched (it's unrelated).

**What was built (files):**
- `src/core/memory/context-router.ts` (new) — `classifyIntent(query)` (pure keyword/regex classifier → `'code' | 'knowledge' | 'conversational'`) and `routeQuery(query, projectId?): Promise<RoutedContext[]>` where `RoutedContext = { source: 'okf'|'gitnexus'|'vector'|'none'; contextBlock: string }`.
- `src/core/memory/gitnexus-client.ts` (new) — lazy, best-effort subprocess client for `gitnexus eval-server` (Part B).
- `src/core/memory/context-router.test.ts` (new) — 6 tests (classifier + routing).
- `src/server/routes/cerebro.ts` (modified) — `/chat` handler now calls `routeQuery(message)` and prepends the returned context block(s) to `fullPrompt` (same prepend pattern as the system prompt / history), with a permanent one-line observability log showing the chosen source(s). This is the concrete gap the plan called out: `CerebroVectorStore` was never reachable from chat before; now it is (via the router's vector branch).

**Key design decisions (all pre-authorized judgment calls, documented per the brief):**
1. **OKF is NOT re-queried by the router.** `RouteSwitchEngine.execute()` already unconditionally injects OKF context into every prompt >20 chars (engine.ts:197-210), and Cerebro chat goes through that same engine — so OKF is already prepended downstream. To avoid double-fetching/double-injecting the same text, the router's `'knowledge'` branch returns `{ source: 'okf', contextBlock: '' }` (a routing marker only; the engine supplies the real block). If the engine's blind injection is ever removed, the router should start calling `OKFGraphQuery.resolveContext()` itself there. This keeps routing observable in logs without redundant work. (Documented at the top of context-router.ts.)
2. **Intent heuristic (v1, keyword/regex, ML NOT required per the plan):** code-structure language (`function`/`class`/`calls`/`imports`/`defined`/`where is`/`how does X work`/file extensions/camelCase-or-PascalCase symbol tokens) → try GitNexus; decision/preference language (`what did we decide`/`why did we choose`/`convention`/`remember`/`what's our`) → OKF; everything else → CerebroVectorStore. Code cues are checked first (most specific).
3. **GitNexus is best-effort and degrades silently.** For `'code'` intent, the router tries GitNexus; if it returns null (the common real-world case — see caveat below), it falls back to the vector store so the user still gets *some* context. Never throws, never blocks chat.
4. **Permanent (not stripped) observability logging** — a single `[CerebroChat] context router → <sources>` line per chat, plus one `[GitNexusClient]` line on first-use state changes. Kept as real observability, not debug noise.

**GitNexus client design & REAL-WORLD CAVEATS (critical for future readers):**
- `gitnexus` is an EXTERNAL CLI dev tool (v1.6.8 on this dev machine), NOT an npm dependency of this app (nothing added to `package.json` — the constraint was honored). **The vast majority of NeuroSync end users (solo/hobbyist devs installing this on their own unrelated projects) will NOT have `gitnexus` installed and their project will NOT be indexed.** This modality is therefore fully optional: if `gitnexus` is absent, the client marks itself `unavailable` on first attempt and every subsequent `'code'` query silently falls back to the vector store. Cerebro chat is never blocked or slowed after that first attempt.
- The client **lazily spawns `gitnexus eval-server` as a long-lived background child on first use only** (never at app boot — most sessions won't need it and it shouldn't risk/slow startup), waits for the `GITNEXUS_EVAL_SERVER_READY:host:port` stdout line (~2s boot), captures the `GITNEXUS_EVAL_SERVER_SHUTDOWN_TOKEN`, and reuses the running instance for all later queries. Default port 4939 (avoids colliding with a manually-run 4848 instance); override via `NEUROSYNC_GITNEXUS_PORT`.
- **Invocation resolution** mirrors `.gitnexus/run.cjs` conceptually: `spawn('gitnexus', ...)` first (fast path, global install), falling back to `spawn('npx', ['gitnexus@latest', ...])` on ENOENT. We do NOT shell out to `run.cjs` itself (it's for the `analyze` subcommand).
- **Responses are plain human-readable TEXT, not JSON** — deliberately NOT parsed; wrapped verbatim in `[CODE STRUCTURE CONTEXT — from GitNexus] ... [END CODE STRUCTURE CONTEXT]` and prepended, exactly like OKF's `formatContextForPrompt()`.
- **Repo disambiguation is a known v1 limitation.** A machine can have several repos indexed (this dev machine has 4). The client hits `/health`, and: if `NEUROSYNC_GITNEXUS_REPO` env is set → use it; else if exactly ONE repo is indexed → use it automatically (the common solo-dev case); else it CANNOT disambiguate → it shuts the eval-server back down and marks the modality unavailable. We intentionally do NOT auto-detect by matching cwd against `gitnexus list` (over-engineering for an optional feature). So on THIS 4-repo dev machine, code queries degrade to vector UNLESS `NEUROSYNC_GITNEXUS_REPO` is set — which is expected, documented behavior, not a bug.
- Under the test runner (`process.env.VITEST`) and when `NEUROSYNC_GITNEXUS_DISABLED=1`, the client short-circuits and never spawns a subprocess — so the unit tests never touch `gitnexus`.

**Verification:**
- `npm test`: 210/211 passing (was 205/206 before; +5 net from the 6 new router tests). The 1 failure is the same pre-existing, unrelated `LlamaCppProvider should format correctly` in `routeswitch.test.ts` that every prior task flagged. `npx tsc --noEmit`: clean. `npm run build`: succeeds (pre-existing chunk-size warning only).
- **Runtime multi-query verification (the plan's key acceptance criterion — 3 different question types must route to 3 different sources):** booted `npm run dev:server`, curled `POST /api/cerebro/chat` with (1) a code-structure question, (2) a knowledge/preference question, (3) a generic conversational question. Server logs confirmed DIFFERENT routing: code → GitNexus attempted (degraded to `none` on the 4-repo machine without the env override), knowledge → `okf`, conversational → `none`/`vector`. Then re-ran with `NEUROSYNC_GITNEXUS_REPO=ByteBuster-NeuroSyncOS` and confirmed the code question routed to **`gitnexus` with an 898-char code-structure block actually injected** (`[CerebroChat] context router → gitnexus (+898 chars)`), proving Part B works end-to-end when a repo is resolvable. Dev server and spawned eval-server both stopped afterward.

**Open questions / follow-ups (none block this task):**
- The GitNexus index for this repo is slightly stale (predates the cerebro chat endpoint and this task's new files; `context('injectChatEngine')` returned "not found") — a pre-existing index-freshness issue, unrelated, not fixed here. Re-run `gitnexus analyze` when convenient.
- Hard-crash orphan risk: the eval-server child is reaped on graceful exit (SIGINT/SIGTERM/`process.exit`), but an abrupt SIGKILL of NeuroSync could orphan it (minor, dev-tool-only concern). Acceptable for v1.
- Router quirk inherited, not introduced: chat still never passes `projectId`, so the engine's OKF injection stays unscoped-across-projects for chat (pre-existing, out of scope).

**Files touched:** new `src/core/memory/context-router.ts`, new `src/core/memory/gitnexus-client.ts`, new `src/core/memory/context-router.test.ts`, modified `src/server/routes/cerebro.ts`.

---

## 10. Task 8 — Real embedded terminal in PortGrid (CLI/MCP windows)

**Goal:** Let PortGrid actually host an interactive terminal session (for tools like Claude CLI, Antigravity, OpenCode) instead of just showing a decorative terminal icon.

**Why:** Confirmed zero infrastructure exists today (`grep -i "iframe|pty|xterm|terminal"` across `src/ui` and `src/core` returns only the decorative icon and the single-command `CommandSandbox`, which is not an interactive session).

**Current code:**
- `src/ui/views/PortGridDashboard.tsx:4,417` — `Terminal` icon from `lucide-react`, used decoratively only.
- `src/core/coreexec/sandbox.ts` (post-Task-5, will live at `src/core/portgrid/sandbox.ts`) — `CommandSandbox.execute()` runs ONE allowlisted command at a time via `bwrap --unshare-net`, then returns; it is not a persistent session.

**Steps (this is a from-scratch build — budget accordingly):**
1. Add `node-pty` as a new dependency (check this doesn't violate the "no paid libraries" rule — `node-pty` is free/MIT, so it's fine; it is a *new* dependency though, so flag it to the user before installing since the spec says "no external databases or paid libraries" but doesn't explicitly bless new free npm packages — safer to confirm first).
2. Add a WebSocket endpoint (Hono supports WS via `@hono/node-server`'s upgrade handling, or a small dedicated `ws` server alongside it — check what's already available in `package.json` dependencies first) that spawns a `node-pty` process **scoped to the same allowlist as `CommandSandbox`** — do not give the terminal unrestricted shell access; this must still honor the Zero-Trust boundary already established.
3. Add an `xterm.js` panel component in `PortGridDashboard.tsx` that connects to that WebSocket and renders the terminal.
4. Gate this behind the existing project-scoped sandboxing (`CommandSandbox.resolveCwd(projectId)`) so a terminal session is always locked to one project's directory, matching the existing security model.

**Testing:**
- Manual: open PortGrid, open a terminal panel, run an allowlisted command (e.g. `ls`), confirm output renders; attempt a disallowed command or shell injection character, confirm it's rejected the same way `CommandSandbox` already rejects it today.
- Add a test for the new WebSocket handler's allowlist enforcement, mirroring `src/core/coreexec/sandbox.test.ts`'s existing test patterns for rejection cases.

**Acceptance criteria:** A real, working terminal panel exists in PortGrid; it enforces the same allowlist/sandboxing as the rest of the app; `npm test` passes.

**Files touched:** `package.json` (new dependency, confirm with user first), new WebSocket handler file (location TBD — likely `src/server/`), `src/ui/views/PortGridDashboard.tsx`, new xterm panel component.

**Status:** VERIFIED (tests + typecheck + build + empirical containment proof + end-to-end WebSocket runtime) — completed 2026-07-01

**IMPORTANT — the plan text above (steps 1-4) is STALE and was overridden by fresh research + explicit user decisions.** Two things changed: (a) the user explicitly approved a **full interactive shell with NO allowlist**, sandboxed by **directory + network only** — a deliberate, informed tradeoff to make the terminal actually useful for real CLI tools (Claude CLI, OpenCode, etc.), dropping the command-allowlist model used elsewhere; (b) new dependencies were pre-approved by the user. So step 2's "scoped to the same allowlist as CommandSandbox" was explicitly reversed. What was actually built is documented below.

### Why the existing CommandSandbox bwrap pattern could NOT be reused (critical finding)
`CommandSandbox.execute()` (`src/core/portgrid/sandbox.ts:97`) spawns via:
```
bwrap --unshare-net --dev-bind / / <cmd> ...
```
**`--dev-bind / /` binds the ENTIRE host filesystem read-write into the sandbox — it provides ZERO filesystem containment.** CommandSandbox is only safe because of two OTHER layers: (a) its ~20-command read-only allowlist, and (b) `PathValidator.validateContainment()` rejecting file *arguments* outside `baseDir`. The bwrap flags themselves only contribute network isolation. Since the user approved a real shell with no allowlist, neither layer is available (you cannot pre-validate arbitrary interactive keystrokes), so **directory containment had to come from bwrap itself doing real filesystem confinement** — which the CommandSandbox invocation does not do. Copying it would have produced a full-host-read-write shell. `CommandSandbox`/`sandbox.ts` was NOT modified (it's still used correctly by `scraping.ts`/`worker.ts`/`dispatch.ts`).

### The hardened bwrap recipe actually landed (`src/core/portgrid/terminal-session.ts` → `buildBwrapArgs`)
```
bwrap --ro-bind /usr /usr \
      --symlink usr/bin /bin --symlink usr/lib /lib --symlink usr/lib64 /lib64 \
      --ro-bind /etc /etc \
      --proc /proc --dev /dev --tmpfs /tmp \
      --bind <projectDir> <projectDir> --chdir <projectDir> \
      --clearenv \
      --setenv HOME <projectDir> --setenv PWD <projectDir> \
      --setenv PATH /usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
      --setenv TERM <term> --setenv USER <user> --setenv LOGNAME <user> \
      --setenv LANG <lang> --setenv SHELL <shell> \
      --unshare-net --unshare-pid --die-with-parent \
      -- <shell>
```
Key differences from CommandSandbox's recipe and design notes:
- **`--ro-bind /usr` + `--ro-bind /etc` only** (read-only) instead of `--dev-bind / /`. Merged-`/usr` host layout means `/bin`,`/lib`,`/lib64` are provided as `--symlink`s into `/usr`.
- **The project directory is the SINGLE writable host bind** (`--bind <projectDir>`). Ordering matters: `--proc`/`--dev`/`--tmpfs` are declared *before* the project bind so that even if a project lived under `/tmp`, the read-write project bind is layered last and wins (an early test where the project was under `/tmp` failed with "Can't chdir" precisely because `--tmpfs /tmp` had overlaid it — fixed by this ordering).
- **`--clearenv` + minimal `--setenv`** — added beyond the brief's recipe as a hardening improvement: wipes the server process's inherited environment (which can contain decrypted provider API keys) so it never leaks into an interactive shell the user runs arbitrary tools in. `HOME` is set to the project dir, not the real host home.
- **`--unshare-net`** removes network; **`--unshare-pid`** hides host processes; **`--die-with-parent`** guarantees the bwrap+shell tree is SIGKILLed if the NeuroSync server dies (proven below — no orphans even on abrupt server kill).
- `--ro-bind /etc` is safe: `/etc/shadow` stays unreadable because the session runs as the same non-root uid (verified below). Only auto-created empty scaffolding parent dirs of the project bind (e.g. an empty `/home/<user>`) are visible under host paths — the real home contents are not.

### Empirical containment proof (actual command output — run through the FULL server + WebSocket path against a real project)
```
$ pwd                                            → /home/.../termtest-sandbox     (confined to project)
$ ls                                             → hello.txt  nf.txt              (project files)
$ echo written > wtest.txt && cat wtest.txt      → written                        (writes work in-project)
$ stty size                                      → 30 100                         (resize propagated over WS)
$ cat /etc/shadow; echo SHADOW_EXIT=$?           → cat: /etc/shadow: Permission denied / SHADOW_EXIT=1
$ ls ~/.ssh 2>&1; echo SSH_EXIT=$?               → No such file or directory / SSH_EXIT=2   (outside project)
$ cat <neurosync-repo>/package.json              → No such file or directory      (repo not bound)
$ curl -sS -m3 https://example.com; echo $?      → curl: (6) Could not resolve host / exit 6  (network cut)
$ getent hosts example.com; echo DNS_EXIT=$?     → (no output) / DNS_EXIT=2                    (DNS cut)
```
**Real directory + network containment was ACHIEVED and PROVEN**, both via a direct `bwrap` script and via the live `node-pty`→bwrap→WebSocket path. Session cleanup proven: bwrap process exits and is removed from the registry on WS close (0 orphans); and killing the server with `SIGKILL` while a session held a `sleep 300` left **zero** orphan bwrap processes (proves `--die-with-parent`).

### New dependencies added (all pre-approved by user, all MIT)
- `node-pty@^1.1.0` (PTY spawning; native binding — installed via prebuilt binary, loads + spawns fine on Node v24.16.0 / this host).
- `@hono/node-ws@^1.3.1` (WebSocket support; the app had zero WS infra). **Peer-dep note:** it peer-depends on `@hono/node-server@^1.19.11` but the app is on `2.0.6`, so it was installed with `--legacy-peer-deps`. Verified this is cosmetic: `serve()` (node-server 2.x) returns a native `http.Server`, which is exactly what `injectWebSocket(server)` accepts — the WS route works end-to-end.
- `@xterm/xterm@^6.0.0` + `@xterm/addon-fit@^0.11.0` (frontend terminal rendering + resize fit).

### Architecture / files
- **`src/core/portgrid/terminal-session.ts`** (new) — `TerminalSession` class + `createTerminalSession(projectId)` factory. Resolves the project dir via the existing `CommandSandbox.resolveCwd(projectId)` (reused, not reimplemented), spawns `bwrap` (the hardened recipe) under `node-pty`. Global `terminalSessions` registry, 15-minute idle timeout (kills on no input), `dispose()` on close, and `installTerminalShutdownHooks()` reaping all sessions on server exit/SIGINT/SIGTERM.
- **`src/core/portgrid/terminal-session.test.ts`** (new) — 9 tests: 6 assert the hardened recipe (notably **`--dev-bind / /` is absent**, `--unshare-net`/`--clearenv`/single project `--bind` present); 1 availability guard; 2 bwrap-gated empirical containment tests (skip automatically where bwrap is absent).
- **`src/server/index.ts`** (modified) — added `createNodeWebSocket({ app })`, a `GET /api/portgrid/terminal/:projectId` `upgradeWebSocket` route (PTY `onData`→`ws.send`, `ws` message→PTY, JSON `{type:'resize'|'input'}` control envelope), captured the `serve()` return into `const server` and called `injectWebSocket(server)`. The route lives under `/api/`, so it inherits the app's existing auth middleware posture (no shared auth logic was touched).
- **`src/ui/components/EmbeddedTerminal.tsx`** (new) — `@xterm/xterm` + `@xterm/addon-fit`, connects to `ws://localhost:3743/api/portgrid/terminal/:projectId`, streams I/O, sends resize on fit/window-resize, disposes cleanly on unmount.
- **`src/ui/views/PortGridDashboard.tsx`** (modified) — new "Embedded Terminal" section in `DashboardView` with an Open/Close Terminal button (disabled until a project is selected), rendering `<EmbeddedTerminal>` in a 360px panel styled with the dashboard's own `GLOW_BOX`/`ACCENT` conventions. **Human-only:** the session starts solely on this explicit button click — never auto-launched by any agent path, consistent with the "AI actions stay draft-only" ground rule.

### Verification summary
- `npm test`: **219/220** (was 210/211; +9 from the new terminal tests). The single failure is the same pre-existing, unrelated `LlamaCppProvider should format correctly` in `routeswitch.test.ts` every prior task flagged. `npx tsc --noEmit`: clean. `npm run build`: succeeds (xterm bundled; only the pre-existing chunk-size warning).
- Functional test done via a raw `ws` client against the live `dev:server` (the brief explicitly permits this over a headless browser round-trip) — it exercises the identical server-side path a browser would. Full browser click-through was NOT performed; the frontend is a thin xterm→WS wrapper over the fully-proven endpoint and builds cleanly.
- All test artifacts removed (the `term-e2e-test` project row deleted from `.data/neurosync.db`, the temp sandbox dir removed); final sweep shows zero orphan bwrap/server processes.

**Open questions / flags (none block the task):**
- `@hono/node-ws` required `--legacy-peer-deps` (cosmetic peer range, verified working). If `@hono/node-server` is ever upgraded/downgraded, re-verify `injectWebSocket` still accepts the `serve()` return.
- Auth: the WS endpoint inherits the app's existing (presence-only, open-when-unconfigured) auth posture like every other `/api/` route; browsers can't set WS `Authorization` headers, so if a real token model is added later, the terminal WS will need a query-param token path. Out of scope now.
- Requires `bwrap` on the host. `isBwrapAvailable()` guards it and the session fails with a clear in-terminal message if absent (end users without bubblewrap won't get a terminal — acceptable/documented).

---

## 11. Task 9 — Developer Mode toggle + 6th-grade default copy

**Goal:** Add a real global on/off switch that reveals raw/technical output, defaulting to a plain-language mode for everyone else.

**Why:** Confirmed only one marketing sentence exists today (`PortGridDashboard.tsx:510`) claiming this feature — no actual toggle, no actual simplified copy system.

**Current code (pattern to copy):**
- `src/ui/components/ThemeContext.tsx` — full working example of a global React Context + `localStorage` persistence pattern (`ns-theme` key) that this task should mirror almost exactly.
- `src/server/routes/system.ts:73-93,99-105` — `GET/POST /api/system/settings`, backed by the generic `system_settings` key-value table (`db.ts:108-111`). This is already the established pattern for storing global boolean flags (it already stores `smart_tips`, `reduced_motion`, `aria_enforcement`, `env_stripping`, etc. — see `PortGridDashboard.tsx:398` `saveSettings()`). Adding a `developer_mode` key here requires zero new backend infrastructure.

**Steps:**
1. Create `src/ui/components/DeveloperModeContext.tsx`, copying `ThemeContext.tsx`'s structure: a context provider exposing `isDeveloperMode: boolean` and `setDeveloperMode(v: boolean)`, persisted via `localStorage` (mirror the `ns-theme` key pattern, e.g. `ns-developer-mode`) AND synced to `system_settings` via the existing `/api/system/settings` endpoint (so it round-trips correctly if `localStorage` is cleared).
2. Wrap the app root (find where `ThemeProvider` wraps the app — likely `src/ui/main.tsx` or `App.tsx` — and add `DeveloperModeProvider` alongside it).
3. Add a toggle switch UI somewhere global (e.g. next to the existing `ThemeToggle` pattern, in the app shell/header) — note `ThemeToggle.tsx` was flagged as a zero-import orphan in the audit (Task 10 below); check if it's actually rendered anywhere before copying its pattern, and fix that orphan status while you're at it if it makes sense to combine the two toggles into one settings menu.
4. Find every place that currently renders raw JSON, stack traces, or technical jargon (search for likely candidates: `JSON.stringify` calls in UI components, error message displays, `NodeOutputInspector.tsx` if it exists per the earlier audit note) and wrap them in `{isDeveloperMode ? <RawView/> : <SimpleView/>}`.
5. Write the plain-language versions. Concrete example already given by the spec itself: replace `"Agent requires fs.read access"` with `"The AI needs permission to read your files."` Apply the same translation pattern to whatever technical strings are found in step 4.

**Testing:**
- Manual: toggle Developer Mode on/off, confirm raw JSON/technical views appear/disappear; refresh the page, confirm the setting persisted; check `system_settings` table has a `developer_mode` row after toggling.
- No complex logic here, so a full test suite addition isn't critical, but add a basic render test if the project has any existing component test patterns to follow (check for `.test.tsx` files under `src/ui/`).

**Acceptance criteria:** A real toggle exists, persists across reloads, and actually changes what's shown in at least the highest-traffic technical-output locations found in step 4.

**Files touched:** new `src/ui/components/DeveloperModeContext.tsx`, wherever the app root wraps providers, and every UI location updated in step 4.

**Status:** VERIFIED (tests + typecheck + build + independent browser confirmation)
**Notes:** Implemented essentially exactly per plan, no deviations of substance. The implementing session hit its usage limit mid-manual-verification (after finishing all code changes) and never got to update this doc or report back — the orchestrating session picked this up cold via `git status`/`git diff` (exactly the recovery path this doc is designed for) and completed verification directly.

**What was built:**
- `src/ui/components/DeveloperModeContext.tsx` — new file, mirrors `ThemeContext.tsx` exactly: `DeveloperModeProvider` + `useDeveloperMode()`, `localStorage` key `ns-developer-mode`, fire-and-forget sync to `/api/system/settings` under `developer_mode`, with a fallback fetch on mount if `localStorage` is empty (round-trips correctly even if cleared).
- Wrapped in `src/ui/main.tsx` alongside `ThemeProvider`.
- **The toggle control was added to `src/ui/components/AppShell.tsx`** — this was the right call: `AppShell` is the actual shared shell rendered by every single dashboard (confirmed via its own theme toggle already living there), so this makes Developer Mode genuinely global, visible on every screen, not just one view. `ThemeToggle.tsx` (the orphaned file) was correctly left alone/untouched — the implementer correctly identified that `AppShell.tsx` is the *real* live theme control, not the orphan file, and placed the new toggle right next to it (a `Code2` icon from lucide-react, cyan-highlighted when active, with proper `aria-label`/`aria-pressed`/`title` attributes).
- **4 technical-output locations gated**, all confirmed live/rendered (not orphans) before editing:
  1. `ScopeLogicDashboard.tsx` — raw DAG proposal JSON: dev-off shows "Turn on Developer Mode (top-right icon) to see the technical details behind this plan."
  2. `NodeOutputInspector.tsx` — raw node output/error JSON: dev-off shows "This step produced a result. Turn on Developer Mode (top-right icon) to see the raw output." / "Something went wrong with this step. Turn on Developer Mode (top-right icon) to see the technical error."
  3. `IntentPreview.tsx` — raw task output.
  4. Raw `err.message`/`data.error` strings in `RouteSwitchConfig.tsx`, `RoutingDials.tsx`, `ScopeLogicChat.tsx`, `SettingsModal.tsx` (4 separate call sites) — all replaced with something like "Could not save. Please try again." by default, full technical message only shown when Developer Mode is on.
- **Bonus, not requested but a good catch:** while touching `RoutingDials.tsx`, the implementer noticed it still posted/read the legacy `scoutlogic_priority` settings key (Task 6 had already renamed the *displayed* heading to "Model Selection Priority" but this settings key itself was untouched at the time) and migrated it to `model_selector_priority`, with a backward-compatible read fallback to the old key — consistent with Task 6's own legacy-fallback pattern for the same reason.
- `smart_tips` was intentionally left as-is (correctly identified as a different, complementary concept — simplify-with-tooltips vs. reveal-raw-output — not merged).

**Verification (performed directly by the orchestrating session after the interrupted fork):**
- Found and cleaned up one hygiene issue from the *previous* task's (Task 8) testing debris: an untracked `_hold.cjs` script at the repo root (a raw WS test client left over from Task 8's terminal testing) and several `dev:server`/`dev:ui` processes the interrupted fork had started for its own manual verification and never stopped. Confirmed no actual orphaned processes were spawned by `_hold.cjs` itself (it was never left running); deleted the file and killed the leftover dev servers.
- `npm test`: 219/220 (same single pre-existing, unrelated `llama-cpp` failure every task this session has seen).
- `npx tsc --noEmit`: clean.
- `npm run build`: succeeds.
- **Live browser verification** (not just re-reading the diff): opened the app, confirmed the Developer Mode icon renders in the header, already ON (picked up the value the interrupted fork's own testing had persisted to `system_settings` — good proof the server round-trip works even across a fresh tab with empty `localStorage`); clicked it, confirmed the icon visually toggles active/inactive; confirmed via `curl /api/system/settings` that the change persisted server-side (`developer_mode: false`). Checked browser console: zero new errors, only the same pre-existing unrelated `ProjectSwitcher` hydration warning already flagged earlier this session.
- No confidence-below-0.70 issues from either the interrupted fork's completed work or the orchestrating session's follow-up verification.

---

## 12. Task 10 — Delete or wire in 6 orphaned components

**Goal:** Stop carrying dead UI code.

**Current list (re-verify with a fresh grep before acting, since new work may have started using one of these since the audit was written on 2026-06-30):**
```
grep -rL "AgentKPIStrip\|CerebroHealthWidget\|GovernorUI\|LearningApprovalsQueue\|ProjectManager\|ThemeToggle" src/ui/**/*.tsx
```
(Re-run the actual check used in the audit — search for each component name across all `.tsx` files, confirm zero importers outside the component's own file, before deleting.)

**Steps:** For each of the 6 (`AgentKPIStrip.tsx`, `CerebroHealthWidget.tsx`, `GovernorUI.tsx`, `LearningApprovalsQueue.tsx`, `ProjectManager.tsx`, `ThemeToggle.tsx`): decide per-component whether it should be wired into a dashboard (if the feature it represents is still wanted) or deleted (if superseded/abandoned). `ThemeToggle.tsx` in particular may get resolved naturally by Task 9 (combine with the new Developer Mode toggle into one settings control) — check Task 9's status before acting on this one.

**Testing:** `npm test` and `npm run build` after each deletion, one at a time, not all six at once.

**Acceptance criteria:** Each of the 6 is either visibly rendered somewhere in the running app, or removed from the codebase.

**Status:** VERIFIED (tests + typecheck + build + browser confirmed)
**Notes:** GitNexus's index was stale (still referenced `src/ui-next/` files Task 4 already deleted) — re-ran `node .gitnexus/run.cjs analyze` (succeeded: 2,439 nodes, 4,642 edges) before using it for this task's caller-checks; cross-verified every gitnexus-impact result with a direct grep regardless. Read all 6 components' actual code plus the actual content of the dashboards that might already duplicate them, rather than deciding from names alone — this changed 2 of the original hint-based guesses:

**Deleted (4) — confirmed genuinely redundant, not just guessed:**
- `CerebroHealthWidget.tsx` — `CerebroDashboard.tsx` already has its own inline health widget hitting the exact same `/api/cerebro/health` endpoint (lines 25,39-42,145-147,161) — pure duplication.
- `LearningApprovalsQueue.tsx` — `CerebroDashboard.tsx` already has its own inline "Learning Approvals (Epistemic Gatekeeper)" widget hitting the exact same `/api/cerebro/learning-approvals` + approve/reject endpoints (lines 75-103) — pure duplication. (The original plan's hint guessed this was a real gap — it wasn't; reading the actual dashboard content overturned that guess.)
- `ProjectManager.tsx` — `ProjectSwitcher.tsx` already has real, live project creation (`handleCreate`, "New Workspace" button) plus more (project_root_path editing) that this component doesn't have — superseded.
- `ThemeToggle.tsx` — confirmed redundant with the real, live toggle already inline in `AppShell.tsx` (added there during Task 9).

**Wired in (2) — confirmed real gaps, no duplication found anywhere:**
- `AgentKPIStrip.tsx` → added to `CoreExecDashboard.tsx`'s Dashboard view as a new "Worker Pool Telemetry" section (Widget F), consuming the real `/api/system/metrics` SSE stream.
- `GovernorUI.tsx` → added to `CoreExecDashboard.tsx`'s Set-up view, right after the existing "Engine Tuning & Dynamic Threading" (`AutonomyDials`) section. These are NOT duplicates despite similar-sounding headers: `AutonomyDials` controls unrelated Budget%/Autonomy% settings via generic `/api/system/settings`; `GovernorUI` is real-time CPU temp/utilization/worker-thread-count telemetry with actual enforcement via `/api/system/config` — a genuine, previously-unfilled gap that the existing section's own descriptive text ("Controls the worker thread pool size... thermal warning") was already promising but not delivering.

**Bug found and fixed while wiring in (both orphans had never been live before, so this bug was never triggered until now):** `AgentKPIStrip.tsx` and `GovernorUI.tsx` both used relative `EventSource('/api/system/metrics')`/`fetch('/api/system/config')` calls — the same bug class as `NotificationCenter.tsx` had in Task 3 (Vite has no `/api` proxy, so relative URLs hit the dev server and get back `index.html` instead of JSON/SSE). Fixed both with the established `const API = 'http://localhost:3743'` prefix pattern. Verified fixed via a full page reload + fresh console check: zero SyntaxError/DOCTYPE errors afterward, and both widgets render real live data (confirmed consistent: both independently report "Max Workers: 7").

**Verification:** `npm test`: 219/220 stable baseline (one pre-existing unrelated `llama-cpp` failure). Also discovered `src/core/memory/context-router.test.ts` (a Task 7 test) is intermittently flaky — alternates between passing and failing with a `SqliteError: no such table: cerebro_memories_meta` across identical repeated runs with zero code changes in between — confirmed via 5 repeated runs this is pre-existing flakiness unrelated to Task 10 (different subsystem entirely), not a regression from anything touched here. Flagging as a known pre-existing issue, out of this task's scope to fix. `npx tsc --noEmit`: clean. `npm run build`: succeeds. `mcp__gitnexus__detect_changes`: footprint matched expectations exactly (aggregate "critical" reading is the whole session's dirty tree, same as every prior task).

**Manual browser verification performed** (not just curl): opened both the Dashboard and Set-up views in a real browser, confirmed "Worker Pool Telemetry" and "OS Resource Governor" both render with real, live, mutually-consistent data. CPU Core Temp shows 0.0°C — likely a sandboxed/containerized environment lacking real thermal sensors (via the `systeminformation` package), not a wiring defect; the rest of the telemetry (utilization, worker counts) is correct and live.

No confidence-below-0.70 escalations.

---

## 13. Task 11 — Per-project `neurosync-config.yaml`

**Goal:** Give each project a human-readable, hand-editable config file in its own `.neurosync/` folder, alongside the database, so a project's identity/config travels with the folder if copied to another machine.

**Why:** The Master Spec's Tier-1 folder structure names this file explicitly. Before this task, all project settings lived only in SQLite — nothing was ever written to disk as a portable, human-readable file. The user confirmed (2026-07-01) they still want this built, choosing file-plus-database over database-only.

**What was built:**
- `src/core/basevault/project-config-file.ts` (new) — `writeProjectConfigYaml()` and `readProjectConfigYaml()`. Uses the `yaml` npm package (added as a new dependency; required `--legacy-peer-deps` to install due to the same `@hono/node-ws`/`@hono/node-server` peer-range mismatch Task 8 already hit and documented — cosmetic, not a real conflict). Writes `<project_root_path>/.neurosync/neurosync-config.yaml` containing `id`, `name`, `created_at` (as an ISO string, not a raw epoch — this file is meant to be human-read/edited) and `version: 1`. Deliberately excludes `workspace_path` (internal bookkeeping, not portable/human-relevant). Both functions are non-fatal/best-effort: a project with no `project_root_path` is silently skipped on write; a missing/corrupt file returns `null` on read rather than throwing — matching this codebase's established pattern for filesystem side-effects (e.g. OKF context injection).
- Wired into `src/server/routes/projects.ts`: `POST /` now writes the file after a successful DB insert, and also **reads** any pre-existing config file at the target `project_root_path` before creating the project — if the caller didn't explicitly supply a `name`, the file's `name` is used instead of the `'Untitled Project'` default. `PUT /:id` writes the file again after any successful update, keeping it in sync.
- **Judgment call, resolved and tested:** whether to reuse an imported file's `id` for the new local DB row, or always mint a fresh one. Decided: **always mint a fresh local `id`, never reuse a foreign one.** The local `id` is a SQLite `PRIMARY KEY` referenced by many other tables (workflows, tasks, okf_nodes, llm_routing_rules, etc.) on a single shared local database serving potentially many projects — accepting an externally-sourced primary key directly risks real collisions (e.g. two independently-copied project folders, or a template folder copied to start multiple new projects, could carry the same `id`). The `name` (the actual human-meaningful, portable content) is still honored on import; only the internal identity stays under local control. If a genuinely stable cross-machine identity is wanted later, that would need a separate `external_id` column distinct from the primary key — out of scope here.
- New tests: `src/core/basevault/project-config-file.test.ts` (5 tests — write/read round-trip, skip-when-no-root-path, missing file returns null, corrupt file returns null not a throw, overwrite-on-update).

**Testing:**
- `npm test`: 224/225 (+5 new; the 1 failure is the same pre-existing, unrelated `llama-cpp` one every task this session has seen).
- `npx tsc --noEmit`: clean. `npm run build`: succeeds.
- Manual, end-to-end, against a real running server (`npm run dev:server`) and real temp directories: (1) created a project via `POST /api/projects` with a real `project_root_path` — confirmed the YAML file appeared on disk with correct, clean content; (2) renamed it via `PUT /:id` — confirmed the file updated to match; (3) pre-placed a `neurosync-config.yaml` (with a distinct name and a foreign `id`) in a fresh directory, then `POST`ed a new project pointing at it with no `name` in the request body — confirmed the created project's name matched the file's `name`, while its `id` was a freshly-generated one, not the foreign file's `id` (confirming the judgment call above works as designed, not just as documented). All test projects/directories cleaned up from both the real `.data/neurosync.db` and disk afterward; dev server stopped.
- `mcp__gitnexus__detect_changes` (repo re-indexed fresh today before this task started): confirmed `projectsRouter`'s footprint matched expectations exactly — no surprises. The large "critical" risk reading is the whole dirty working tree (all 10 prior tasks plus pre-existing unrelated work), not a signal specific to this task.

**Status:** VERIFIED (tests + typecheck + build + manual write/update/import verification)
**Notes:** This is the last task in the 11-task plan. No confidence-below-0.70 issues.

---

## 14. Progress Log (append a new entry every session — do not overwrite old entries)

### 2026-06-30 — Initial plan created
- Ran the full reality audit (see `docs/sovereign-os-reality-audit-2026-06-30.md`).
- User clarified: PortGrid and CoreExec dashboards must never be merged (Task 5 revised accordingly — it's a backend-only reorg now, dashboards untouched).
- User clarified confusion about "ScoutLogic" — confirmed via `grep` that it's a RouteSwitch-only private helper, not a 7th module (Task 6).
- Verified exact current code state for every task in this document via direct file reads (not guessing) — see each task's "Current code" section for citations current as of this date.
- Confirmed via grep: `src/ui-next/`'s `TaskQueue.tsx` calls `/api/scout/approve` and `/api/scout/reject`, which do not exist in the server — Task 3 must wire the ported UI to the real `/api/todos` endpoints instead, not copy the dead prototype's networking code as-is. This was a new finding not in the original audit — worth flagging to anyone resuming, since copy-pasting the prototype's fetch calls verbatim would silently fail.
- **No code has been changed yet.** All 11 tasks are `NOT STARTED`. Next session should start with Task 1 (numeric confidence) since Tasks 2 and 3 both depend on it.

### 2026-07-01 — Task 1 completed and verified
- User approved implementation with agents; instructed to use GitNexus impact/blast-radius analysis before edits (per this project's CLAUDE.md), use the strongest applicable skills, escalate to a higher-reasoning model for hard problems, and self-check confidence — stopping to ask the user if confidence on any undocumented judgment call drops below 0.70.
- Ran `mcp__gitnexus__impact` on `RouteSwitchEngine` (upstream) and `ConsensusSynthesizer` (upstream) before editing — both LOW risk, small direct-caller counts. Ran `mcp__gitnexus__context` on `executeCouncilMode` for the exact call site.
- Implemented Task 1 exactly per the tracker's spec: `src/core/routeswitch/council.ts` and `src/core/routeswitch/engine.ts` confidence fields changed from `'High'|'Medium'|'Low'` to `number` (0.0–1.0); `_executeWithProvider`'s discretization replaced with a continuous formula; `council.ts`'s two-if-statement ladder replaced with `1 - Math.min(maxDiff, 1)`.
- Grep confirmed no other file in the repo read confidence as a string — blast radius was smaller than the plan anticipated (contained entirely to `engine.ts` + `council.ts`).
- Added 2 new tests to `council.test.ts` covering the numeric confidence ranges. Full suite: 203/204 passing. The 1 failure (`LlamaCppProvider should format correctly`) is pre-existing and unrelated — confirmed via `git diff --stat` that `llama-cpp.ts` was already modified before this task started; not touched by this change; left alone as out of scope.
- Ran `mcp__gitnexus__detect_changes` — confirmed the change's actual blast radius matches exactly the two council-mode execution flows, no surprises.
- No confidence-below-0.70 situations arose; nothing needed to be escalated to the user mid-task.
- **Task 1 is VERIFIED. Task 2 (add `confidence` column to `os_todos`) is now unblocked and is the next task to pick up.**

### 2026-07-01 — Task 2 completed and verified
- Ran `mcp__gitnexus__query`/`impact` first to find the exact `os_todos` insert-path symbols (`escalateBlockedDAGToOsTodos` and `insertBlocked` in `src/core/coreexec/validateDAG.ts`) and confirm LOW risk before editing.
- Implemented per plan: idempotent `ALTER TABLE os_todos ADD COLUMN confidence REAL NOT NULL DEFAULT 0.5` in `db.ts`; found and fixed a **3rd** insert site the plan didn't name (`src/core/coreexec/engine.ts:138`, worker-failure path); judgment call (pre-authorized, not escalated): the two deterministic-failure insert paths get `confidence: 0.0` (no real AI judgment exists there, and 0.0 correctly forces permanent human review), while `/promote` (the actual AI-discovery path) gets a real optional numeric field defaulting to 0.5.
- Migration added as an ALTER-only statement (matching the existing `project_root_path` migration's style, not the older dual CREATE+ALTER pattern). Both frontend `OsTodo` TS interfaces (`PortGridDashboard.tsx` and `NotificationCenter.tsx`) updated to include `confidence: number`, ready for Task 3.
- Tests: 204/205 (same pre-existing unrelated failure as Task 1). Verified the migration against the real on-disk `.data/neurosync.db`, not just a fresh test DB — applied cleanly, no crash.
- Gap noted, not fixed (out of this task's scope, worth a follow-up): no test file exists for `src/server/routes/todos.ts` at all — the `/promote` route's confidence-handling has no direct test coverage.
- Flagged to the user: `detect_changes` showed 25 files changed / "critical" risk, but that's the whole dirty working tree including ~10 files modified before this session even started, unrelated to the plan. User chose to pause and have this pre-existing work reviewed separately (see next entry) before continuing.
- **Task 2 is VERIFIED. Task 3 is now unblocked.**

### 2026-07-01 — Pre-existing uncommitted work reviewed (side investigation, no plan code touched)
- Per user's request, ran a read-only review fork of the ~14 files that were modified before this session started (unrelated to the 11-task plan), plus the 4 files where pre-existing work and Task 1/2 changes landed in the same file.
- Verdict: coherent, intentional, safe. Three groups: (1) a "Project Root Directory Mapping" feature by a prior agent session ("Kiro," dated 2026-06-26 per `docs/ui-backend-sync-plan_working.md`) adding validated `project_root_path` support, `worktree.ts` quarantine wiring, and `ProjectSwitcher.tsx` UI for it — genuinely defensive validation (null-byte checks, absolute-path enforcement, forbidden-dir blocklist); (2) OKF subsystem wiring, matching what the reality audit already called active/coherent/in-progress; (3) a cosmetic placeholder-path fix. One item looked unfinished but is a deliberate, clearly-labeled stub (`llama-cpp.ts`'s real `node-llama-cpp` binding, commented out pending that native dependency being installed, with a working dev-mode fallback) — nothing calls the dead path, not a risk.
- No collisions found between the pre-existing work and Task 1/2's changes in the 4 shared files (separate `ALTER TABLE` blocks, cleanly interleaved function calls).
- User decided to continue the plan and defer any commit-splitting decision to later.

### 2026-07-01 — Task 3 completed and verified (including a follow-up browser pass)
- Ran `mcp__gitnexus__impact` on `PortGridDashboard` (LOW risk, contained to its own process tree) before editing.
- Implemented per plan: new `src/ui/components/DeferenceUI.tsx` (live app, not a `ui-next` edit), styled to match `PortGridDashboard.tsx`'s actual established look rather than `ui-next`'s CSS variables (which do exist in `src/ui/index.css` but are used by zero live components — dead CSS, correctly not revived). Added `POST /api/todos/resolve-bulk` (transactional). `PortGridDashboard.tsx` now splits `approvalQueue` at `DEFERENCE_THRESHOLD = 0.70`; low-confidence items keep the (relabeled) "Attention Required — HITL Approval Queue"; high-confidence items get the new pill bar.
- Initial verification by the implementing fork was curl/API-only (no browser tool in its environment) — 4 test todos seeded across the threshold, bulk-resolve confirmed correct via API responses, test data cleaned up.
- **Follow-up (same day, done directly in the main session using Chrome DevTools browser automation):** performed the visual/DOM verification the fork had recommended. Confirmed on-screen: low-confidence item correctly isolated in the "Attention Required" list; pill bar correctly reading "1 high-confidence task pending"; clicking "Approve" on the pill bar correctly resolved the item (disappeared, confirmed via API that only the low-confidence item remained open). No console errors from the Deference UI feature itself.
- **Found and fixed (user-approved, small, in the same feature area) a pre-existing bug unrelated to Task 3's own code:** `src/ui/components/NotificationCenter.tsx` was polling `/api/todos` and `/api/todos/resolve` with relative URLs, which silently failed in dev mode (Vite has no `/api` proxy configured, so it served back `index.html` instead of JSON — a repeating console error every 10s). Fixed by adding the same `const API = 'http://localhost:3743'` prefix pattern already used in 5 other components. Verified fixed with a fresh reload + full poll-cycle wait; re-ran `npm test` afterward, still 204/205 (same pre-existing unrelated failure) — fix caused no regressions.
- **Found but did NOT fix (flagged only, out of scope):** a separate pre-existing React hydration warning in `ProjectSwitcher.tsx` (nested `<button>` inside `<button>` for the "Edit project" icon) — part of the already-reviewed pre-existing work, not a functional break, left untouched pending user direction.
- All test data removed from the real `.data/neurosync.db`; both dev servers stopped after verification.
- **Task 3 is VERIFIED, now including manual browser confirmation. Task 4 (delete `src/ui-next/`) is unblocked and is the next task to pick up.**

### 2026-07-01 — Task 4 completed and verified
- Confirmed via `mcp__gitnexus__impact` (target not found — already excluded from the indexed graph) and a repo-wide grep that the only references to `ui-next` outside its own directory were two build-exclusion entries.
- Deleted `src/ui-next/` (`rm -rf`) — 23 files, all tracked in git and unmodified beforehand, so fully recoverable via git history if ever needed; shows as 23 deletions in `git status`, not committed.
- Removed the now-dangling exclusion entries: `vite.config.ts`'s `optimizeDeps.exclude: ['src/ui-next']` and `tsconfig.json`'s `"exclude": ["src/ui-next", "docs"]` (now just `["docs"]`).
- `npm test`: 204/205 (same pre-existing unrelated failure). `npm run build`: succeeds (pre-existing, unrelated "chunk >500kB" warning only).
- **Task 4 is VERIFIED. Tasks 1-4 (the full Deference UI chain) are now complete. Task 5 (splitting the coreexec/portgrid backend) or Task 6 (renaming scoutlogic) are next — both are independent, low-risk, mechanical tasks.**

### 2026-07-01 — Task 5 completed and verified
- Ran `mcp__gitnexus__impact` on `CommandSandbox` before editing (MEDIUM risk, 5 direct callers) plus a direct grep to get the exact, corrected importer list — the plan's original guess ("dispatch.ts, path-validator.ts") was incomplete.
- Moved `src/core/coreexec/sandbox.ts` + `sandbox.test.ts` to `src/core/portgrid/` via `git mv` (preserves rename history). Fixed the 3 real importers (`scraping.ts`, `worker.ts`, `dispatch.ts`) to import from `../portgrid/sandbox`. `worker.test.ts` only mentioned `CommandSandbox` in a string, not a real import — nothing to fix there.
- **Found and fixed an import break the plan didn't anticipate:** `sandbox.ts` itself imports `PathValidator` from `./path-validator`, which stayed behind in `coreexec/` — updated to `../coreexec/path-validator`. Its `require('../basevault/db')` needed no change (same relative depth from either directory).
- PortGrid and CoreExec dashboard files were not touched at all — confirmed via git diff, consistent with the user's hard requirement that they never be merged.
- Verification: `npm test` (204/205, same pre-existing unrelated failure), `npx tsc --noEmit` (clean, zero errors — catches backend import breaks that the frontend-only `vite build` wouldn't), `npm run build` (succeeds), and a real runtime check (booted `dev:server`, clean boot log, curled `/api/system/tools`, `/api/system/agents/permissions` (PortGrid) and `/api/coreexec/run/:id/status` (CoreExec) — all responded correctly, server stopped afterward). `detect_changes`'s symbol-diff view didn't surface these import-only edits (a tool quirk — pure import-line changes don't map to a symbol body); cross-verified with plain `git diff` instead, confirming exactly the intended 4-file change set.
- Step 4 (optional route-layer split, `portgrid-router.ts` vs `coreexec-router.ts`) was skipped as planned — remains a follow-up, not urgent.
- No confidence-below-0.70 situations. **Task 5 is VERIFIED. Task 6 (rename scoutlogic) is independent and next.**

### 2026-07-01 — Task 6 completed and verified
- Moved all 7 files in `src/core/scoutlogic/` to `src/core/routeswitch/model-selector/` via `git mv`. Fixed the 3 known importers (`engine.ts`, `live-test.ts`) plus 3 internal relative-import breaks inside the moved files themselves (directory nesting changed by one level) that the plan didn't anticipate.
- **Found and fixed a scope item the plan missed entirely:** `RoutingDials.tsx` had no code import from `scoutlogic/`, but had a persisted settings key `scoutlogic_priority` and a user-visible UI heading "ScoutLogic Routing Priority" — arguably the actual source of the user's original confusion, more visible than any of the code-level naming. Renamed the settings key to `model_selector_priority` with a backward-compatible fallback read (old saved settings still work), and renamed the heading to "Model Selection Priority". This was a judgment call handled without escalation (high confidence, backward-compatible, unrelated to the PortGrid/CoreExec hard boundary).
- Did the plan's optional polish: renamed `_resolveProviderViaScoutLogic` → `_resolveProviderViaModelSelector`, reworded 5 related comments/log strings in `engine.ts`.
- Final grep: exactly 2 intentional hits remain (the legacy-fallback line in `RoutingDials.tsx`), zero unintentional leftovers.
- `npm test`: 204/205 (same pre-existing unrelated failure, checked incrementally). `npx tsc --noEmit`: clean. `npm run build`: succeeds. Cross-verified file footprint with `git diff --stat` against `gitnexus detect_changes`'s aggregate report — consistent, no surprises.
- No confidence-below-0.70 situations. **Task 6 is VERIFIED. This closes out the currently-approved batch (Tasks 5 and 6) — per the parent session's instruction, stopping here without starting Task 7 or any other task.**

### 2026-07-01 — Task 7 completed and verified (scope expanded: router + REAL GitNexus integration)

- **Scope change (user-approved before the task ran):** the original plan assumed GitNexus was already integrated via `scoutdaemon/gitnexus-worker.ts`. That was false — that file is a mocked fake-AST stub, unrelated dead code. User chose to build the router AND make GitNexus real, rather than fake a third path. `gitnexus-worker.ts` was left untouched.
- Built **Part A (router):** `src/core/memory/context-router.ts` — `classifyIntent()` (pure keyword/regex → code/knowledge/conversational) + `routeQuery()`. Wired it into the live `POST /api/cerebro/chat` handler (`src/server/routes/cerebro.ts`), which prepends routed context to the prompt. This closes the concrete gap the plan named: `CerebroVectorStore` was never reachable from chat before; now it is.
- Built **Part B (real GitNexus):** `src/core/memory/gitnexus-client.ts` — lazily spawns `gitnexus eval-server` as a long-lived background child on first use, health-checks, reuses it, POSTs `/tool/query`, returns the raw text block, and fails silently/gracefully if gitnexus is absent, the repo can't be disambiguated, or anything errors. NO npm dependency added (gitnexus is an external CLI shelled out to via `child_process.spawn`, matching `portgrid/sandbox.ts`'s pattern). Invocation resolution mirrors `.gitnexus/run.cjs` (global `gitnexus` first, `npx gitnexus@latest` fallback on ENOENT).
- **Design decisions (documented in full in Section 9):** router does NOT re-query OKF (engine already blind-injects it — router's `knowledge` branch is a marker-only decision to avoid double-injection); v1 keyword heuristic (ML not required); GitNexus is optional/best-effort with a documented repo-disambiguation v1 limitation (uses `NEUROSYNC_GITNEXUS_REPO` override, else the single indexed repo, else skips); permanent observability logging kept.
- **Real-world caveat recorded prominently:** most NeuroSync end users won't have `gitnexus` installed or their project indexed — the modality self-disables after one failed attempt and everything falls back to the vector store; chat is never blocked.
- Per CLAUDE.md, attempted `mcp__gitnexus__context` before editing — the index is stale (predates the chat endpoint + new files), so it returned "not found"; the edit was purely additive to an un-indexed route handler, so blast radius was contained. Cross-verified the exact footprint with `git status` (3 new files + `cerebro.ts` modified, nothing else).
- **Verification:** `npm test` 210/211 (6 new router tests; the 1 failure is the same pre-existing unrelated `llama-cpp.ts` format assertion). `npx tsc --noEmit` clean. `npm run build` succeeds. **Runtime multi-query check passed the plan's core acceptance criterion:** 3 question types produced 3 different routing outcomes in the server logs (knowledge→okf, conversational→none/vector, code→gitnexus-attempted); with `NEUROSYNC_GITNEXUS_REPO` forced, a code question routed to `gitnexus` with an 898-char code-structure block actually injected — Part B proven end-to-end. Dev server + spawned eval-server both stopped afterward; no orphaned processes, no test data left behind.
- No confidence-below-0.70 escalations. **Task 7 is VERIFIED.** Per the parent session's instruction, stopping here — NOT starting Task 8/9/10/11.

### 2026-07-01 — Task 8 completed and verified (real embedded terminal, security-hardened)

- **Scope override (fresh research + explicit user decisions, superseding the stale plan text):** the user approved a **full interactive shell (no allowlist), sandboxed by directory + network only**, and pre-approved new deps (`node-pty`, `@hono/node-ws`, `@xterm/xterm`, `@xterm/addon-fit`). This deliberately drops the CommandSandbox allowlist model for this one feature so the terminal is actually useful for real CLI tools.
- **Critical security finding acted on:** CommandSandbox's `bwrap --unshare-net --dev-bind / /` provides ZERO filesystem containment (`--dev-bind / /` binds the whole host RW) — it's only safe because of its allowlist + argument validation, neither of which applies to a free shell. So the terminal could NOT reuse that invocation. Built a genuinely hardened recipe instead: `--ro-bind /usr` + `--ro-bind /etc` (read-only), fresh `--proc`/`--dev`/`--tmpfs`, a single writable `--bind <projectDir>`, `--clearenv` (added to stop server env/API-key leakage into the shell), `--unshare-net`, `--unshare-pid`, `--die-with-parent`. `sandbox.ts` was NOT modified.
- **Containment empirically PROVEN (not asserted)** through the full node-pty→bwrap→WebSocket path against a real project: pwd confined to the project dir; writes/git work in-project; `/etc/shadow`→Permission denied; `~/.ssh`/`/root`/the NeuroSync repo path→No such file; `curl`→"Could not resolve host" (exit 6), DNS→exit 2; `stty size` confirmed WS resize propagation. Cleanup proven: 0 orphan bwrap on WS close, and **0 orphans after an abrupt server SIGKILL** while a session was live (`--die-with-parent` works).
- **Files:** new `src/core/portgrid/terminal-session.ts` (+`.test.ts`, 9 tests), new `src/ui/components/EmbeddedTerminal.tsx`, modified `src/server/index.ts` (WS route + `injectWebSocket`), modified `src/ui/views/PortGridDashboard.tsx` (human-clicked "Open Terminal" panel — never agent-launched). Reused `CommandSandbox.resolveCwd` for project-path resolution.
- **Verification:** `npm test` 219/220 (+9 new tests; the 1 failure is the same pre-existing unrelated `llama-cpp` one). `npx tsc --noEmit` clean. `npm run build` succeeds. Functional test via a raw `ws` client (brief-permitted) exercised the identical server path; full browser click-through not done (frontend is a thin, cleanly-building xterm→WS wrapper over the proven endpoint). All test data/dirs/processes cleaned up.
- **Flags (non-blocking):** `@hono/node-ws` installed with `--legacy-peer-deps` (cosmetic peer range vs. node-server 2.x; verified `injectWebSocket` accepts the native `http.Server` from `serve()`); WS route inherits the app's existing open-when-unconfigured auth posture; requires host `bwrap` (guarded, degrades with a clear message).
- Per the parent session's instruction, stopping here — NOT starting Task 9/10/11.

### 2026-07-01 — Task 8 follow-up: independent browser verification by the orchestrating session
- Per user request, did a full manual browser pass on the embedded terminal (the implementing fork's own testing was raw-WS-client only, not through the actual UI).
- Created a real test project via the API pointing at a real directory, selected it in the UI, clicked "Open Terminal" — a live xterm.js session connected and rendered a real shell prompt.
- Ran `pwd && ls -la && cat README.md` — confirmed genuinely confined to the project directory, correct file contents returned.
- **Independently re-ran the containment checks myself** (not just trusting the implementer's report): `cat /etc/shadow` → Permission denied; `ls /home` → No such file or directory; `curl https://example.com` → could not resolve host. All three matched the implementer's claims exactly.
- Inspected the live `bwrap` process directly via `ps aux` — confirmed it matches the reported recipe exactly, including `--clearenv` with a minimal explicit env set.
- Closed the terminal, confirmed via `ps aux` that the `bwrap` process was actually killed (0 remaining) — cleanup works.
- Checked browser console: zero new errors; only the pre-existing, already-known `ProjectSwitcher` hydration warning.
- Cleaned up the test project and stopped dev servers.
- **Task 8 is now doubly verified — both the implementer's own testing and an independent hands-on pass by the orchestrating session confirm the same result: real, working, properly contained.**

### 2026-07-01 — Task 9 completed (implementing session hit its usage limit mid-verification; picked up and finished by the orchestrating session)
- The fork implementing Task 9 completed all code changes successfully but hit a session usage limit while in the middle of its own manual browser/API verification step, before it could report back or update this tracker.
- Orchestrating session recovered using exactly the process this document is designed to support: checked `git status`/`git diff` directly rather than trusting an incomplete report, confirmed all planned files were genuinely changed with reasonable, well-written diffs (not partial/broken edits).
- Found and cleaned up two pieces of leftover state from the interrupted session: an untracked `_hold.cjs` file at the repo root (harmless leftover raw-WS test script from Task 8's own testing, confirmed nothing was actively running from it) and abandoned `dev:server`/`dev:ui` processes the fork had started for its verification and never stopped. Both cleaned up.
- Independently ran `npm test` (219/220, same pre-existing failure), `npx tsc --noEmit` (clean), `npm run build` (succeeds) — none of these had been confirmed post-implementation since the fork was cut off before reaching them.
- Did fresh manual browser verification: confirmed the Developer Mode icon renders in `AppShell`, confirmed it was already ON (a nice proof point — it had picked up the value the interrupted fork's own testing had persisted server-side, via the fallback-fetch path, even on a brand new tab with empty `localStorage`); clicked it off, confirmed the icon's visual state changed, confirmed via `curl` that `system_settings.developer_mode` correctly updated to `false` server-side. Console clean of new errors.
- Full implementation details, file list, and wording decisions are documented directly in Task 9's own section above (rewritten by the orchestrating session, since the interrupted fork never got to write them).
- **Task 9 is VERIFIED. Task 10 (delete/wire in 6 orphaned components) is next.**

### 2026-07-01 — Task 10 completed and verified
- GitNexus's index was stale (still referenced already-deleted `src/ui-next/` files); re-ran `node .gitnexus/run.cjs analyze` (succeeded, 2,439 nodes/4,642 edges) and cross-verified every impact result with direct grep regardless of index freshness.
- Read all 6 orphaned components' actual code, plus the actual live content of dashboards that might already cover the same ground, rather than deciding from file names alone. This overturned one of the plan's own hints: `LearningApprovalsQueue.tsx` looked like a real gap on paper (real backend, no obvious UI) but `CerebroDashboard.tsx` turned out to already have its own inline duplicate of the exact same feature.
- **Deleted 4** confirmed-redundant components: `CerebroHealthWidget.tsx`, `LearningApprovalsQueue.tsx`, `ProjectManager.tsx`, `ThemeToggle.tsx` — each verified duplicated by something already live elsewhere (details in Task 10's own section above).
- **Wired in 2** confirmed real gaps into `CoreExecDashboard.tsx`: `AgentKPIStrip.tsx` (Dashboard view, new "Worker Pool Telemetry" section) and `GovernorUI.tsx` (Set-up view, alongside but distinct from the existing `AutonomyDials` section).
- **Found and fixed a real bug while wiring in:** both `AgentKPIStrip.tsx` and `GovernorUI.tsx` used relative URLs for their `EventSource`/`fetch` calls — the same bug class fixed in `NotificationCenter.tsx` back in Task 3 (no Vite `/api` proxy configured). Since both had zero importers before this task, the bug had never actually been triggered until now. Fixed with the established `${API}` prefix pattern; verified fixed via fresh browser reload — zero console errors afterward, both widgets showing real, mutually-consistent live data.
- Discovered (not caused by this task, flagged as pre-existing): `src/core/memory/context-router.test.ts` (a Task 7 test) is intermittently flaky, alternating pass/fail across identical repeated runs with a SQLite table-not-found error — confirmed via 5 repeated runs this is unrelated to anything touched in Task 10.
- Tests: 219/220 stable baseline. `tsc --noEmit`: clean. `npm run build`: succeeds. `detect_changes`: footprint matched expectations.
- Manual browser verification performed for both wired-in components, not just curl — confirmed real, live, consistent data on screen.
- No confidence-below-0.70 escalations.
- **All 10 build tasks are now VERIFIED. Only Task 11 remains — an open decision awaiting the user's answer (`neurosync-config.yaml`), not a build task.**

### 2026-07-01 — Task 11 completed and verified (final task in the 11-task plan)
- User confirmed the open decision: yes, build a per-project `neurosync-config.yaml` alongside the database.
- Re-ran `gitnexus analyze` first (the index had gone stale after Task 4's `ui-next` deletion and subsequent file moves — confirmed via a query that still surfaced a deleted file); fresh index used for this task's impact checks.
- Built `src/core/basevault/project-config-file.ts` (write/read, using the new `yaml` npm dependency) and wired it into both `POST /` and `PUT /:id` in `src/server/routes/projects.ts`. Resolved the one open judgment call the plan flagged (reuse vs. regenerate `id` on import) in favor of always minting a fresh local `id` — reasoning documented in Task 11's section above.
- Added 5 new unit tests; ran a full manual end-to-end verification against a live server and real directories covering write, update, and the import-from-existing-file path, confirming the `name`-honored/`id`-regenerated behavior actually works, not just that it was written correctly.
- Tests: 224/225 (same single pre-existing unrelated failure). Typecheck and build clean.
- No confidence-below-0.70 escalations.
- **All 11 tasks are now VERIFIED. The implementation plan is complete.**

### 2026-07-01 — Issue #3 fixed: CoreExec worker-thread pool now works on Node 22

Follow-up work, outside the 11-task plan, closing the one real gap the OSS-readiness CI pass surfaced: `src/core/coreexec/worker.ts` failed to load inside poolifier's `DynamicThreadPool` on Node 22 (this project's documented minimum), because tsx's `--import tsx` loader hook races Node 22.18+'s own native TypeScript type-stripping specifically inside `worker_threads`. Four workaround attempts (documented on the GitHub issue) each traded one error for another (`SyntaxError` → `ERR_MODULE_NOT_FOUND` → `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX` → `ERR_UNKNOWN_FILE_EXTENSION`) without ever fixing the root cause — the two affected tests (`should successfully execute a 3-node DAG in topological order`, `should recover from a crashed run and not duplicate completed tasks`) were `.skip`'d rather than papered over.

**Fix implemented (per the issue's own "precompile to plain JS" suggestion):** `src/core/coreexec/worker-pool.ts` now synchronously bundles `worker.ts` and its local (non-npm) dependency tree into one dependency-free, already-plain-CommonJS file via `esbuild.buildSync()` the moment the module is first imported, and points poolifier's `DynamicThreadPool` at that instead of the raw `.ts` file. `workerOptions.execArgv` is now always `[]` — the spawned thread never needs a TS loader at all, sidestepping the whole class of problem rather than fixing one symptom of it. npm packages (`better-sqlite3`, etc.) are left `external` (not bundled) so native addons keep resolving normally via `node_modules`. The compiled file is written to `src/core/coreexec/worker.generated.cjs` — deliberately next to `worker.ts`, not a tmp dir — because after bundling, `__dirname` inside the bundle refers to wherever that one output file physically lives; `scraping.ts`'s `path.resolve(__dirname, './python_scripts/scraper.py')` needed the output to stay in `src/core/coreexec/` to keep resolving correctly. Added `esbuild` as a real (not just transitive-via-vite) dependency in `package.json` since it's now used at runtime, not just build time; gitignored the generated file.

Un-skipped both tests in `engine.test.ts` and removed the stale "known issue" comments.

**Verification — this is the one task in this whole document that was actually run on real Node 22, not just Node 24:**
- Docker (`node:22` image pull) was attempted first but the registry's blob-storage CDN was unreachable from this environment (the registry API itself responded, but layer downloads hung/timed out even for a trivial `alpine` pull) — abandoned in favor of a standalone Node binary.
- Downloaded the official `node-v22.23.1-linux-x64` tarball directly from `nodejs.org` (reachable), copied the worktree (minus `node_modules`/`.data`/`.git`) into a scratch directory, and ran a real `npm ci` there under Node 22's own bundled npm — this matters because `better-sqlite3`'s native binary is ABI-specific (`NODE_MODULE_VERSION`); reusing Node-24-built `node_modules` under Node 22 fails immediately with `ERR_DLOPEN_FAILED`, confirming a from-scratch install was the right call, not an optional extra.
- Under real Node 22.23.1: `npx tsc --noEmit` clean; `npx vitest run src/core/coreexec/engine.test.ts` → **2/2 passing** (the exact tests this issue is about); full `npm test` → **225/225 passing, 35/35 files** (bwrap was already present on this host with no AppArmor restriction, so this also incidentally covered the sandbox/terminal tests on Node 22); `npm run build` → succeeds (same pre-existing chunk-size warning, unrelated).
- Also re-ran the full suite on Node 24 (this dev machine's default) before and after the Node 22 pass: 225/225 passing both times. The previously-flagged pre-existing flaky test (`context-router.test.ts`, intermittent `no such table: cerebro_memories_meta` — a schema-initialization race unrelated to this fix, first noted during Task 10) reproduced consistently when run in isolation in a *fresh* worktree with no pre-existing `.data/neurosync.db`, but passed cleanly as part of the full suite — confirmed pre-existing and out of scope by also reproducing it on the unmodified `oss-readiness` branch's own checkout.
- `mcp__gitnexus__detect_changes` (scope: unstaged, this worktree): 4 files changed, all symbols contained to `worker-pool.ts`, risk LOW, 0 affected processes flagged outside CoreExec's own worker-pool symbols — matches expectations for a change that's invisible from every call site (`engine.ts` still just does `import { workerPool } from './worker-pool'` and calls `.execute()`/`.info` exactly as before).
- Cleaned up: temp Node 22 binary and scratch npm-ci directory removed from `/tmp` after verification; no Docker containers or images left behind (the failed pull was killed).

**CI note:** no CI workflow change was needed — `.github/workflows/ci.yml` already pins `node-version: 22` (added during the OSS-readiness CI-stabilization work); it was simply never exercising this code path for real before because the two tests were skipped. Un-skipping them means CI now actually proves this on every push/PR going forward.

Files touched: `src/core/coreexec/worker-pool.ts`, `src/core/coreexec/engine.test.ts`, `package.json`, `package-lock.json`, `.gitignore`.

**Issue #3 is resolved.**

<!-- Add new entries above this line, newest at the bottom, each dated -->
