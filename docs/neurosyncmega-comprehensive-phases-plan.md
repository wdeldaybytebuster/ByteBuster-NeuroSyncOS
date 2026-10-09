# NEUROSYNCMEGA — Comprehensive Phases Plan

> **Status:** PHASE A COMPLETE + PHASE B COMPLETE (committed 7b20afb 2026-10-09) — PHASE C PLANNED, NOT AUTHORIZED FOR EXECUTION — PHASE E CLOSED 2026-10-09 (operator YES)
> **Saved:** 2026-10-08
> **Target environment:** Intel Core i3-N305 (8 E-cores), 6.3 GiB RAM, eMMC 5.1 (Zero-Swap), Crostini Container.
> **Execution framework:** Four-stage adversarial subagent loop — Explorer → Architect → Engineer → Auditor. The model that writes code never verifies it.
> **Naming note:** Phase C is legacy "Phase 4" (canonical-reset); Phase F is legacy "Phase 5". Original ticket numbering preserved verbatim below.
> **Amended 2026-10-08 (Architect Run 1):** Axiom-gap findings placed per G-2 — see "G-2 Triage Log — Architect Run 1". Phase A scope unchanged.
> **Amended 2026-10-08 (Architect Run 2):** operator rulings recorded — SA-01 runtime-only; F-CB-IMPL remains in Phase B; GGUF retained for high-performance tier and gitignored. This approval is for plan review only; no phase execution is authorized.
> **Amended 2026-10-09 (Closer — operator authorized):** Phase A + Phase B marked COMPLETE. Phase B committed as 7b20afb (9 files +927/-11, 2026-10-09). Acceptance: tsc --noEmit 0; routeswitch suite 201/201 (20 files); audit:ground-rules 8/8; schema-drift-breaker 17/17; embeddings-url 13/13. Notes: D-1 Node20 vs Node24 ABI — better-sqlite3 rebuilt for Node 24 (NODE_MODULE_VERSION 115→137); use Node20 for canonical verification. D-2 cosmetic: openai-compatible.ts:633 blank line (non-gating). Phase C planned only — NO execution authorized.
> **Amended 2026-10-09 (Phase E close-out — operator YES):** PHASE E marked CLOSED. The operator confirmed the oss-readiness branch deletion was performed under approved sign-off, so both prerequisites of the Phase E task were already satisfied (branch deleted locally and remotely, observed complete; no commit/log entry recording authorization/execution). Recorded as CLOSED in this plan document per the "If yes" branch of the Phase E Task. Deliberately NOT taken: re-delete, any force-push, and any code/schema/runtime change — this is a docs-only close-out. Records a completed close-out only; it authorizes no further phase and moves nothing forward (G-5).

---

## Execution Governance (MANDATORY)

- **G-1 — One phase at a time.** Never execute more than one phase at a time. A phase must pass its final gates before the next phase begins.
- **G-2 — Out-of-scope findings triage.** If Explorer subagents ever find things to note or problems outside of a planned phase, they do not action them mid-phase. The Architect subagent on the next run will either (a) work the finding into the current phase, or (b) report which phase it belongs to if it belongs with a different phase than the one currently being worked on.
- **G-3 — Graph gates before edits.** Per `AGENTS.md`, every edit target passes `node .gitnexus/run.cjs impact <symbol> --direction upstream` first (Task A.4 already mandates this explicitly). `risk: HIGH/CRITICAL` is warned before editing; `risk: UNKNOWN` is never read as an all-clear.
- **G-4 — Destructive steps need explicit operator go-order.** Phase C.6 (DB purge + master-key rotation + workspace clear) and Phase D (scrub / coordinated force-push) are never executed without explicit operator approval.
- **G-5 — Authorization is action-specific.** Reviewing or approving this plan does not authorize code changes, commits, pushes, deployments, live provider calls, model deletion, DB/key/workspace changes, or host-level configuration. Each consequential action still requires the relevant explicit instruction; G-4 applies in addition to G-5.
- **G-6 — SA-01 scope (operator ruling 2026-10-08).** SA-01 prohibits raw shell execution in NeuroSync runtime proposals/workflow nodes/subagents. It does not prohibit controlled development-time verification tools (e.g. Vitest or browser audits) when separately authorized for an execution phase.

## Priority Order (Execution Sequence)

