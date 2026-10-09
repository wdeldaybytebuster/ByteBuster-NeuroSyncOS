---
title: "Runbook"
status: draft
owner: "williamdeldaymarketing"
last_updated: "2026-10-09"
review_cadence: "weekly"
source_of_truth: true
---

# Runbook

## Routine Operations

- **Manual Database Backup:** Export database using SQLite command:
  ```bash
  sqlite3 basevault.db ".backup backup.db"
  ```
- **Clear Stale Leases:** In event of hard crash, run CLI command:
  ```bash
  nlm queue reset-leases
  ```
- **Introspective Migrations:** Run migrations command to upgrade/verify tables safely:
  ```bash
  nlm migrate up
  ```

## Phase C — Canonical Reset (C.1–C.7)

| Step | Action | Commit |
|------|--------|--------|
| C.1 | `.gitignore`: appended `*.pid` + `coverage/` | `240771a` |
| C.2 | Removed 6 orphan dev scripts: `scripts/{build_scopelogic.cjs, chaos.ts, crypto-test.ts, dag-test.ts, e2e-test.ts, fix_fetches.ts}`. **KEPT** `scripts/live-test.ts`, `scripts/audit/`, `scripts/build-sidecar.js`, `scripts/build-tauri-sidecar.js` | `138a813`, `c156017`, `9e03062` |
| C.3 | Verify-only: `SELECT scope, scope_id, provider_chain FROM llm_routing_rules` → 4 rows (agent / cerebro / global / project), each `["prov_9e6d459a2afc"]`. Zero writes — sha256 identical before/after. **No commit (verify-only)** | — |
| C.4a | `idle.ts` thermal-yield writes `environment_rules.profile_id` from `getActiveHardwareProfile()`; SELECT scoped by profile | `7d8af42` |
| C.4b | `LlamaCppProvider.generate()` fail-closed on `getEnvRule('local_llm_enabled', 'false')` — default closed | `1324aa5` |
| C.5 | `ScoutDaemonDashboard.tsx:321` dev `ModeLabel` now states the honest post-hoc-heuristic limitation (mirrors `:314`) | `b84d565` |
| C.6 | **ABORTED — post-condition contradicted (see tracker)** | — |
| C.4c | **HELD — downstream of the blocked C.6** | — |
| C.7 | This runbook + the tracker entries | this commit |

### NEVER DO — `.data` safety
- **NEVER `rm -rf .data/*`**, and never `rm -rf` on anything under `.data/`. Remove named files only.
- `.data/.master.key` is **never** deleted in the C-phase. Key rotation and history scrub are Phase D.
- Host-level `swapoff`, `taskset` and CPU-affinity changes are **out of scope** for this runbook entirely.

### `idle`-FK note
`environment_rules.profile_id` is `NOT NULL REFERENCES hardware_profiles(id)` (`src/core/basevault/db.ts:718`). ScoutDaemon's thermal path in `src/core/scoutdaemon/idle.ts` must resolve `getActiveHardwareProfile()` **before** any insert. If genesis has not run there is no profile to attach a rule to, so the correct behaviour is to refuse and write nothing — not to throw into the swallow-all `catch` (which is exactly how this path silently no-oped before `7d8af42`). `src/core/scoutdaemon/idle.test.ts` pins this.

### `local_llm_enabled` note
Genesis synthesizes the rule per hardware tier (`synthesizeRules`, `src/core/scoutdaemon/hardware-profiler.ts`): `constrained` → `false`, `standard` → `false`, `high-performance` → `true`. RouteSwitch honours it fail-closed — an **absent** rule resolves to the closed default `false` and refuses, so an un-run profiler can never silently load a multi-GB GGUF on a constrained node. Re-profiling requires an explicit PortGrid action, never automatic (P8-5).

### C.6 safe procedure (verbatim — recorded, NOT executed)

