# AUDITOR Round-2 Findings — CI Gating + Cleanup (C11–C15 on top of a979caa)

**Role:** THE AUDITOR — verification only. No source modified by this pass.
**Repo:** `/home/williamdeldaymarketing/Projects/NeuroSyncMega` · **HEAD:** `ab512cd` · tree clean.
**Spec:** `docs/security/ARCHITECT-ci-gating-cleanup.md` (HEAD version, 385 lines).
**Method:** every claim re-proven by direct execution. Engineer logs never trusted.
**Date:** 2026-10-07.

## Verdicts

| # | Item | Verdict |
|---|---|---|
| 1 | Re-run tsc, audit (8/8 exit 0, no pipes), full suite | **PASS** |
| 2 | Fix #2: dead import gone, zero refs, allowlist intact, check passes | **PASS** |
| 3 | Fix #5: SERVER_ENTRY retarget, passes real tree, FAILs index.ts-only tree | **PASS** |
| 4 | Checks 6/7 pins load-bearing (widen-in-copy → pin RED, restored) | **PASS** |
| 5 | CI gate: 8/8→pass, 7/8→fail, unknown FAIL→fail; pipefail; no new deps | **PASS** |
| 6 | docs/security/ committed (7 files), no secrets, e2e-report + §5 deferrals untouched | **PASS** |
| 7 | No dist/generated.cjs edits | **PASS** |

**Result: CLEARANCE — 7/7 PASS. No FAILs to relay. Phase-B gate (§2.3) sign-off condition (§7 T2/T3) is met on this tree.**

---

## 1. Independent re-runs (evidence, not logs)

- `npx tsc --noEmit` → exit `0`. (Note: `npm test` script already bundles
  `NODE_OPTIONS=--max-old-space-size=512` + `--fileParallelism=false`; appending
  `-- --fileParallelism=false` duplicates the flag and vitest aborts with
  `Expected a single value for option "--fileParallelism"`. Correct invocation is
  bare `npm test`. This was an Auditor harness error, not a repo defect — first
  attempt died at startup, second attempt is the evidence below.)