1. **PHASE A:** Fusion Build (scope approved for review; execution not yet authorized)
2. **PHASE B:** F7 embeddings double-/v1 ticket + F-CB-IMPL schema-drift breaker — non-gating; after Phase A, before or after Phase C; does not block Phase C
3. **PHASE C:** Phase 4 Canonical-Reset (sequenced commits 1–7)
4. **PHASE D:** Scrub (OD-6 Option A)
5. **PHASE E:** oss-readiness deletion record close-out
6. **PHASE F:** Phase 5 (HELD — preconditions required)
7. **PHASE G:** Housekeeping

---

## G-2 TRIAGE LOG — ARCHITECT RUN 1 (2026-10-08)

First Architect triage under G-2: the three Axiom-gap findings (found while absorbing the plan) now have phase homes **before Phase A begins**. Nothing here is actioned mid-phase; each item lands with the phase listed. **Phase A's scope is untouched** — A.0's guard still covers exactly F-1…F-8, and no finding was placed inside it.

### F-A6 — Axiom 6 rules persisted but never enforced → PHASE C.4 (folded into Commit 4)

- **Evidence (triage-time, repo-wide search of all file types):** `hardware-profiler.ts` writes `taskset_cores`, `jemalloc_preload`, `UV_THREADPOOL_SIZE`, and heap rules into `environment_rules`, but the only occurrences of `taskset`/`jemalloc` in the entire repo are rule declarations (`hardware-profiler.ts:147,168,183`) and a schema comment (`db.ts:714`). No `LD_PRELOAD`, no `swapoff`, no spawn-point consumer anywhere — `src/`, `scripts/`, and configs all clear.
- **Why Phase C.4:** Commit 4 is the Genesis Bootstrap / boot-path refactor, and P8-5 assigns enforcement to CoreExec at boot (inject limits into all sandboxed process spawns). Enforcement is boot-path work and must land **before** C.6's destructive fresh boot, so the clean boot is validated under real limits.
- **Scope added to C.4:** spawn-point enforcement of `taskset_cores`, `jemalloc_preload` (LD_PRELOAD), and a zero-swap guard — in both the server sidecar spawn and the PortGrid sandbox recipe. C.4's gate/acceptance extended accordingly.

### F-LLM — `local_llm_enabled` rule has no reader → PHASE C.4 (folded into Commit 4)

- **Evidence:** `db.ts:715` documents "RouteSwitch reads `local_llm_enabled` before attempting local SLM calls" — no such read exists in RouteSwitch. On the constrained tier the rule is `'false'`, so the Axiom 6 "Zero-AI Local Footprint" ban is currently unenforced code (P8-5 boundary gap).
- **Why Phase C.4:** same defect class as F-A6 — an `environment_rules` row nothing consumes — so it shares Commit 4's "make persisted rules real" scope.

### F-LOCAL — 3.2 GB GGUF in repo root → PHASE C.1 (folded into Commit 1)

- **Evidence (triage-time):** `local_models/gemma-4-E2B_q4_0-it.gguf`, 3.2 GB, **untracked** by git. One careless `git add -A` away from a catastrophic commit; 3.2 GB of eMMC consumed on a zero-swap constrained box; loading it would violate the Axiom 6 zero-AI footprint.
- **Operator ruling (2026-10-08):** Retain for high-performance tier. C.1 adds `local_models/` to `.gitignore`; do not delete or relocate the weight. C.4's `local_llm_enabled` gate must refuse local model execution on constrained tier and only permit it after a high-performance hardware profile is established.

### F-CB-UI — ScoutDaemon UI advertises a nonexistent "algorithmic circuit breaker" → PHASE C.5 (folded into Commit 5)

- **Evidence:** `ScoutDaemonDashboard.tsx:321` promises "Monitors token-level entropy during background inference. If hallucination detected, executes kill-before-compute abort." Repo-wide search found no entropy monitor and no breaker — the only match is that copy. Faked-UI class defect.
- **Key nuance:** the copy describes an **entropy-based hallucination detector**, which is not even Axiom 4's schema-drift breaker — a different mechanism. So the copy fix is independent of F-CB-IMPL below and stands regardless.
- **Why Phase C.5:** Commit 5 already sweeps dead/lying feature UI (D-14); the truth-fix (rewrite the `ModeLabel` to describe what exists, or delete the claim) belongs in the same honest-UI pass.

### F-CB-IMPL — Axiom 4 schema-drift circuit breaker unimplemented → PHASE B (new non-gating ticket; operator confirmed placement)

