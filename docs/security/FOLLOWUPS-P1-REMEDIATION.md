# P1 Follow-ups Remediation Plan

Status: PLAN ONLY — no `src/` modified by this document.
Source: Step 1 inventory (authoritative for scope/order); all file:line cites re-verified at plan time.
Template: `planning-and-task-breakdown` (Overview, Architecture Decisions, Task List, Checkpoints, Risks, Open Questions).

## Overview

Close out the P1 security-remediation follow-ups in dependency order: restore the red gates first (E1–E4: duplicate-declaration `tsc` breaks + raw-egress audit failures), then harden (E5a: zero unit tests on the heartbeat sweep), then run full-gate closeout, with the canonical-reset track (E6) proceeding separately. Every task leaves the tree green (`tsc` + targeted vitest + `audit:ground-rules` 8/8) before the next begins.

## Architecture Decisions

- **Gates before hardening.** E1–E4 break `tsc` and/or the audit gate, so they precede E5a tests. Rationale: a red gate blocks every commit's Definition of Done (`FOLLOWUPS-PROCESS.md`).
- **Delete, don't merge, leftover raw blocks.** E2's raw-`fetch` blocks in `gitnexus-client.ts` are fully shadowed by `egressFetch` duplicates (`src/core/memory/gitnexus-client.ts:129` vs `:137`, `:250` vs `:259`); the fix is deletion of the dead lines, never a merge of two live paths. Rationale: the governed door (`src/core/routeswitch/egress.ts:273`) is the only live path.
- **Keep the second body in the chatbot.** E3-chatbot's duplicate `body:` keys (`src/ui/components/CerebroChatbot.tsx:45` vs `:46`) — the fix keeps `:46` (mapped `{role,text}` history + `projectId ?? null`) and deletes `:45` (raw `messages.slice(-6)` leaking full message objects). Rationale: `:46` is the shaped contract; `:45` is dead on arrival (duplicate key, first value discarded).
- **Tuple-type, don't `any`, the Hono spread.** E4's `...gate` spread (`src/server/ws-upgrade-guard.test.ts:113,140`) needs a tuple-compatible type, not an `any` cast. Rationale: `any` would silence the exact fail-closed wiring the test pins.
- **Heartbeat tests inject fakes, never import server-main.** E5a tests call `wsHeartbeatSweep` with fake `{isAlive,ping(),terminate()}` peers per the documented contract (`src/server/server-main.ts:184-187`), mirroring why `ws-upgrade-guard.test.ts:9-11` never imports `server-main.ts` (port bind). Rationale: Axiom 6 hermeticity + §4.2 port rule.
- **E6 runs on a separate track.** Canonical-reset ODs/Rs (`docs/security/ARCHITECT-canonical-reset.md:310-331`) need operator approvals (history scrub, key rotation) and must not gate E1–E5. Rationale: Step 1 order (`E6 separate track`).

## Task List

### Phase 1: Gate restore (E1–E4)

## Task 1: E1+E3dash — CerebroDashboard duplicate `res` + bare `fetch`

**Description:** `handleSearch` declares `const res` twice and the first declaration uses bare `fetch`, failing both `tsc` (duplicate binding) and audit check-7 (`checkNoRawEgress`, `scripts/audit-ground-rules.ts:511`). Delete `src/ui/views/CerebroDashboard.tsx:113` (bare-`fetch` line), keep `:114` (`authFetch`).

**Acceptance criteria:**
- [ ] `src/ui/views/CerebroDashboard.tsx:113` bare-`fetch` line deleted; single `const res = await authFetch(...)` remains
- [ ] No other bare `fetch(` remains in the file (all other call sites already `authFetch`: `:41,:57,:64,:71,:79,:89,:97,:102`)
- [ ] `tsc` reports zero errors in the touched file (net −2 errors per inventory)

**Verification:**
- [ ] `npx tsc --noEmit` — zero errors in `CerebroDashboard.tsx`
- [ ] `NODE_OPTIONS=--max-old-space-size=512 UV_THREADPOOL_SIZE=3 npx vitest run --fileParallelism=false <cerebro UI suite>`
- [ ] `npm run audit:ground-rules` — 8/8 (`passedCount === CHECKS.length`, `scripts/audit-ground-rules.ts:632-634`)

**Dependencies:** None (first in order).

**Files likely touched:**
- `src/ui/views/CerebroDashboard.tsx`

**Estimated scope:** XS (1 file, 1 line deleted).

