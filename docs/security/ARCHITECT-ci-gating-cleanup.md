# CI Gating + Ground-Rule Cleanup Plan — Audit Checks #2 / #5, CI Enforcement of #6/#7/#8

**Author:** THE ARCHITECT (research & planning only — no source modified)
**Repo:** `/home/williamdeldaymarketing/Projects/NeuroSyncMega` · **HEAD:** `a979caa`
**Date:** 2026-10-07
**Status:** PLAN — awaiting approval. No implementation performed.

> Scope discipline: this document is the agent's sole writable output.
> All findings below were verified independently against current `file:line` + snippet.
> Nothing is taken on trust from the Explore agent's handoff.

---

## §0. Independent verification of every handed-off fact

Verdict per claim: **CONFIRMED** unless marked otherwise. Deviations are listed in §9.

### V0. `docs/security/` = 6 files, ~92KB + ~23KB, untracked, must be committed (Axiom 1)

```
?? docs/security/                      ← entire dir untracked; working tree otherwise CLEAN
docs/security/:
  ARCHITECT-security-remediation-critical-perimeter.md   92241 B  (~92KB ✓)
  audit-loop/:
    audit-neg-v1.test.ts    4537 B
    audit-neg-v2.test.ts    4354 B
    audit-neg-v3.test.ts    3596 B
    AUDITOR-round1-findings.md   9338 B
    red-old-middleware.proof.ts  1086 B
    ─────────────────────────────
    audit-loop total          22911 B  (~23KB ✓)
```

- `git status --short` shows **only** `?? docs/security/` — no other modified/untracked files. **CONFIRMED.**
- Secret scan over `docs/security/` for `BEGIN PRIVATE|BEGIN RSA|BEGIN OPENSSH|***REMOVED-ANTHROPIC-KEY***|***REMOVED-GITHUB-PAT***|BEGIN SQLITE|SQLite format|api[_-]key\s*[:=]` → **zero hits**. No secrets, keys, or DB dumps. Safe to commit. **CONFIRMED.**

### V1. `.github/workflows/ci.yml` (36 lines) does NOT invoke audit-ground-rules

Current file, verified in full (`.github/workflows/ci.yml:1-36`):

| Line(s) | Step | Audit invocation? |
|---|---|---|
| 29–30 | `Typecheck: npx tsc --noEmit` | No |
| 32–33 | `Test: npm test` | No |
| 35–36 | `Build: npm run build` | No |
| — | audit step / pipefail / artifacts | **Absent — CONFIRMED** |

- `package.json:15` has `"audit:ground-rules": "tsx scripts/audit-ground-rules.ts"` — script exists, **unused by CI. CONFIRMED.**

### V2. Check #2 FAIL — `src/server/index.ts:1` unused `spawn` import

```
src/server/index.ts:1:  import { spawn } from 'child_process';
src/server/index.ts:7:  // then sets UV_THREADPOOL_SIZE and memory ceilings BEFORE spawning the main sidecar.
```

- `grep -n "spawn" src/server/index.ts` → exactly 2 hits: the import (`:1`) and the prose word "spawning" (`:7`, inside a `//` comment). No `spawn(` call, no `spawnSync`, no `exec`, no `require('child_process')`. Import is **dead. CONFIRMED FAIL.**
- Allowlist (`scripts/audit-ground-rules.ts:83-100`, `CHILD_PROCESS_ALLOWLIST`) has exactly **4 entries. CONFIRMED:**
  1. `src/core/portgrid/sandbox.ts` — approved CommandSandbox (general exec, ALLOWLIST + PathValidator).
  2. `src/core/portgrid/terminal-session.ts` — documented node-pty exception (bubblewrap containment).
  3. `src/core/memory/gitnexus-client.ts` — fixed-args `gitnexus` CLI spawn, no shell interpolation.
  4. `src/server/routes/system.ts` — `spawnSync('which', [cmd])` binary-existence probe (actual code at `src/server/routes/system.ts:450-451`).
- `src/server/index.ts` is **not** on the allowlist, so the dead import trips the check. **CONFIRMED.**

### V3. Check #5 FAIL — stale target `index.ts`, reality is `server-main.ts`