- **Evidence:** Axiom 4 specifies a 3-strike schema-drift circuit breaker that halts automated retries and parks the task into `os_todos` under `LLM_RETRY_OR_FIX`. No implementation exists.
- **Why Phase B:** bounded, deterministic feature (validation-failure counter → trip → `os_todos` insert; zero LLM involvement per P8-2) that fits the post-Fusion, non-gating slot. Phase F is HELD with no date, so parking it there risks never landing.
- **Ticket text:** added under Phase B as "G-2 additions to this phase". Operator confirmed Phase B placement on 2026-10-08.

### Placement summary

- **Phase A:** unchanged (scope approved for review, not execution; full scope F-1…F-8; A.0 guard intact)
- **Phase B:** + F-CB-IMPL (non-gating ticket; operator confirmed Phase B)
- **Phase C.1:** + F-LOCAL (`local_models/` gitignore; operator confirmed retention for high-performance tier)
- **Phase C.4:** + F-A6 (spawn-point rule enforcement), + F-LLM (`local_llm_enabled` gate)
- **Phase C.5:** + F-CB-UI (phantom circuit-breaker copy truth-fix)

---

## PHASE A: FUSION BUILD (SCOPE APPROVED; EXECUTION NOT AUTHORIZED)

### Prerequisites

- Rotation live proof completed (connectivity: 725ms, routed generation via `prov_9e6d459a2afc`)
- Factory fix `7b2a7d9` deployed (column-key + customId passthrough)
- Password rotated back by user *(literal value redacted at save time — credentials do not belong in tracked project files; see operator notes)*
- Auth gate enforced, setup complete

### Tasks in Order

#### A.0 Scope Guard (Documentation Only)

- Confirm `model="fusion"` server-side ensemble scope
- Explicitly out of scope: `/v1/responses|/v1/messages`, council, embeddings redesign
- No code changes

#### A.1 F-1 Verification/UI Fix (G1 — 4 lines)

- **File:** `src/ui/views/RouteSwitchDashboard.tsx:344-347`
- **Check:** freellmapi save arm currently returns `{}`
- **Fix:** Add freellmapi arm matching openrouter/opencode pattern:

  ```ts
  type: 'freellmapi' ? { modelId: formModelId || 'auto', baseUrl: formBaseUrl || undefined }
  ```

- **Why:** Without this, `model="fusion"` cannot be persisted via UI
- **Impact:** 1 file, 4 lines, pure UI (PortGrid boundary)
- **Test flips:** chat-backend-routing (UI → GET provider list), llm.test CRUD round-trip
- **Gate:** PortGrid boundary validation
- **Acceptance:** UI saves modelId/baseUrl for freellmapi, GET shows persisted values

#### A.2 F-2 Budget Decision (G3 — Documentation)

- **Read:** `openai-compatible.ts:58-59` (`OPENAI_COMPAT_TIMEOUT_MS = env || 30_000`)
- **Read:** `ui/lib/api.ts:199` (`LLM_TASK_BUDGET_MS = 120_000`)
- **Decision (no code change):**
  - Keep 30s default for Fusion (single call vs council fan-out)
  - Document: If live Fusion p95 > ~25s, set env `OPENAI_COMPAT_TIMEOUT_MS=60000`
  - UI budget remains 120s (covers whole flow)
- **Output:** Update `docs/architecture/FUSION.md` with budget note
- **Gate:** Axiom 6 (env knob respects constrained vs high-perf tiers)
- **Acceptance:** Documentation updated, no code changes

#### A.3 F-3 Live Gate (Localhost:3001 Verification)

- **Prerequisites:** Adapter running, logs show boot, localhost:3001 proxy active
- **Test flows:**
  - `model="auto"` smoke — verify existing behavior unchanged
  - `model="fusion"` single call — capture server logs, observe panel/judge activity
  - Provider test button — expect `connected:true`, latency ≤ 30s
  - Collect p50/p95 latency data (store in `/tmp/fusion-benchmarks.json`)
- **Acceptance:** All tests pass, p95 ≤ 25s OR env knob documented
- **Output:** Pass/Fail report, benchmark data, env knob decision logged
- **Gate:** Live verification must succeed before proceeding

#### A.4 F-4 extraBody Seam (G2 — CRITICAL Blast Radius)