```
# 0. server must be stopped first
ss -ltnp 3743                      # expect EMPTY
TS=$(date +%Y%m%d_%H%M%S)
SNAP=/tmp/opencode/neurosync-snap-$TS
mkdir -p "$SNAP"
cp -a .data/.master.key .data/neurosync.db \
      .data/neurosync.db-shm .data/neurosync.db-wal "$SNAP"/
sha256sum "$SNAP"/* | tee "$SNAP"/SHA256   # rollback anchor

# 1. single Node handle, TRUNCATE checkpoint, then CLOSE it
PRAGMA wal_checkpoint(TRUNCATE);

# 2. selective removals — NAMED entries only
rm -f .data/neurosync.db-shm .data/neurosync.db-wal
rm -f .data/workspaces/*           # never rm -rf

# 3. verify the SNAPSHOT (never the live DB) opens
PRAGMA integrity_check              # expect: ok
```

**Why C.6 stopped here.** The approved post-conditions were "fresh boot → `setup-required`" and "0 providers". Both are **unreachable** by the step-2 removals: `setup-required` is driven by `system_settings.operator_credential` (`isSetupComplete()`, `src/server/auth/credentials.ts:208`) and "0 providers" by the `llm_providers` table — both live in the **DB main file**, not in `-shm`/`-wal`/`workspaces/`. `.data/workspaces` was already **0 files**, so step 2 was a near no-op. Rather than exceed the authorized scope by deleting an operator credential and provider rows (Phase D's domain, and irreversible without the snapshot), the step was **aborted and reported**. See the tracker entry for the full evidence.

### Snapshot / rollback checklist
1. Server stopped — `ss -ltnp 3743` empty — before any DB action. Never two DB writers.
2. `$SNAP` exists containing `.master.key`, `neurosync.db`, `neurosync.db-shm`, `neurosync.db-wal`.
3. `sha256sum` of **every** snapshot file recorded.
4. `PRAGMA integrity_check` run against the **snapshot** returns `ok`.
5. **Rollback:** stop server → `cp -a "$SNAP"/neurosync.db .data/` → boot → re-run the C.3 verification SELECT.
6. Abort on the first failure; park `os_todos`; never leave a partial delete behind.

## Phase F — frontend optimizations + worker single-writer cutover (F-1–F-6)

Landed 2026-10-09 (28 commits, no push). Operator-facing notes only — the
full engineering record is in `docs/implementation-plan-and-progress-tracker.md`
(2026-10-09 Phase F entry) and `docs/security/WORKER-WRITE-TOPOLOGY.md` §5.

### What changed for operators

- **`npm run lint` / `npm run lint:fix`** now exist (eslint 9 flat config).
  The gate is 0 errors; 66 warnings are the documented debt register
  (dead lucide imports / unused test args) and do not fail the run.
- **First-run UI is chunked + lazy.** The eight dashboards load on demand
  behind a `Loading module…` fallback; xterm/xyflow/vendor chunks cache
  independently. A dashboard may now flash the fallback for a few hundred
  ms on a cold eMMC boot — expected, not a hang.
- **All worker-thread DB writes now route to the main thread** (the F-6
  cutover). Operational consequence: a plugin's escalation ticket
  (os_todos) appears in PortGrid before the task is marked completed, and
  a saturated write path surfaces as a **429** to the worker (the task
  parks with the overflow reason) instead of silently dropping the write.
  Watch for `[BaseVault]` log lines — `write channel drained`, `slow write
  apply`, and `WAL contention: SQLITE_BUSY` — for one release; they are the
  contention logging §5(5) requires.

### Never do (F-6)

- Never reintroduce a direct `db.prepare(...).run()` write in
  `src/core/coreexec/worker.ts` or
  `src/core/memory/cerebro/reflection-sweep.ts`. Both files are pinned by
  source contracts in `reflection-cutover.test.ts` (raw DELETE/INSERT and
  the `workerDb` parameter must not reappear).
- Never wire `wsUpgradeGuard` globally (`app.use`) or after an
  `upgradeWebSocket` handler — the F-4 acceptance tests pin exactly two
  route-level wirings, guard-first.
- Never edit `src/**/worker.generated.cjs` — it is a build artifact
  regenerated from `worker.ts` at worker-pool import.
