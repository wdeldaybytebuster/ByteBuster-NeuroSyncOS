# P1 Follow-ups Process

Scope: how the remediation plan (`FOLLOWUPS-P1-REMEDIATION.md`) is executed. Plan holds the *what*; this holds the *loop, models, branches, and done-bar*.

## 1. Four-stage loop

Each task passes through four stages in order. Stages are separate agent turns (per mandatory Agent Design Workflow); a stage never does the next stage's job.

1. **Explorer** — read-only. Re-verifies the task's file:line cites on the current HEAD, pastes snippets, flags deviations from the plan (cf. `ARCHITECT-canonical-reset.md:10-12` deviation convention). Output: fact list with cites. Never edits.
2. **Architect** — turns facts into (or confirms) the task's Description + Acceptance criteria + Verification steps. Output: task card update. Never edits `src/`.
3. **Engineer** — implements exactly the card, one atomic commit (see §3). Runs the task's Verification block before handing off. Never widens scope.
4. **Auditor** — re-runs gates independently (`tsc`, targeted vitest, `audit:ground-rules`), checks the diff line-by-line against the card, and either accepts or returns with file:line findings. Owns the Definition of Done (§4).

Return path: any Auditor rejection goes back to **Engineer** with written findings, not forward. Two rejections on one task escalate to a human with both finding rounds attached.

## 2. Model selection (free tier)

All stages use free-tier models from the session's provider. Selection rule per stage, cheapest-capable first:

- **Explorer / Auditor:** prefer a strong-reasoning free-tier model — their output (deviation lists, diff review) is the correctness backstop.
- **Architect:** prefer a balanced free-tier model — planning quality matters, output is short.
- **Engineer:** prefer a fast free-tier model for XS/S deletions (Tasks 1–4 are single-line deletions); escalate to the stronger model only after an Auditor rejection.

Never switch providers mid-task for capability reasons; if the free tier cannot satisfy a stage (e.g., context too small for the diff), split the task, not the provider.

## 3. Branch / PR process

- **Branch per task:** `fix/<task>-<slug>` (e.g., `fix/t1-dashboard-dup-res`, `fix/t4-gitnexus-raw-egress`). Branched from current `main` HEAD; one task per branch, no stacking.
- **Atomic commits:** one commit per task, message names the deleted lines (e.g., `fix: delete CerebroDashboard.tsx:113 bare fetch, keep :114 authFetch`). Each commit ends green — gates in §4 run per commit, not per PR.
- **Gates per commit** (Axiom 6 env on every command):
  - `npx tsc --noEmit`
  - `NODE_OPTIONS=--max-old-space-size=512 UV_THREADPOOL_SIZE=3 npx vitest run --fileParallelism=false <touched suite(s)>` (repo test script baseline: `package.json:10`)
  - `npm run audit:ground-rules` (must print `8/8`; gate logic `scripts/audit-ground-rules.ts:625-634`)
- **PR bar:** PR body links the task card, pastes the three gate outputs, and states any pre-existing failures with file:line (never "all green" if the full `tsc` has unrelated reds — list them). Reviewer is the Auditor stage. Merge only on Auditor accept.
- **E6 track isolation:** canonical-reset branches use `chore/reset/...`, never `fix/...`, and never merge until Tasks 1–6 are closed (plan Task 7 is a separate track).

## 4. Definition of Done (every task)

- [ ] `tsc` zero in all touched files (full-repo zero preferred; any remaining reds cited as pre-existing with file:line)
- [ ] Target task suite(s) green under Axiom 6 env (`NODE_OPTIONS=--max-old-space-size=512`, `UV_THREADPOOL_SIZE=3`, `--fileParallelism=false`)
- [ ] `npm run audit:ground-rules` 8/8, or any failing check documented as pre-existing with check label (`scripts/audit-ground-rules.ts:608-617`) + file:line cause
- [ ] Diff touches only the card's listed files; no `dist/` edits (gitignored build output); no scope widening
- [ ] SA-01–SA-06 upheld: no raw shell-exec surface added (check-2, `scripts/audit-ground-rules.ts:156`), no `child_process` outside the allowlisted files (check-7 context, `scripts/audit-ground-rules.ts:79-117`), tests use in-memory DB only (check-3, `:196`), no external DB deps (check-4, `:242`)
- [ ] Auditor accept recorded on the PR; rejection findings (if any) closed with re-verification output