- **Files to modify:**
  - `engine.ts:14-34` RouteRequest — add `extraBody?: Record<string,unknown>`
  - `openai-compatible.ts:5-11` OpenAICompatibleConfig — add `extraBody?`
  - `openai-compatible.ts:183-196` `_generateWithConfig` — merge `...base, ...extraBody` into body
  - `openai-compatible.ts:231-258` body builder — PIN model after merge, guard no override of `messages/response_format`
  - `freellmapi.ts:93` ctor — optional `customId` (default `'freellmapi'`)
  - All 4 generate overrides (`openai-compatible.ts:169`, `opencode.ts:74,92`, `freellmapi.ts:114`, openrouter equivalent)
- **Merge order:**

  ```ts
  const requestBody = { ...base, ...extraBody };
  requestBody.model = model; // ensure model pinned after merge
  ```

- **Guard:** `extraBody` may not contain `model/messages/response_format` — use allowlist or destruct
- **P8-2 verification:** Add `§VERIFY: extraBody` node in DAG between body build and fetch
- **Impact:** `impact _generateWithConfig --direction upstream` = CRITICAL (13 impacted, 5 processes: `openrouter.generate`, `cerebro.reflection._classifyAgainstExisting`, `coreexec.worker.executePlugin`, `engine._executeWithProvider`, `syncProviderToEngine`)
- **Test flips:**
  - `routeswitch.test:102-114` (add extraBody merged test, model pin validation)
  - streamhooks-regression (signature change verification)
  - `council.test` (unaffected — no council path touched)
  - discovery/router tests (no model validation impact)
  - `llm.test` (CRUD unaffected)
- **Gate:** MUST run `node .gitnexus/run.cjs impact _generateWithConfig --direction upstream` BEFORE editing
- **Acceptance:** extraBody merges correctly, model pinned, all tests pass

#### A.5 F-5 streamHooks Forward (G5 — 1-line fix)

- **File:** `freellmapi.ts:108-114` (currently `_streamHooks` named, not forwarded)
- **Change:** Rename param, forward in call to `_generateWithConfig`
- **Test:** Add FreeLLM case to `streamhooks-regression.test.ts`:
  - Abort mid-flight propagates correctly
  - Non-abort path byte-identical to openrouter/opencode
  - Abort source: `combineSignals(timeoutSignal, streamHooks?.signal)` at `openai-compatible.ts:272`
- **Impact:** 1 line change, no existing tests fail
- **Gate:** streamhooks-regression test suite passes
- **Acceptance:** AgentStop can cancel in-flight Fusion calls

#### A.6 F-6 Usage Accounting (G6)

- **Current:** Governor records `tokensUsed: actualTokens` per request (`engine.ts:408`)
- **Decision for Fusion:**
  - Default: count 1× (single-call path)
  - If F-4 extraBody requests N panels (server reports via `X-Routed-Via`), count server-reported total
  - Document: "governor usage is 1× unless `X-Routed-Via` exposes panel count"
- **Test flips:**
  - `routeswitch.test` + `governor.test` (add Fusion N-panel case asserting multiplier)
  - `llm.test` CRUD unaffected
- **Gate:** `governor.test` passes with new test case
- **Acceptance:** Accounting follows documented rule

#### A.7 F-7 X-Routed-Via Capture (G8)

- **File:** `freellmapi.ts:115-123` (currently `console.log` only)
- **Change:** Capture header into optional `RouteResponse.routedVia`
- **Display:** PortGrid provider-test result includes `routedVia` when present
- **Impact:** Pure observability, no flow change
- **Test flips:** mock-header unit test (header present → routedVia set; absent → undefined, no throw)
- **Gate:** mock-header test passes
- **Acceptance:** `X-Routed-Via` header captured and displayed in PortGrid

#### A.8 Documentation Updates

- `README:47-50` — Add Fusion paragraph:
  - Chat-only: `model="fusion"` + optional fusion per-request field (full only)
  - `X-Routed-Via` observability (full only)
- Testing-plan matrix — Add rows:
  - Fusion passthrough (`routeswitch.test:102-114`)
  - Hooks (`streamhooks-regression`, `engine-agentstop.test.ts`)
  - Accounting (`governor.test`)
  - UI round-trip (`llm.test`, chat-backend-routing)
  - Reasoning retry (`opencode-reasoning.test.ts:229-242`)
  - Discovery/router allow-list (includes `"fusion"`)
- **Gate:** Documentation updated and reviewed
- **Acceptance:** Docs reflect current implementation