### Checkpoint: After Task 1
- [ ] `tsc` clean on `CerebroDashboard.tsx`
- [ ] Audit still 8/8 (check-7 risk removed, not added)

## Task 2: E3chatbot — CerebroChatbot duplicate `body:`

**Description:** The `authFetch` options object contains two `body:` keys (`src/ui/components/CerebroChatbot.tsx:45` stale, `:46` shaped). Delete `:45`, keep `:46`. Backend route/posting shape is otherwise untouched (`:42` posts to `${API}/api/cerebro/chat` via `authFetch`, `src/ui/components/CerebroChatbot.tsx:4,42`).

**Acceptance criteria:**
- [ ] Single `body:` key remains: `JSON.stringify({ message, history: mapped {role,text}, projectId: activeProjectId || null })` (`:46-50`)
- [ ] Stale `body: JSON.stringify({ message: msg, history: messages.slice(-6), projectId: activeProjectId })` (`:45`) deleted
- [ ] `signal: controller.signal` (`:51`) and 30 s timeout (`:36`) preserved

**Verification:**
- [ ] `npx tsc --noEmit` — zero errors in `CerebroChatbot.tsx`
- [ ] `NODE_OPTIONS=--max-old-space-size=512 UV_THREADPOOL_SIZE=3 npx vitest run --fileParallelism=false <cerebro UI suite>`
- [ ] `npm run audit:ground-rules` — 8/8

**Dependencies:** Task 1 (same UI area; keeps diffs atomic per file).

**Files likely touched:**
- `src/ui/components/CerebroChatbot.tsx`

**Estimated scope:** XS (1 file, 1 line deleted).

## Task 3: E4+E5b/c — ws-upgrade-guard Hono spread typing + mirror-comment refresh

**Description:** `...gate` spreads of `MiddlewareHandler[]` at `src/server/ws-upgrade-guard.test.ts:114,141` fail Hono's tuple-typed `app.get` overloads. Fix with a tuple-compatible gate type (no `any`). In the same touch, refresh the stale mirror comments (`:102-107` sync mirror, `:129-134` terminal mirror — both claim the routes are unguarded mirrors) to state the guard is live: `wsUpgradeGuard` is exported (`src/server/perimeter.ts:196`) and wired at both routes (`src/server/server-main.ts:221` terminal, `:287` sync), and peer labels are `crypto.randomUUID()` (`src/server/server-main.ts:289`, replacing the verbatim `Math.random` line the mirror still quotes at `:117`).

**Acceptance criteria:**
- [ ] `:114` and `:141` spreads type-check under Hono 4 (`package.json:52` pins `^4.12.27`) with no `any` cast
- [ ] Mirror comments no longer describe the routes as unguarded; cite live wiring (`server-main.ts:221,287`, `perimeter.ts:196-203`)
- [ ] Behavioral assertions (`:157-196`, 401 fail-closed + 200-with-env invariant) and source contracts (`:200-246`) unchanged in meaning

**Verification:**
- [ ] `npx tsc --noEmit` — zero errors in `ws-upgrade-guard.test.ts`
- [ ] `NODE_OPTIONS=--max-old-space-size=512 UV_THREADPOOL_SIZE=3 npx vitest run --fileParallelism=false src/server/ws-upgrade-guard.test.ts`
- [ ] `npm run audit:ground-rules` — 8/8

**Dependencies:** None on Tasks 1–2 (different subsystem; parallelizable).

**Files likely touched:**
- `src/server/ws-upgrade-guard.test.ts`

**Estimated scope:** S (1 file, type fix + comments).

### Checkpoint: Foundation (after Tasks 1–3)
- [ ] `npx tsc --noEmit` clean repo-wide (or zero in all touched files with remaining failures documented as pre-existing)
- [ ] `ws-upgrade-guard.test.ts` suite green
- [ ] `npm run audit:ground-rules` 8/8
- [ ] Review with human before Phase 2 (per skill checkpoint rule)

## Task 4: E2 — gitnexus-client raw-fetch leftover deletion

**Description:** Two functions contain dead raw-`fetch` blocks shadowed by governed `egressFetch` duplicates: `fetchIndexedRepos` (raw `:129-131` vs governed `:137-144`) and `queryCodeStructure` (raw `:250-255` vs governed `:259-269`). Delete the raw blocks (`:129-131`, `:250-255` incl. their stale comments), keeping the `§2.3 C9` governed blocks with `{ internal: true, timeoutMs }` (`:137-144`, `:259-269`). `gracefulKill`'s `egressFetch` (`:220-229`) is already clean and untouched.

