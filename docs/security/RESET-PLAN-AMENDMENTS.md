# Phase 0 Addendum — Reset-Plan Amendments + Branch Hygiene (ENGINEER record)

**Status:** RECORD ONLY — no `src/`, DB, or history modified by this document.
**Plan amended:** `docs/security/ARCHITECT-canonical-reset.md` (NOT edited here).
**Decisions applied:** `docs/security/DECISIONS-LOG.md` D3, D6, D8 (OD-7 noted pre-resolved below).
**Branch hygiene:** 84 local `backup/reflog-rescue-*` branches deleted (local-only, §5).
**Date:** 2026-10-07. Engineer: Phase 0 runbook execution.

Every file:line cite below was verified against disk before writing.

---

## (a) Exposure narrowing — S-3 is oss-readiness-lineage-only; S-1/S-2 are main-track

- The secret-bearing backup (`.data.bak_20261001_104101/.master.key` + `neurosync.db`)
  was introduced in exactly one commit, `165f9b6`
  (`fix(cerebro): fix worker pool crashing due to worker-in-worker instantiation` —
  verified via `git show --stat 165f9b6` listing both `.bak` files, and
  `git log --all --oneline -- .data.bak_20261001_104101/` returning only `165f9b6`).
- Lineage check (verified): `git branch --contains 165f9b6` returns **only `oss-readiness`**;
  `git merge-base --is-ancestor 165f9b6 main` is **false** (main does NOT contain it).
- Consequence: **S-3 exposure is scoped to the oss-readiness lineage.** Any clone taken
  from `main` at or after the divergence point never carried the `.bak` key material.
  S-1/S-2 (live-DB `llm_providers.api_key_encrypted` rows + live `.data/.master.key`)
  remain **main-track** and are handled by the DB-wipe + rotation procedure regardless.
- The incident treatment itself is unchanged: **ciphertext + committed key =
  plaintext-equivalent to anyone holding the clone**, so provider-side rotation is
  mandatory regardless of scrub —
  cite `ARCHITECT-canonical-reset.md:162`
  ("Key rotation is mandatory regardless of scrub (clones already exist)").
- Scrub scope follows the same narrowing: the `--invert-paths` scrub only needs to
  cover the oss-readiness lineage that carries `165f9b6` (§6).

## (b) R-1 open-scrub restatement — operator-approved, post-content-commits only

- R-1 (`ARCHITECT-canonical-reset.md:310`): "History scrub rewrites pushed `main` —
  collaborators' clones diverge." Mitigation as written: announce + force-push window
  with the `git fetch origin && git reset --hard origin/main` runbook line, and
  **"Scrub is a separate operator-approved step AFTER all content commits land."**
- Restatement per DECISIONS-LOG **D3** (OD-6, option A scoped): branch/artifact cleanup
  first, `filter-repo --analyze` before any scrub, operator approval required,
  post-content-commits only. No scrub, force-push, or `push --delete` was performed
  in Phase 0 — analyze output only (§6), per the HARD NO-GO.
- Cite: `ARCHITECT-canonical-reset.md:310` + `DECISIONS-LOG.md` D3
  (evidence `:161,230-231,310,330`).

## (c) DegradationEngine correction — DELETE with D-14, close the rewrite conditional

- Verified against disk:
  - `grep -rn DegradationEngine src/core/basevault/schema.ts src/ui/components/Statusline.tsx`
    → **zero hits**. The `schema.ts`/`Statusline.tsx` references hypothesized at
    `ARCHITECT-canonical-reset.md:116,227` do not exist on this tree (both files exist;
    neither names `DegradationEngine`).
  - `grep -rn DegradationEngine src/` → exactly two hits: `src/ui/DegradationEngine.test.tsx`
    (the test itself, which `import App from './App'` at `:8` — the orphan App) and
    `src/ui/components/chat-backend-routing.test.ts:8` (a **comment** explaining why that
    suite avoids jsdom: "it breaks the pre-existing DegradationEngine.test.tsx too").
- Disposition per DECISIONS-LOG **D8**: **DELETE** `src/ui/DegradationEngine.test.tsx`
  with the D-14 orphan-App subtree; the rewrite conditional is **closed** (no real
  component found — only the test name plus a comment mention). The Phase 3 item-8
  OSLayout ticket stands as a rider: if a real component surfaces later, rewrite its
  test against `OSLayout` then.
- Cites: `ARCHITECT-canonical-reset.md:116,227` + `DECISIONS-LOG.md` D8
  (evidence `:103,116,212,227,329`).

## (d) OD-1 keep-one — `system-maintenance` is code-created

- Verified: `src/core/scoutdaemon/idle.ts:120-127` (idle handler: `INSERT OR IGNORE INTO
  projects … 'system-maintenance'` + `INSERT INTO workflow_runs … 'pending'`) and
  `:217-224` (indexing-flush path: same project upsert + `INSERT INTO workflow_runs …
  'pending' … 'track2'`). Two writers, one idempotent project key.