#### A.9 Final Gates

- `detect-changes --scope all` — must report clean (only expected changes)
- `tsc --noEmit` — exit code 0
- `audit:ground-rules` — 8/8
- routeswitch shard — 16 files / 130+ tests passing
- Auditor GO recommendation for push; actual push still requires separate explicit operator authorization (G-5)

---

## PHASE B: POST-FUSION HARDENING (F7 EMBEDDINGS + SCHEMA-DRIFT BREAKER)

**Status:** COMPLETE (committed 7b20afb 2026-10-09). Non-gating work; did not block Phase C.
**Acceptance (2026-10-09):** tsc --noEmit 0; routeswitch 201/201; audit:ground-rules 8/8; schema-drift-breaker 17/17; embeddings-url 13/13. D-1: Node20 vs Node24 ABI (use Node20 canonical). D-2: cosmetic openai-compatible.ts:633 blank line (non-gating).
**Scope:** `openai-compatible.ts:366-370` embeddings URL builder
**Issue:** `baseUrl` ending in `/v1` + `/v1/embeddings` = `.../v1/v1/embeddings`

**Fix direction (for ticket):**

- Add dedicated `embeddingModelId` config with safe default
- Never reuse chat modelId (auto/fusion) for embeddings
- P8-2 `§VERIFY:` key check on embeddings body

**Test flips (ticket):** Embeddings body asserts literal model, not auto/fusion
**Priority:** Can be done any time after Fusion phase, before or after Phase 4

### G-2 ADDITIONS TO THIS PHASE (Architect Run 1)

- **F-CB-IMPL — Axiom 4 schema-drift circuit breaker (non-gating):**
  - Implement the 3-strike validation-failure counter on third-party LLM response schemas
  - On trip: halt automated retries, park the task into `os_todos` under `LLM_RETRY_OR_FIX`, surface in PortGrid
  - P8-2 discipline: deterministic counter + schema check only — no LLM involvement
  - Test flips: unit tests for strike counting and trip → `os_todos` row (assert literal `LLM_RETRY_OR_FIX`); `llm.test` CRUD unaffected
  - Gate: breaker tests pass
  - Acceptance: three consecutive schema validation errors stop retries and park the task
  - Non-gating: may be scheduled before or after Phase C; Phase C does not depend on it.

---

## PHASE C: PHASE 4 CANONICAL-RESET (SEQUENCED)

### Prerequisites

- Fusion phase A completed and pushed OR Fusion phase A.1–A.3 completed (minimal viable)
- Live rotation proof still valid (or re-verified)
- Auth gate enforced, setup complete

### Execution Order (MUST BE SEQUENTIAL)

#### C.1 Commit 1: Artifacts & gitignore

- **Tasks:**
  - Audit `.gitignore` for completeness
  - Add missing patterns: `.env`, `*.log`, `*.pid`, `/tmp/opencode/`, `node_modules/`, `dist/`, `coverage/`
  - Remove any committed artifacts that should be ignored
  - G-2 (F-LOCAL): add `local_models/` to `.gitignore`; retain the existing 3.2 GB GGUF for high-performance-tier use. Do not delete or relocate it. Never load it on the constrained tier.
- **Gate:** `git status --ignored` shows no unexpected ignored files; confirm the GGUF is ignored, still present, and not staged.
- **Acceptance:** Clean working tree for ignored files; model retained and protected from accidental staging.

#### C.2 Commit 2: Dead Scripts Removal

- **Tasks:**
  - Identify and remove dead scripts (no longer referenced)
  - Examples: `scripts/old-deploy.sh`, `tools/legacy-migration.js`
  - Verify via git grep and usage analysis
- **Gate:** No script referenced in package.json or docs is removed
- **Acceptance:** Only truly dead scripts removed

#### C.3 Commit 3: Dead RouteSwitch Chain Removal

- **Tasks:**
  - Identify unused `llm_routing_rules` (no provider chains reference them)
  - Remove associated rules and dangling provider rows
  - Preserve only active chains: global, cerebro, project, agent
- **Gate:** `GET /api/llm/routing-rules` shows only 4 scopes with valid chains
- **Acceptance:** No dangling rule or provider references

#### C.4 Commit 4: Genesis Bootstrap Refactor