**Acceptance criteria:**
- [ ] No bare `fetch(` remains in `src/core/memory/gitnexus-client.ts` (today at `:129` and `:250`)
- [ ] No duplicate `const res` / `const body` bindings remain (`:129` vs `:137`, `:131` vs `:143`, `:250` vs `:259`)
- [ ] Governed calls keep `internal: true` (loopback eval-server, kill-switch-exempt per `:132-136` comment) and `timeoutMs` replacing inline `AbortSignal`
- [ ] `egressFetch` import (`:3`) and signature (`src/core/routeswitch/egress.ts:273-277`) unchanged

**Verification:**
- [ ] `npx tsc --noEmit` — zero errors in `gitnexus-client.ts` (duplicate bindings resolved)
- [ ] `NODE_OPTIONS=--max-old-space-size=512 UV_THREADPOOL_SIZE=3 npx vitest run --fileParallelism=false <memory/context-router/gitnexus suites>`
- [ ] `npm run audit:ground-rules` — 8/8 (check-7 `checkNoRawEgress` must stay green, `scripts/audit-ground-rules.ts:511,616`)

**Dependencies:** Tasks 1–3 (touches the last raw-egress sites; lands on a green gate).

**Files likely touched:**
- `src/core/memory/gitnexus-client.ts`

**Estimated scope:** S (1 file, 2 dead blocks deleted).

### Phase 2: Hardening (E5a)

## Task 5: E5a — heartbeat sweep unit tests

**Description:** `wsHeartbeatSweep`/`wsHeartbeatPeers`/`WS_HEARTBEAT_MS` (`src/server/server-main.ts:189-191`) have zero unit tests (no heartbeat suite exists; `ws-upgrade-guard.test.ts:71` explicitly notes P1-2 is uncovered). Add a port-free suite injecting fake `{ isAlive, ping(), terminate() }` peers into an isolated `Set` (never importing `server-main.ts`, per the `:184-187` contract and the `ws-upgrade-guard.test.ts:9-11` precedent).

**Acceptance criteria:**
- [ ] New suite covers: `isAlive === false` → `terminate()` + removed from set; alive → `isAlive=false` + `ping()` called; `ping()` throwing → peer dropped without throwing; empty set → no-op
- [ ] Suite never imports `server-main.ts` (port bind, §4.2) — tests the sweep pure via injected sets
- [ ] 30 s interval ownership (`:216-217`, `unref`) unchanged — no new timers in tests

**Verification:**
- [ ] `NODE_OPTIONS=--max-old-space-size=512 UV_THREADPOOL_SIZE=3 npx vitest run --fileParallelism=false <new heartbeat suite>`
- [ ] `npx tsc --noEmit` — zero errors in the new suite file
- [ ] `npm run audit:ground-rules` — 8/8

**Dependencies:** Task 3 (same WS area; builds on the reviewed guard state).

**Files likely touched:**
- `src/server/ws-heartbeat.test.ts` (new)
- `src/server/server-main.ts` (read-only reference; no edits expected)

**Estimated scope:** S (1 new test file).

### Checkpoint: Hardening
- [ ] Heartbeat suite green, no port binding in tests
- [ ] Full targeted-test pass across Tasks 1–5 green
- [ ] Review with human before closeout

### Phase 3: Closeout (+ E6 separate track)

## Task 6: Closeouts — full gate + hono deferral note

**Description:** Run the full gate over the Tasks 1–5 tree and record the deferred items: hono upgrade deferred (tree pins `^4.12.27`, `package.json:52` + `package-lock.json:4270`; inventory defers 4.13.x), stale-mirror comments resolved in Task 3, heartbeat coverage resolved in Task 5.

**Acceptance criteria:**
- [ ] `npx tsc --noEmit` zero repo-wide (or remaining failures listed here as pre-existing with file:line)
- [ ] `npm run audit:ground-rules` 8/8 (`scripts/audit-ground-rules.ts:608-617` checks, `632-634` gate)
- [ ] Targeted vitest shards for every touched area green under Axiom 6 env
- [ ] No `dist/` edits (build artifacts regenerable; `dist/` gitignored per canonical-reset §0.6)
- [ ] Hono deferral recorded: current pin cited, upgrade ticketed not attempted