- `npm run audit:ground-rules` via stdout-redirect (no pipe, so exit code is the
  runner's own): exit `0`, all 8 lines `[PASS]`, summary `8/8 checks passed.`
- Full step verbatim from `ci.yml:42-45` (mkdir + `set -o pipefail` + pipe through
  `tee` + trailing grep): `PIPESTATUS[0]=0`, `grep -q "8/8 checks passed"` exit `0`.
- `npm test` (sequential, max-old-space 512): **Test Files 88 passed (88),
  Tests 685 passed (685), SUITE_EXIT:0.** Matches the claimed "88/685" exactly —
  88 files, 685 tests.

## 2. Fix #2 (dead `spawn` import)

- `src/server/index.ts` is now 30 lines, opens with the `§6.0` comment — the
  `import { spawn } from 'child_process';` line is gone (`git diff` confirms a
  2-line deletion, nothing else touched).
- `grep -n "spawn" src/server/index.ts` → exactly one hit: line 5, the word
  "spawning" inside a `//` comment. No `spawn(`, `spawnSync(`, `exec(`, `require(`.
- `CHILD_PROCESS_ALLOWLIST` (`audit-ground-rules.ts:83-100`) holds exactly the
  original 4 entries; `git diff` on the allowlist region is empty.
- Check #2 on the real tree passes; the only prose `child_process` mentions
  (`coreexec/worker.ts:14,46`) match no scan pattern (patterns require an import,
  `require()`, or a bare call — comment prose matches none), confirmed by the
  live audit listing exactly 3 approved files found and zero unapproved.

## 3. Fix #5 (SERVER_ENTRY retarget)

- `const SERVER_ENTRY = 'src/server/server-main.ts'` at `audit-ground-rules.ts:281`,
  with bootstrapper-exclusion doc comment (`:271-280`). All four former
  `index.ts` references (`:273,305,312,313` per plan) now use the constant.
  Detection regexes unchanged — only the file under test moved. **PASS.**
- Real tree: `server-main.ts:16` imports `bootstrapGlobalOKFSeed`,
  `:85` calls it; `grep bootstrapGlobalOKFSeed src/server/index.ts` → zero hits.
  Check #5 `[PASS]`. **PASS.**
- Regression tests (`audit-ground-rules.test.ts:258-276`, run in isolation):
  5/5 pass in `checkGlobalOKFSeedWired`, including
  `passes when wiring lives in server-main.ts even though the index.ts
  bootstrapper lacks it` (bootstrapper exclusion pinned) and
  `fails when the wiring lives only in the index.ts bootstrapper and
  server-main.ts is bare` (stale-tree detection). **PASS.**

## 4. Checks 6/7 pins are load-bearing

- Pins exist: check-6 exact-`toEqual` (`test.ts:351-360`, 6 entries),
  check-7 exact-`toEqual` (`test.ts:443-449`, 5 entries).
- Probe: copied `scripts/` to `/tmp/opencode/pinprobe` (real tree untouched),
  appended one bogus entry to EACH allowlist in the copy, ran vitest with
  `--root` on the copy filtered to `pins the allowlist` → **2 failed, 36 skipped**.
  Each widening trips its own pin independently (both pin tests named in the
  failure output). Probe copy deleted afterwards; `git status` clean. **PASS.**

## 5. CI gate (`ci.yml:40-45`)

- Step order: Typecheck (`:29-30`) → Ground-rule audit (`:40-45`) → Test (`:47-48`)
  → Build. Placement per plan §2.1. **PASS.**
- `set -o pipefail` present (`:43`); Phase-B shape (bare exit code + `8/8`
  belt-and-braces grep per plan §2.3). **PASS.**
- Gate-tail replica (exact `cat|tee` + `grep -q "8/8 checks passed"` semantics,
  canned logs): `8/8 → exit 0`; canned `7/8 → exit 1`; canned unknown-FAIL
  (check-6 rogue, `7/8`) `→ exit 1`. **PASS.**
- No new deps: `git diff a979caa..HEAD -- package.json package-lock.json` empty;
  step shells out to existing `audit:ground-rules` (`tsx`, already a devDep);
  Node 22 runner unchanged. **PASS.**

## 6. Docs commit, secrets, untouched surfaces

- `git ls-files docs/security/` → exactly 7 files (plan + perimeter doc +
  round-1 findings + 3 neg-tests + proof snippet). Committed in `d34b0ec`. **PASS.**
- Secret scan (plan §1.2 pattern): only 2 hits, both in
  `ARCHITECT-ci-gating-cleanup.md:35,130` — the plan quoting its own scan
  pattern/command. No keys, tokens, key blocks, or SQLite dumps. `file(1)`:
  all 7 report text. **PASS (self-referential hits only, no live secrets).**
- `git diff a979caa..HEAD --stat -- e2e-report/ src/core/memory/cerebro/vector.ts
  src/core/routeswitch/adapters/ src/server/routes/system.ts` → **empty**.
  Deferrals verified live and intact: `vector.ts:130` `filterSQL` interpolation,
  `system.ts:402-409,424-428` §5-3 comments + raw `fetch`, adapters raw
  `fetch(` at `openai-compatible.ts:187,205,288`. **PASS.**

## 7. No transient-artifact edits

- `git diff a979caa..HEAD --name-only` → exactly 11 files: `ci.yml`,
  7× `docs/security/`, `audit-ground-rules.ts`, `audit-ground-rules.test.ts`,
  `src/server/index.ts`. No `dist/`, no `*.generated.cjs`, no `*.db`/`*.sqlite*`,
  no untracked leftovers (`git status --short` clean after probe removal). **PASS.**

---

## Notes for the orchestrator (non-blocking)

1. `npm test` already encodes the memory/parallelism flags — future runbooks should
   invoke bare `npm test`, never append `-- --fileParallelism=false` (vitest hard-errors
   on the duplicate).
2. The secret-scan pattern self-matches the plan doc that documents it (2 meta-hits).
   Harmless, but any future automated scan-gating on zero-hits must exclude
   `ARCHITECT-ci-gating-cleanup.md:35,130` or it will false-positive.
3. This findings file is intentionally **untracked and uncommitted** per instruction.
   Committing it is the orchestrator's call (Axiom 1 would favor committing the
   audit trail in the next docs pass).