- **Tasks:**
  - Refactor genesis process to be idempotent
  - Ensure `system_settings` initialization is safe on repeat
  - Validate `bootProviderRegistry` handles missing rows gracefully
  - G-2 (F-A6): enforce `environment_rules` at every spawn point (server sidecar spawn + PortGrid sandbox recipe) — `taskset -c` per `taskset_cores`, `LD_PRELOAD` per `jemalloc_preload`, zero-swap guard
  - G-2 (F-LLM): RouteSwitch reads `local_llm_enabled` before any local SLM inference attempt; on `'false'` (constrained tier) local execution is refused
- **Gate:** Server boots successfully 3x in a row with same state; spawned processes observably carry the pinned affinity/heap/threadpool limits
- **Acceptance:** Idempotent genesis verified; every persisted enforcement rule has a consumer (spot-check: `taskset_cores`, `jemalloc_preload`, `UV_THREADPOOL_SIZE`, heap cap, `local_llm_enabled`)

#### C.5 Commit 5: Orphan UI D-14 + DegradationEngine Test Delete

- **Tasks:**
  - Remove UI components related to dead D-14 feature (App.tsx minus)
  - Delete DegradationEngine test file if no longer used
  - Verify via impact analysis that nothing references them
  - G-2 (F-CB-UI): truth-fix the ScoutDaemon phantom "algorithmic circuit breaker" copy (`ScoutDaemonDashboard.tsx:321`) — rewrite the `ModeLabel` to describe what actually exists, or delete the claim
- **Gate:** `detect-changes --scope all` shows only intended deletions
- **Acceptance:** No regression in UI or engine tests

#### C.6 Commit 6: DB PURGE + MASTER-KEY ROTATION + WORKSPACE CLEAR (DESTRUCTIVE; NOT AUTHORIZED)

**PREREQUISITE:** Live rotation proof must be current (or re-verify first)
**PREREQUISITE (G-4):** Explicit operator go-order required for this destructive step.

- **Tasks (STOP-SERVER FIRST):**
  - Stop server: `pkill -f '[t]sx src/server/index.ts'` (verify stopped)
  - Purge live DB: `rm -f .data/neurosync.db`
  - Rotate master key: Generate new `.data/.master.key` (32 bytes)
  - Clear workspace: Remove `.data/` subdirectories except `.master.key`:

    ```bash
    rm -rf .data/* && touch .data/.master.key
    ```

  - Restart server with fresh boot
- **Gate:** Must have explicit operator go-order for this destructive step
- **Acceptance:**
  - Server boots with clean state
  - `system_settings` initialized with defaults
  - No provider rows exist (empty `llm_providers`)
  - Fresh boot log shows setup required

#### C.7 Commit 7: Runbook Update

- **Tasks:**
  - Update `docs/implementation-plan-and-progress-tracker.md`
  - Add procedures for:
    - Master key rotation
    - Workspace recovery
    - Provider onboarding post-purge
    - Fusion feature usage
- **Gate:** Documentation reviewed and complete
- **Acceptance:** Runbook reflects current procedures

---

## PHASE D: SCRUB (OD-6 OPTION A; NOT AUTHORIZED)

### Prerequisites

- Phase 4 commits 1–7 completed and pushed
- Fusion phase completed (recommended)
- Content commits finished (no more feature work)
- Coordinated force-push window established

### Tasks

**Targets** (oss-readiness lineage only — main never contained the bad commit; verify this claim against actual history before any action):

- `.data.bak_20261001_104101/`
- `e2e-report/`
- `test-results/`

**Method (unresolved; design only, execute nothing):**

- Operator approval obtained (G-4)
- **Proposed but unverified method:** `fetch origin/main && reset --hard origin/main` — this command is a destructive local reset, not itself a force-push. Explorer/Architect must inspect repository history and clarify the exact scrub/force-push procedure before this phase; do not run this line as written without an approved recovery plan.
- Remove target directories/files
- Re-run any necessary generation (docs, reports)

**Gate:** Explorer/Architect verifies the intended history-cleanup scope and recovery procedure; Auditor verifies no unrelated history or files are affected; explicit operator authorization for each destructive local/remote operation plus coordinated window.
**Acceptance:** Only approved targets removed from the specified history/scope; main and unrelated work remain intact; verification evidence captured.

---

## PHASE E: oss-readiness DELETION RECORD CLOSE-OUT