**Verification:**
- [ ] `npx tsc --noEmit`
- [ ] `NODE_OPTIONS=--max-old-space-size=512 UV_THREADPOOL_SIZE=3 npx vitest run --fileParallelism=false <each touched suite>`
- [ ] `npm run audit:ground-rules`
- [ ] `git status --ignored` — no `dist/` modifications staged

**Dependencies:** Tasks 1–5.

**Files likely touched:**
- (none — verification + notes; deferral ticket if tracked in-repo)

**Estimated scope:** XS.

## Task 7 (separate track): E6 — canonical-reset OD/R decisions

**Description:** Resolve `ARCHITECT-canonical-reset.md` open decisions OD-1–OD-7 (`:325-331`) and risks R-1–R-8 (`:310-317`) on a track that does not block Tasks 1–6. Hard constraint from the plan: R-2 provider-side key rotation is mandatory and NOT covered by history scrub (`:162-163`, `:311`); S-1/S-3 incident treatment stands regardless of scrub (`:174-176`).

**Acceptance criteria:**
- [ ] OD-1 (code-created `system-maintenance`?): resolved via `grep -rn system-maintenance src/` with verdict recorded
- [ ] OD-2 (`test_tx` schema vs artifact): resolved via `db.ts` schema check
- [ ] OD-3 (`.master.key` auto-regeneration path): cited with file:line or explicit-generate fallback adopted
- [ ] OD-4–OD-7: each recorded with chosen default or deviation
- [ ] R-2 rotation ticket exists (operator-side, provider dashboards) independent of scrub scheduling (R-1)

**Verification:**
- [ ] Each OD resolution cites the verifying grep/read output (file:line + snippet, per plan §0 style)
- [ ] No DB, git-history, or `~/.neurosync` mutation performed during decision-making (plan is read-only until execution commits, §5 ordering: stop → purge → boot → credential)

**Dependencies:** None on Tasks 1–6 (separate track by design).

**Files likely touched:**
- `docs/security/` runbook notes only (no `src/`, no DB)

**Estimated scope:** M (7 decisions + incident ticket; investigation-heavy, edit-light).

### Checkpoint: Complete
- [ ] All Phase 1–2 acceptance criteria met
- [ ] Task 6 full gate green
- [ ] Task 7 ODs resolved or explicitly ticketed with owners
- [ ] Ready for Auditor review (`FOLLOWUPS-PROCESS.md` §4)

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Duplicate-binding deletions (Tasks 1, 2, 4) remove the live line instead of the dead one | High — gate regresses | Each task names the exact line to keep (`CerebroDashboard.tsx:114`; `CerebroChatbot.tsx:46`; governed `egressFetch` blocks); verifier diffs one deletion per commit |
| Hono tuple-type fix weakens to `any` | Med — fail-closed wiring loses type teeth | Acceptance criterion bans `any`; Auditor rejects `any`/`unknown`-cast spreads in this file |
| Heartbeat tests import `server-main.ts` and bind a port | Med — Axiom 6 / §4.2 violation, flaky CI | Contract cites `:184-187` injectable-set design; Auditor checks imports of the new suite |
| E6 history scrub (R-1, `:310`) diverges collaborators' clones | High — blocked pushes | Scrub is operator-approved, post-content-commits, with the `fetch + reset --hard origin/main` runbook line; never bundled with Tasks 1–6 |
| R-2 rotation deferred because scrub "covers it" | High — keys remain live | Rotation ticket is independent of scrub (`:162-163`); Task 7 acceptance requires the ticket to exist |
| Full `tsc`/suite per task exceeds edge-node budget (Axiom 6) | Med — OOM / threadpool saturation | Targeted shards per task (`package.json:10` encodes `--max-old-space-size=512` + `--fileParallelism=false`; run with `UV_THREADPOOL_SIZE=3`); full suite only at Task 6 |

## Open Questions

- E4: preferred tuple-type idiom for the Hono version pinned (`package.json:52`) — Engineer proposes, Auditor confirms no `any` (Task 3).
- E5: exact new-suite filename/location convention for server unit tests (Task 5 assumes `src/server/ws-heartbeat.test.ts`; confirm against existing `src/server/*.test.ts` layout).
- E6 OD-1–OD-7 defaults: confirm the Architect plan's defaults still hold on the current HEAD before Task 7 records verdicts (`ARCHITECT-canonical-reset.md:5` cites HEAD `5ff1c5c`; re-verify).
- Hono 4.13.x upgrade: ticket owner + target window (deferred, not attempted in Tasks 1–6).