- Audit code (`scripts/audit-ground-rules.ts:271-314`, `checkGlobalOKFSeedWired`):
  - `:273` — `const serverIndex = path.join(repoRoot, 'src/server/index.ts');`
  - `:308-313` — regexes test `serverContent` (read from `index.ts`) for the `bootstrapGlobalOKFSeed` import and call; problems pushed as `src/server/index.ts does not import… / does not call…`.
- Reality:
  - `src/server/server-main.ts:16` — `import { bootstrapGlobalOKFSeed } from '../core/okf/global-seed';`
  - `src/server/server-main.ts:85` — `bootstrapGlobalOKFSeed();`
  - `grep -n "bootstrapGlobalOKFSeed" src/server/index.ts` → **zero hits. CONFIRMED.**
  - `src/server/index.ts` is a **32-line bootstrapper** (`:10-32`): `--profile` branch runs the hardware profiler, else dynamic-`import('./server-main.js')`. It never touches OKF.
  - `src/core/okf/global-seed.ts:68` — `export function bootstrapGlobalOKFSeed(` exists, and `resources/global_okf_seed/` holds **87 `.md` files across 5 subdirs** — so legs 1–2 of check #5 (seed dir, seed module) **PASS today**; only the import/call leg fails. **CONFIRMED FAIL (partial — 1 of 3 legs).**
- Tests pin the stale expectation (`scripts/audit-ground-rules.test.ts:208-251`):
  - `:217-221` — `writeWiredRepo` fixture writes the import+call into `src/server/index.ts`.
  - `:224` — pass-case titled `'…server/index.ts imports + calls it'`.
  - `:231-240` — fail-case asserts `does not call bootstrapGlobalOKFSeed` against an `index.ts` fixture.
  **CONFIRMED — fixture and both assertions must move to `server-main.ts` (§4).**

### V4. Checks 6/7/8 PASS — CONFIRMED with exact allowlist contents

**Check 6** — `SQL_INTERPOLATION_ALLOWLIST` (`audit-ground-rules.ts:341-364`), 6 entries:
1. `src/server/routes/coreexec-router.ts` (`${runFilter}, ${taskFilter}` — route-built literals)
2. `src/server/routes/llm.ts` (`${updates.join()}` — pushed literals)
3. `src/server/routes/projects.ts` (same pattern)
4. `src/core/okf/graph-query.ts` (C10 discovery — `?` + `params.push` for all request values)
5. `src/server/routes/okf.ts` (same)
6. `src/core/memory/cerebro/vector.ts` — **§5-17 DEFERRED**, recorded not silent. Verified live at `vector.ts:130`: `const filterSQL = typeFilter ? \`AND m.type = '${typeFilter}'\` : '';` — interpolated into the `db.prepare()` template at `:133-141` via `${filterSQL}`. Deferred per plan §5-17 (all production call sites pass literals/`undefined`); the allowlist comment says so explicitly. **CONFIRMED.**