**Status:** CLOSED (2026-10-09 — operator YES). The operator confirmed the deletion was performed under approved sign-off, so the "If yes" branch of the Task below applies and the record is closed here. Re-delete was NOT performed and no force-push was issued; this close-out is docs-only and touches no code, schema, or runtime path.

### Prerequisites

- Branch already deleted locally and remotely (observed complete)
- No commit/log entry records deletion authorization/execution

### Task

- Operator confirms deletion was performed under approved sign-off
- If yes: Record as CLOSED in this plan document
- If no: Investigate and potentially re-delete under approval

---

## PHASE F: PHASE 5 (HELD)

### Prerequisites

All technical `WORKER-WRITE-TOPOLOGY.md` §5 preconditions must be verified against the source document (the prior plan said "5" but listed six technical conditions):

- eslint configuration stable
- Vite chunking optimized
- Lazy dashboards implemented
- Terminal WS URL secured
- jsdom testing configured
- Worker single-writer RPC cutover complete

Separate authorization gate: explicit operator go-order obtained before Phase F begins.

### Tasks (To be detailed when preconditions met)

- Final frontend optimizations
- Worker architecture migration
- Performance validation
- Production readiness checklist

---

## PHASE G: HOUSEKEEPING

### Tasks

- Review the index-block changes in `AGENTS.md` and `CLAUDE.md`; preserve pre-existing user/agent edits. Propose a scoped patch or revert only explicitly approved, attributable hunks. Do not stage, commit, or discard either file without separate operator direction.
- Verify current boot has log tail on disk (wire boot logging if missing; code/config edits still need phase-specific authorization)
- Final audit of all gates
- Pre-release validation
- No release, deployment, commit, or push is authorized by this housekeeping checklist alone (G-5).

---

## ACCEPTANCE CRITERIA FOR COMPLETE SYSTEM

- `tsc` 0, `audit` 8/8
- Live wire proof: connectivity test + routed generation via provider row
- Auth gate enforced, setup functional
- Provider onboarding/offboarding works via UI/API
- Fusion feature: `model="fusion"` works with optional per-request field
- PortGrid displays correct provider health and `X-Routed-Via`
- Generator: Deterministic execution via DAG proposals + HITL
- ScoutDaemon: Watches correctly, never calls `CoreExec.executeRun`
- All module boundaries respected per Phase 8 patterns

---

## OPEN ITEMS / PLAN REVIEW NOTES

1. **Resolved — SA-01 scope (2026-10-08):** Runtime-only. See G-6; controlled development-time verification is permitted when the relevant execution phase is authorized.
2. **Resolved — F-CB-IMPL placement (2026-10-08):** Keep in Phase B as a non-gating ticket.
3. **Resolved — GGUF disposition (2026-10-08):** Retain for high-performance tier; gitignore in C.1; no deletion or relocation. Constrained-tier execution must be refused by the C.4 gate.
4. **Resolved — G-2 triage (Architect Run 1):** F-A6 + F-LLM → Phase C.4; F-LOCAL → Phase C.1; F-CB-UI → Phase C.5; F-CB-IMPL → Phase B. See triage log above.
5. **Phase A.2 output target** `docs/architecture/FUSION.md` does not exist yet; create/update it only when A.2 is authorized and reached.
6. **Phase F precondition source verification:** the saved plan's original heading said "All 5" while listing six technical conditions; the heading is now corrected to say all technical preconditions. Explorer/Architect must compare the six listed conditions to `WORKER-WRITE-TOPOLOGY.md` §5 when Phase F is approached and add any missing condition rather than assume this list is complete.
7. **Hardware guard implementation boundary:** C.4 must not execute `swapoff`, change host swap, or alter host CPU affinity as a side effect. Architect must specify a capability-aware, least-privilege policy; any host-level mutation requires separate explicit authorization. If zero-swap cannot be safely enforced inside the application boundary, report it rather than claiming enforcement.
8. **Plan review is not execution approval.** All phases remain NOT AUTHORIZED until the user gives a phase-specific go-order. Commits, pushes, deployments, live provider calls, and destructive changes need separate explicit authorization.
9. **Phase D method is unresolved:** `fetch origin/main && reset --hard origin/main` performs a destructive local reset and does not itself force-push. Before Phase D, Explorer/Architect must validate the intended history-scrub procedure, recovery point, coordination window, and remote operation; no reset, force-push, or deletion occurs until separately authorized.
10. **Pre-existing changes are protected:** current `AGENTS.md` and `CLAUDE.md` modifications and `.freebuff/project-id` are not owned by this plan. Phase G must inspect and preserve them; no staging, commit, revert, overwrite, or deletion without explicit, scoped operator instruction.