- Disposition per DECISIONS-LOG **D6**: **keep-one** — at DB purge, keep the
  `system-maintenance` project row, delete only the test projects. Amends the plan
  default (was purge-all-3). Reversible pre-purge via snapshot.
- Cites: `src/core/scoutdaemon/idle.ts:120-127,217-224` + `DECISIONS-LOG.md` D6
  (evidence `ARCHITECT-canonical-reset.md:312,325`).

---

## Recorded state (verified, no changes made for these)

- **OD-7 pre-resolved — NO `.gitignore` appends.** All four patterns already exist:
  `.gitignore:58` (`.data.bak*/`), `:61` (`e2e-report/`), `:62` (`test-results/`),
  `:63` (`playwright/.cache/`). `git check-ignore -v` confirms each. Nothing to append.
- **Artifacts grep-clean (untracked, ignored).** `git ls-files e2e-report test-results`
  → empty (present on disk, NOT tracked — the plan's §0.6 "tracked" statement is stale
  for this tree; no `git rm --cached` needed). Secret grep (N-1 pattern over
  `src/ scripts/ e2e/ index.html`) returns only the two documented fixtures:
  `scripts/crypto-test.ts:8` (`***REMOVED-ANTHROPIC-KEY***…`, S-6, dies with D-10 script deletion)
  and `e2e/global-setup.ts:25` (`neurosync-e2e-operator-pw`, S-4, KEEP + documented).
- **Phase 3 proposed item-9 (new): consolidate `idle.ts` dual writers.** The two
  `system-maintenance` staging blocks (`idle.ts:120-133` and `:217-230`) duplicate the
  project-upsert + run/task-insert sequence with only the `dag_layout`/`track` differing.
  Proposal: extract a single `stageMaintenanceRun(dagLayout, track?)` helper; keep the
  ScoutDaemon boundary (stage `pending` rows only, never `executeRun` — P8-1). Gated
  behind the same per-commit gate (`tsc` + shard + audit). Needs explicit sign-off;
  NOT started here.
- **Phase 4 riders (carried, not executed):** provider-side rotation at the dashboards
  (R-2, NOT covered by scrub — `:162-163`); `.master.key` boot gate (verify keygen path
  pre-deletion, OD-3 option A auto-gen + boot assert); S-1/S-3 incident treatment stands
  regardless of scrub (`:174-176`); OD-6 option A scoped (analyze-before-scrub, operator
  approval); fresh-clone equivalence (§5.8).

---

## §5 Branch hygiene (local-only git ops, not committed)

- Pre-existing branch list recorded to `/tmp/opencode/phase0-branches.txt`
  (full `git branch -a` snapshot before deletion).
- Deleted: **84** local branches matching `backup/reflog-rescue-*` via
  `git branch --list 'backup/reflog-rescue-*' | xargs git branch -D`.
  **Local only — no remote refs touched** (verified: `git branch -r | grep -i rescue`
  → empty before and after).
- Post-delete verification: zero local `backup/reflog-rescue-*` remain.

## §6 `oss-readiness` — NO destructive action taken

- State: local `oss-readiness` = `d6e5869`, remote `origin/oss-readiness` = `97030a4`
  (diverged; same subjects, different SHAs). The branch carries the `165f9b6`
  `.bak` lineage (§a). Left untouched per the runbook.
- Recommended commands for the operator-approved step (NOT executed — approval note):
  after all content commits land and rotation is scheduled,
  `git push origin --delete oss-readiness` followed by local `git branch -D oss-readiness`,
  **only with explicit operator approval** (D3 / R-1 force-push window applies to any
  history rewrite; branch deletion itself is ref-removal, coordinated the same way).

## §7 Read-only analyze (fresh copy — working repo never touched with rewrite flags)

- Ran `git filter-repo --analyze` in a fresh clone/tmp copy (never the working repo),
  reviewed `e2e-report/` + `test-results/` paths. NO rewrite flags, NO `--invert-paths`,
  NO force-push. Output summary recorded in the Phase 0 report-back
  (commit message + orchestrator handoff); raw report retained in the temp copy path
  cited there.
- Analyze result (fresh clone of `main` @ `7682e5e`, 268 commits processed,
  report at `<tmp>/phase0-analyze/.git/filter-repo/analysis/`):
  - `e2e-report/` + `test-results/` blobs ARE in history (committed then deleted;
    deletion dates 2026-10-06/07 in `path-all-sizes.txt`), though HEAD tracks neither
    (§recorded state). Largest single blob: `e2e-report/index.html` (~1.0 MB unpacked).
    Scrub path set for the operator-approved step must include both dirs alongside
    `.data.bak_20261001_104101/`.
  - `.data.bak_20261001_104101/` = 217,120 B unpacked, still `<present>` in history —
    confirms the S-3 scrub target.
  - Largest historical blobs (`.node`, `.c`, deleted 2026-06-25) are out of scope.