**Check 7** — `RAW_EGRESS_ALLOWLIST` (`audit-ground-rules.ts:440-458`), 5 entries:
1. `src/core/routeswitch/egress.ts` — the governed door itself.
2. `src/core/routeswitch/adapters/` (prefix) — **§5-14 deferred**; live raw `fetch(` confirmed at `adapters/openai-compatible.ts:187,205,288`.
3. `src/core/memory/gitnexus-client.ts` — retained deliberate exception (C9 converted its eval-server sites to `egressFetch`; matches nothing today).
4. `src/server/routes/system.ts` — **§5-3 deferred** MCP probe; live raw `fetch(` at `system.ts:429` with `§5-3 (DEFERRED)` comments at `:402-409` and `:424-428`.
5. `src/ui/lib/api.ts` — deliberate browser-side module (documented C10 deviation).
**CONFIRMED.** (Note this file also carries the check-#2 allowlisted `spawnSync('which')` at `:450-451` — one file, two independent allowlist memberships. See deviation D3.)

**Check 8** — presence-only `hostname:` key inside the `serve({…})` literal (`audit-ground-rules.ts:545-585`):
- `src/server/server-main.ts:636-640` — `const server = serve({ fetch: app.fetch, port, hostname: bindAddress, });` with `bindAddress = process.env.NEUROSYNC_BIND || dbSetting('bind_address') || '127.0.0.1'` at `:619`. The check asserts the **key exists**, not the runtime value — fail-closed default lives in code, not in the audit. **CONFIRMED PASS.**

### V5. Runner exits 1 at 6/8 (`audit-ground-rules.ts:622,626`) — CONFIRMED

- `:608-623` — `main()` counts passes, prints `6/8 checks passed.`-style summary, `return passedCount === CHECKS.length ? 0 : 1;`
- `:625-627` — `if (require.main === module) { process.exit(main()); }`
- Auditor prescription recorded: CI must gate on **parsed output, not bare exit 0**, with `pipefail` — because during transition the runner *correctly* returns 1. **CONFIRMED as the design constraint for §2.**

---

## §1. Commit plan for `docs/security/`

### 1.1 What gets committed (all 6 files, as-is)

| # | Path | Size | Content class | Commit? |
|---|---|---|---|---|
| 1 | `docs/security/ARCHITECT-security-remediation-critical-perimeter.md` | 92,241 B | Plan (prose remediation design) | **Yes** |
| 2 | `docs/security/audit-loop/AUDITOR-round1-findings.md` | 9,338 B | Auditor findings (prose) | **Yes** |
| 3 | `docs/security/audit-loop/audit-neg-v1.test.ts` | 4,537 B | Negative-test draft | **Yes** |
| 4 | `docs/security/audit-loop/audit-neg-v2.test.ts` | 4,354 B | Negative-test draft | **Yes** |
| 5 | `docs/security/audit-loop/audit-neg-v3.test.ts` | 4,356 B | Negative-test draft | **Yes** |
| 6 | `docs/security/audit-loop/red-old-middleware.proof.ts` | 1,086 B | Proof snippet | **Yes** |
| 7 | **This plan** `docs/security/ARCHITECT-ci-gating-cleanup.md` | — | Plan (this file) | **Yes (same commit)** |

Per Axiom 1 (Absolute Contextual Permanence) all six are project memory and must be committed — the plan plus the full audit-loop trail, not a curated subset.

### 1.2 Pre-commit verification steps (executing agent MUST run these)

1. **Re-run the secret scan** immediately before `git add` (content may have shifted since this plan):
   `grep -rniE "BEGIN (PRIVATE|RSA|OPENSSH)|***REMOVED-ANTHROPIC-KEY***|***REMOVED-GITHUB-PAT***|gho_|xox[bap]-|api[_-]key\s*[:=]\s*['\"][A-Za-z0-9]|BEGIN SQLITE|SQLite format 3" docs/security/` → must return empty.
2. **Confirm no binary/non-text payloads:** `file docs/security/**` — all must report text (ASCII/UTF-8). No `.db`, `.db-journal`, `.sqlite`, `.gguf`, images, or archives.
3. **Confirm no stray files** swept in: `git status --short docs/security/` must list exactly the 7 `.md`/`.ts` files above — no `.data/`, no `backup-*.db`, no editor swapfiles.

### 1.3 `.gitignore` coverage check (verified, no change required)

| Path at risk | Ignored? | Evidence |
|---|---|---|
| `.data/` (live SQLite) | ✅ ` .gitignore:29` → `.data/` | `git check-ignore -v .data` hits line 29 |
| `backup-*.db` / `*-journal` | ✅ `.gitignore:55-56` | literal patterns present |
| `dist/` | ✅ `.gitignore:20` | present |
| `e2e-report/` | ⚠️ **not** in `.gitignore` — but **already tracked** (`git ls-files e2e-report` returns rows; `git check-ignore e2e-report` exits 1) | No action needed for *this* commit: `git add docs/security` cannot sweep in an already-tracked, unmodified directory. Flagged as hygiene debt only (see §9, D1). |

**Commit command (single atomic commit):**
`git add docs/security && git commit -m "docs(security): commit remediation plan + audit-loop trail (Axiom 1)"`
No source, config, test, or CI files in this commit. Docs only.

---

## §2. CI design — new audit step with strict output parsing

### 2.1 Placement: AFTER `Typecheck`, BEFORE `Test`. Justification.

1. **After `tsc --noEmit`:** type errors are the most fundamental breakage; running the audit first would waste its signal when the tree doesn't even typecheck. `tsc` is also the faster of the two gates.
2. **Before `npm test`:** the audit is a static file scan (milliseconds, see Axiom 6 note in §6). Failing fast here skips the multi-minute vitest suite on a tree that already violates ground rules — the cheapest possible red signal.
3. **Before `Build`:** unchanged; build stays last as the packaging proof.

Resulting job order: `checkout → setup-node → bubblewrap → sysctl → npm ci → tsc → AUDIT (new) → test → build`.

### 2.2 Phase A — transitional gate (ships first, while #2/#5 are still red)

The runner *correctly* exits 1 at 6/8, so `run: npm run audit:ground-rules` alone would red the pipeline with zero diagnostic value and no transition path. The gate therefore asserts on **parsed output**, exactly per the Auditor's prescription.

**Step definition (no new dependencies — bash + grep only, Node 22 runner image):**

```yaml
      - name: Ground-rule audit (transitional parsed-output gate)
        run: |
          set -o pipefail
          npm run audit:ground-rules 2>&1 | tee /tmp/opencode/audit.log
          # --- hard expectations: checks 1,3,4,6,7,8 MUST pass ---
          for label in \
            "PortGrid/CoreExec dashboards remain separate" \
            "Tests never touch the real database" \
            "No external database client dependencies" \
            "No untrusted SQL interpolation" \
            "No raw egress outside the governed door" \
            "Server binds loopback only" ; do
            grep -q "^\[PASS\] ${label}" /tmp/opencode/audit.log \
              || { echo "AUDIT GATE: expected PASS missing for: ${label}"; exit 1; }
          done
          # --- the only permitted FAILs during transition ---
          grep -q "^\[FAIL\] No unapproved shell-exec surface" /tmp/opencode/audit.log && KNOWN_FAIL_2=1 || KNOWN_FAIL_2=0
          grep -q "^\[FAIL\] Global OKF seed mechanism is wired up" /tmp/opencode/audit.log && KNOWN_FAIL_5=1 || KNOWN_FAIL_5=0
          # --- nothing else may fail ---
          if grep -E "^\[FAIL\]" /tmp/opencode/audit.log | grep -v -e "No unapproved shell-exec surface" -e "Global OKF seed mechanism is wired up"; then
            echo "AUDIT GATE: unexpected FAIL line present"; exit 1
          fi
          echo "AUDIT GATE (transitional): 6 must-pass checks green; known FAILs: #2=${KNOWN_FAIL_2} #5=${KNOWN_FAIL_5}"
```

**Why this exact shape:**

- `set -o pipefail` — without it, `npm run … | tee` returns `tee`'s exit code and a failing audit looks green. This is the Auditor's explicit requirement.
- `tee /tmp/opencode/audit.log` — preserves the full log as a CI artifact-adjacent file for post-mortem (upload via `actions/upload-artifact` is optional Phase-B polish; the log path uses the pre-approved temp dir).
- **Match on `^\[PASS\] <full label>`** (anchored, full-string labels from the `CHECKS` table at `audit-ground-rules.ts:596-606`), not on counts. Count-based gating (`6/8`) would silently accept a future where check 6 regresses and check 2 gets fixed (still "6/8"). Label-anchored gating cannot be fooled by failure permutation.
- **Known-FAIL allowlist is label-exact**, not count-based, for the same reason: the gate passes at 6/8 today, at 7/8 after either fix lands (§6 order), and at 8/8 — it only ever fails on an *unexpected* FAIL. No gate edit is needed between the #2 and #5 fix commits.
- The two known-FAIL labels are the **exact `message` prefixes** the runner prints: `No unapproved shell-exec surface` (`:174`) and `Global OKF seed mechanism is wired up` (`:319`). The `grep -v` exclusion list must cite these exact strings; any drift in runner wording breaks the gate loudly (desired — wording drift is itself a review trigger).

### 2.3 Phase B — final gate (ships after §4 lands and the tree reads 8/8)

Replace the whole Phase-A block with:

```yaml
      - name: Ground-rule audit
        run: |
          set -o pipefail
          npm run audit:ground-rules 2>&1 | tee /tmp/opencode/audit.log
```

- Bare exit code is now the gate: runner returns 0 iff 8/8 (`:622`). `pipefail` still required for the same `tee`-masking reason.
- Optionally add `grep -q "8/8 checks passed" /tmp/opencode/audit.log` as a belt-and-braces assertion against runner-logic drift (cheap, recommended).
- Phase B is a **separate atomic commit** that must only land when the Auditor has signed off on 8/8 (§7). Landing it early reds `main` by design — that is the point, but the timing must be deliberate.

### 2.4 Node 22 compat / dependency notes

- The step shells out to the existing `audit:ground-rules` script (`tsx scripts/audit-ground-rules.ts`) — `tsx` is already a devDependency (`package.json:98`), Node 22 is already the runner version (`ci.yml:17`). **Zero new dependencies, zero version changes.**
- No artifacts, caches, services, or secrets are required. The scan reads files off disk only.

---

## §3. Fix #2 — remove the unused `spawn` import in `src/server/index.ts`

### 3.1 The change (one line)

```diff
--- a/src/server/index.ts
+++ b/src/server/index.ts
@@ -1,4 +1,3 @@
-import { spawn } from 'child_process';
-
 // §6.0 — Genesis Hardware Profiler integration
```

Nothing else in the file is touched (bootstrapper logic, comments, dynamic imports all preserved — no silent stripping).

### 3.2 Proof of zero references (for the Auditor / reviewer)

- `grep -n "spawn" src/server/index.ts` returns exactly `:1` (the import) and `:7` (the word "spawning" inside a `//` comment). There is no `spawn(`, `spawnSync(`, `exec(`, `execSync(`, or `require('child_process')` anywhere in the file.
- Cross-file safety is structural: removing an *import binding* cannot affect any other module (nothing can import `spawn` *from* `index.ts` — it is never re-exported; the bootstrapper's only outward behavior is the `--profile` branch and the `import('./server-main.js')` side effect, neither of which references the binding).
- Executing-agent verification: after the edit, run `npx tsc --noEmit` — it must pass. (If `noUnusedLocals` were enabled the current tree would already be erroring on the dead import; removal is safe under either setting.) Then run `npm run audit:ground-rules` and confirm check #2 flips to PASS and the summary reads `7/8`.

### 3.3 Allowlist: UNCHANGED

- `CHILD_PROCESS_ALLOWLIST` keeps exactly its 4 entries (§0, V2). `src/server/index.ts` was never on it and must not be added — the fix is removal of the violation, not allowlisting of it. The executing agent must show `git diff scripts/audit-ground-rules.ts` is empty after this step.

---

## §4. Fix #5 — retarget the OKF-seed check from `index.ts` to `server-main.ts`

### 4.1 Why `index.ts` must NOT be the target (bootstrapper role)

`src/server/index.ts` (32 lines) has exactly two responsibilities: run the Genesis hardware-profiler probe under `--profile`, or dynamic-import `./server-main.js`. All server wiring — Hono app, routes, DB init, and the `bootstrapGlobalOKFSeed()` call — lives in `server-main.ts`. Asserting OKF wiring against the bootstrapper tests the wrong file: it fails on a correct tree (today) and would pass on a broken tree where someone moved the call into the bootstrapper (unreviewed surface expansion). The check must assert on the file that **owns** the behavior.

### 4.2 Exact changes in `scripts/audit-ground-rules.ts`

All inside `checkGlobalOKFSeedWired` (`:271-327`). Introduce a single canonical constant so the path is never again hard-coded in three places (this addresses the brittleness directly):

```ts
/** Canonical server entrypoint that owns runtime wiring (NOT the index.ts bootstrapper). */
const SERVER_ENTRY = 'src/server/server-main.ts';
```

then:

| Line(s) | Old | New |
|---|---|---|
| `:273` | `path.join(repoRoot, 'src/server/index.ts')` | `path.join(repoRoot, SERVER_ENTRY)` (+ rename local `serverIndex` → `serverEntry` for clarity) |
| `:305` | `'src/server/index.ts not found'` | `` `${SERVER_ENTRY} not found` `` |
| `:312` | `'src/server/index.ts does not import bootstrapGlobalOKFSeed from global-seed'` | `` `${SERVER_ENTRY} does not import bootstrapGlobalOKFSeed from global-seed` `` |
| `:313` | `'src/server/index.ts does not call bootstrapGlobalOKFSeed()'` | `` `${SERVER_ENTRY} does not call bootstrapGlobalOKFSeed()` `` |

The two detection regexes (`:308-310` import, `:311` call) are **unchanged** — they already correctly describe the import/call shapes; only the file under test was wrong. The seed-dir leg (`:278-293`) and seed-module leg (`:295-302`) are **unchanged** (both pass today).

**Brittleness note for reviewer:** even with the constant, a future rename of `server-main.ts` breaks the check loudly (FAIL with `…not found`) rather than silently — fail-loud on path drift is the intended property. The constant's doc comment must state the bootstrapper exclusion so the next editor doesn't "fix" the failure by pointing it back at `index.ts`.

### 4.3 Exact changes in `scripts/audit-ground-rules.test.ts`

Inside the `checkGlobalOKFSeedWired` describe (`:208-251`):

1. `writeWiredRepo` (`:209-222`): write the import+call fixture to `src/server/server-main.ts` instead of `src/server/index.ts`.
2. Pass-case title (`:224`): `'…server/index.ts imports + calls it'` → `'…server-main.ts imports + calls it'`.
3. Fail-case (`:231-240`): fixture path → `src/server/server-main.ts`; assertion string unchanged (`does not call bootstrapGlobalOKFSeed`).
4. **New regression test (required):** a wired `server-main.ts` PLUS a seed-call-free `index.ts` bootstrapper must PASS — this pins the bootstrapper exclusion so a future edit cannot reintroduce `index.ts` as the target without breaking the suite:
   ```ts
   it('passes when wiring lives in server-main.ts even though the index.ts bootstrapper lacks it', () => {
     const repo = newTempRepo(tempDirs);
     writeWiredRepo(repo);
     fs.writeFileSync(path.join(repo, 'src/server/index.ts'), "// bootstrapper — no OKF wiring here\n");
     expect(checkGlobalOKFSeedWired(repo).passed).toBe(true);
   });
   ```
5. Executing-agent verification: full `npm test` green (no other test references `src/server/index.ts` in an OKF context — reviewer to confirm via grep), plus `npm run audit:ground-rules` reads `8/8`.

---

## §5. Checks 6/7 enforcement — CI must fail on any NEW unallowlisted violation

No code changes are required to checks 6/7 themselves — they already PASS, which is exactly what makes them enforceable: **any** new unallowlisted `.prepare(`/`` .exec( `` interpolation or bare `fetch(` flips its check to FAIL, and the Phase-A gate (§2.2) fails the pipeline because the FAIL label is not in the known-FAIL set. The enforcement is emergent from the gate design, not from new scan logic.

What the executing agent and reviewer must hold invariant:

**Check 6 allowlist (frozen at 6 entries, `audit-ground-rules.ts:341-364`):**
`coreexec-router.ts`, `llm.ts`, `projects.ts` (routes) · `graph-query.ts`, `okf.ts` · `vector.ts` (§5-17 deferred).
**Check 7 allowlist (frozen at 5 entries, `audit-ground-rules.ts:440-458`):**
`egress.ts` · `adapters/` (prefix, §5-14 deferred) · `gitnexus-client.ts` · `system.ts` (§5-3 deferred) · `ui/lib/api.ts`.

Rules:
1. **Deferred entries stay visible, never silently widened.** `vector.ts`, `adapters/`, and `system.ts` remain on their allowlists with their `§5-N DEFERRED` comments intact until the corresponding §5 item lands in its own reviewed change. A fix that *removes* interpolation/fetch from a deferred file removes that file from the allowlist in the same commit (cf. the `transport.ts`/`sync.ts` precedent — deliberately absent, pinned by tests at `audit-ground-rules.test.ts:308-319,405-412`).
2. **Any allowlist addition requires** a written justification comment at the entry site + a corresponding negative-test update, per the file's own header contracts (`:333-340`, `:435-438`). The CI gate cannot enforce comment quality — the human reviewer must.
3. **The allowlist-pinning tests** (`test.ts:321-332` exact-`toEqual` on the check-6 list; `:368-384` allowlisted-files pass for check 7) are the tripwire against silent growth/shrink. Check 7 has no exact-`toEqual` pin today — **recommended (non-blocking):** add one mirroring the check-6 pin. Left as an open decision (§8, O2).

---

## §6. Execution order (atomic commits), Axiom 6 cost, module boundaries

### 6.1 Commit sequence — each step independently revertable

| # | Commit | Files touched | Expected audit state after |
|---|---|---|---|
| 1 | Docs commit (§1) | `docs/security/` only (7 files) | 6/8 (unchanged — docs don't affect the scan) |
| 2 | CI Phase-A gate (§2.2) | `.github/workflows/ci.yml` only | Pipeline green with known FAILs #2+#5 logged |
| 3 | Fix #2 (§3) | `src/server/index.ts` (1 line deleted) | 7/8 (only #5 FAILs; gate still green — no gate edit needed) |
| 4 | Fix #5 + test updates (§4) | `scripts/audit-ground-rules.ts`, `scripts/audit-ground-rules.test.ts` | **8/8** |
| 5 | CI Phase-B gate (§2.3, Auditor sign-off required) | `.github/workflows/ci.yml` only | Strict exit-0 gating |

Revert safety: steps 3 and 4 touch disjoint concerns (bootstrapper import vs. audit targeting); either reverts cleanly without taking the other down. Step 5 reverts to Phase A without code changes.

### 6.2 Axiom 6 (Dynamic Environmental Sovereignty) cost — negligible

The audit is a **static file scan**: `walkFiles` over `src/**/*.ts(x)` with regex tests, no server boot, no DB open, no network, no writes (zero eMMC pressure). Runtime is milliseconds on any tier including `constrained`. CI cost is one `npm run audit:ground-rules` invocation reusing the already-installed toolchain (`tsx` present). No profiler, watcher, or worker involvement.

### 6.3 Module boundaries — no violations

- The audit script lives in `scripts/` (repo tooling). It is **not** BaseVault logic (never opens the DB), **not** CoreExec (never executes workflows), **not** ScopeLogic/Cerebro (makes no plans, holds no memory), and **not** a PortGrid consent surface. It reads files and prints verdicts.
- Fix #2 touches the server **bootstrapper**, not CoreExec engine, BaseVault schema, or any route — behavior-neutral by construction (dead import).
- Fix #5 touches **audit tooling + its tests** — production wiring in `server-main.ts` is not moved, renamed, or reordered. The call stays exactly at `server-main.ts:85`.

---

## §7. Test plan for the Auditor

### T1. Negative tests — a new violation MUST trip its check (all runnable today, pre-fix)

| # | Procedure (synthetic temp-repo, never touching real files — same pattern as `audit-ground-rules.test.ts`) | Expected |
|---|---|---|
| N2 | Temp repo + `src/server/evil.ts` containing `import { execSync } from 'child_process'` → `checkShellExecSurface` | FAIL naming `evil.ts` (mirrors existing test `:123-132`; Auditor re-runs to confirm the gate input is live) |
| N6 | Temp repo + `src/core/x/rogue.ts` containing `` db.prepare(`DELETE FROM t WHERE id = ${req.query.id}`) `` → `checkNoUntrustedSqlInterpolation` | FAIL naming `rogue.ts` (existing test `:289-297`) |
| N7 | Temp repo + `src/core/x/rogue.ts` containing `fetch("https://example.invalid")` → `checkNoRawEgress` | FAIL naming `rogue.ts` (existing test `:386-394`) |
| N5-fixed | Temp repo with wiring **only** in `index.ts`, bare `server-main.ts` → retargeted `checkGlobalOKFSeedWired` | **FAIL** (proves the target moved; stale-tree detection) |
| N8 | Temp repo `server-main.ts` with `serve({ port, fetch })` and no `hostname:` → `checkServerBindsLoopback` | FAIL mentioning `hostname:` (existing test `:430-438`) |
| N-gate | Feed a canned audit log containing `[FAIL] No untrusted SQL interpolation` into the §2.2 gate script | Gate exits 1 via the unexpected-FAIL branch |

### T2. Positive tests — fixed tree MUST pass

| # | Procedure | Expected |
|---|---|---|
| P2 | Real tree after §3: `npm run audit:ground-rules` | `[PASS] No unapproved shell-exec surface`, summary `7/8` |
| P5 | Real tree after §4: `npm run audit:ground-rules` | `[PASS] Global OKF seed mechanism is wired up`, summary `8/8` |
| P-boot | New regression test (§4.3.4) | Passes — bootstrapper without OKF wiring does not affect check #5 |

### T3. Regression — full suite + gate-logic tests

1. `npx tsc --noEmit` clean after every commit (steps 3, 4).
2. Full `npm test` (vitest) green after step 4 — includes the retargeted `audit-ground-rules.test.ts` suite.
3. Gate-logic tests (Auditor-owned, new): unit-test the Phase-A shell logic against canned logs — (a) 6/8-with-known-FAILs → exit 0; (b) 7/8 (either fix landed solo) → exit 0; (c) 8/8 → exit 0; (d) any log with an unexpected FAIL (e.g. check 6) → exit 1; (e) log where an expected PASS is missing → exit 1. These can ship as a small bats/shunit-style script or as CI `if:` dry-run — Auditor's choice (open decision O3).

---

## §8. Open decisions (require a human / Auditor ruling — NOT assumed)

- **O1 — `e2e-report/` hygiene:** the directory is tracked but unignored (deviation D1). Out of scope for this plan, but the Auditor should rule whether to add it to `.gitignore` + untrack in a follow-up. This plan's commits do not touch it.
- **O2 — Check-7 allowlist pin:** add an exact-`toEqual` pin test for `RAW_EGRESS_ALLOWLIST` mirroring check 6's (`test.ts:321-332`)? Recommended, non-blocking. Proposed owner: Auditor's verification pass.
- **O3 — Gate-logic test harness:** bats vs. ad-hoc shell vs. Auditor manual run (§7, T3.3). Recommend Auditor picks whatever they will actually re-run.
- **O4 — Phase-B timing:** exact sign-off condition for swapping to the strict exit-0 gate (suggest: Auditor attests 8/8 on `main` + full suite green, §7 T2/T3 complete).
- **O5 — Artifact upload:** whether Phase B should `actions/upload-artifact` the audit log on failure. Cosmetic; default no.

---

## §9. Deviations from the handoff (all minor, none blocking)

- **D1 — `e2e-report/` is tracked, not ignored.** Handoff said ".gitignore check for `.data`/backup/`e2e-report` exclusion". Verified: `.data/` ✅ (`:29`), `backup-*.db` ✅ (`:55-56`), but `e2e-report/` is **absent from `.gitignore` yet already committed** (`git ls-files e2e-report` returns rows; `git check-ignore` exits 1). Impact on this plan: **none** — `git add docs/security` cannot sweep it in. Recorded as follow-up hygiene (O1).
- **D2 — Working tree otherwise clean.** Only `?? docs/security/` in `git status`. No conflicting modifications to `ci.yml`, the audit script, or server files — the plan's line references are stable as of HEAD `a979caa`.
- **D3 — `system.ts` holds two independent allowlist memberships.** `src/server/routes/system.ts:429` (raw `fetch`, check-7 §5-3 deferral) **and** `:450-451` (`require('child_process')` + `spawnSync('which')`, check-2 allowlist). A future edit touching either surface must re-justify only its own membership — the two must not be conflated in review.
- **D4 — Check #5 is a single-leg failure, not total.** Seed dir (87 `.md` files, 5 subdirs) and seed-module export (`global-seed.ts:68`) both pass; only the `index.ts` import/call leg fails. Fix scope is correspondingly narrow (§4.2).
- **D5 — Handoff cited `audit-ground-rules.ts:272,304-314`; actual span is `:271-327`** (function opens at `:271`, closes at `:327`). Line refs in this plan use the verified span. Substantive claim (stale `index.ts` target) confirmed regardless.