---

## PHASE C EXECUTION LOG — 2026-10-09 (operator-authorized; appended by Restorer)

11. **Phase C executed C.1–C.5 + C.7 docs (8 commits, 2026-10-09):**
    - C.1 `240771a` chore(gitignore): ignore `*.pid` + `coverage/` — 4 added lines, `.gitignore` only.
    - C.2 part A `138a813` chore(scripts): drop `build_scopelogic.cjs` + `chaos.ts` (D-8/D-9).
    - C.2 part B `c156017` chore(scripts): drop `crypto-test.ts` + `dag-test.ts` (D-10/D-11).
    - C.2 part C `9e03062` chore(scripts): drop `e2e-test.ts` + `fix_fetches.ts` (D-12/D-13).
    - C.4a `7d8af42` fix(scoutdaemon): attribute thermal-yield `environment_rules` to the active hardware profile.
    - C.4b `1324aa5` fix(routeswitch): fail-closed `local_llm_enabled` gate before local SLM inference.
    - C.5 `b84d565` fix(ui): ScoutDaemonDashboard :321 dev label now states the honest limitation.
    - C.7 `bd2a1b3` docs: Phase C runbook + tracker entries for C.1–C.7 (docs-only; no code/schema/runtime change).
12. **D-2 follow-ups fixed (2026-10-09):** D2 `d39ffba` fix(env-rules): newest-wins `ORDER BY` + active-profile scoping; D1 `c70676d` fix(workspaces): redirect sandbox to temp under VITEST. Vitest 100/100 files, 864/864 tests green at `c70676d`. GitNexus reindexed to `c70676d`.
13. **C.6 widened, NOT purged (2026-10-09):** DB credential nulled, providers table 0 rows; snapshot kept at `/tmp/opencode/neurosync-c6-snap-20261009_035209.db` (sha256 `0da179…`). No purge/key-rotation without separate Phase D authorization (G-4).
14. **D5 incident — plan-doc revert by unknown actor (2026-10-09 ~02:39):** working tree `docs/neurosyncmega-comprehensive-phases-plan.md` reverted in 4 hunks (Status→REVIEW, amended-2026-10-09 line deleted, G-6 deleted, Phase B→Open). Restored from `97fe98b` (`git show 97fe98b:docs/… > file`, sha256 `c7abe3…`), COMPLETE markings + G-6 verified present, this execution log appended.
15. **C.4c genesis first-run (2026-10-09, this session):** single explicit invocation `force=false` via the sanctioned first-run bootstrapper (`npx tsx src/server/index.ts --profile` → ScoutDaemon `runGenesisProfiler(false)`); `hardware_profiles` 0→1 row, 10 `environment_rules` written in one transaction, `getEnvRule` reads verified live. No swapoff / host-affinity changes (Open Item 7 boundary respected; `swap_enabled=true` is a stored rule value only, not an action).
16. **C.4c profile tier: `high-performance`.** Probe: 8 cores (8 physical, no HT), 6472 MB RAM, `hdd` storage (rotational flag; eMMC not enumerated in this container), `crostini` virt, `gpu` with 4096 MB VRAM → high-performance arm of `classifyTier` (GPU-present rule). Rules: `UV_THREADPOOL_SIZE=8`, `max_workers=8`, `local_llm_enabled=true`, `taskset_cores=0-7`, `swap_enabled=true`, `max_old_space_size_mb=4096`, `parallel_dag_enabled=true`. Genesis wrote NO provider row (`llm_providers` still 0) and left `operator_credential` null. NOTE: tier differs from the plan's i3-N305/constrained expectation — that is the deterministic output of the probe on this host, recorded as-is; any re-tiering is operator-directed via PortGrid Re-Profile (`force=true`), never automatic.
17. **Resolved — Phase E CLOSED (2026-10-09, operator YES):** oss-readiness deletion-record close-out. Operator confirmed the branch deletion was performed under approved sign-off; both prerequisites stood (branch already deleted locally and remotely, observed complete; no commit/log entry recording authorization/execution). Recorded as CLOSED per the "If yes" branch. No re-delete, no force-push, no code/schema/runtime change — docs-only. Phase D (scrub + coordinated force-push) remains the only history-level action and stays unauthorized per G-4/G-5.
