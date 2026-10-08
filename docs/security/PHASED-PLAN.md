# Phased Program Plan (P1 + P2 roll-in + canonical reset + P3 gate)

Status: PLAN ONLY — no `src/` modified by this document.
Sources: `docs/security/FOLLOWUPS-P1-REMEDIATION.md` (P1 T1–T7),
`docs/security/FOLLOWUPS-P2-ROLLIN.md` (P2 B1–B8),
`docs/security/ARCHITECT-canonical-reset.md` (reset procedure, as amended per Phase 0),
`docs/security/DECISIONS-LOG.md` (approved decisions).
Env for every verification: `NODE_OPTIONS=--max-old-space-size=512 UV_THREADPOOL_SIZE=3`
plus `npx vitest run --fileParallelism=false`. Gate per commit: vitest shard + `tsc` + audit.

## Phase 0 — Plan amendments + branch hygiene (first, unblocks everything)

Goal: fix known staleness in the canonical-reset plan and clean branches before any content work.

- T0.1 Amend `ARCHITECT-canonical-reset.md` (specify only — do NOT edit that file here):
  Description: record 4 required amendments — (a) exposure language (ciphertext+key =
  plaintext-equivalent, `:162`), (b) open-scrub framing (scrub is operator-approved post-step,
  R-1 `:310`), (c) DegradationEngine refs (`schema.ts`/`Statusline.tsx`, `:116,227`),
  (d) OD-1 default flips to keep-one (see DECISIONS-LOG D6).
  Acceptance: amendment list reviewed. Verification: human sign-off.
  Dependencies: none. Files: `ARCHITECT-canonical-reset.md` (separate commit). Scope: XS.
- T0.2 Branch hygiene: delete `oss-readiness`/`rescue` branches (or list if absent); run
  `git filter-repo --analyze` on `e2e-report/` + `test-results/` before any scrub.
  Acceptance: branch list clean, analyze output recorded. Verification: `git branch -a`.
  Dependencies: T0.1. Files: none (git ops). Scope: XS.

Checkpoint: amendments signed off, branches clean. Gate: n/a (docs/git only).
Risk: scrub attempted before approval — mitigation: OD-6 requires operator approval (D3).

## Phase 1 — P1 gate restore (T1–T5) + closeouts (T6–T7)

Goal: green tree — `tsc` 0 + audit 8/8 (`scripts/audit-ground-rules.ts:632-634`).

- T1 (E1+E3dash): delete bare-`fetch` line `src/ui/views/CerebroDashboard.tsx:113`, keep
  `:114` (`authFetch`). Acceptance: no bare `fetch(` in file; `tsc` −2 errors.
  Verification: `npx tsc --noEmit`; audit 8/8. Dependencies: none. Files: `CerebroDashboard.tsx`. Scope: XS.
- T2 (E3chatbot): delete stale `body:` `src/ui/components/CerebroChatbot.tsx:45`, keep `:46`
  (mapped `{role,text}` + `projectId ?? null`); preserve `:51` signal, `:36` timeout.
  Acceptance: single `body:` key. Verification: `tsc`; UI suite; audit. Dependencies: T1. Scope: XS.
- T3 (E4+E5b/c): tuple-type `...gate` spreads `src/server/ws-upgrade-guard.test.ts:114,141`
  (no `any`); refresh mirror comments `:102-107,:129-134` to cite live wiring
  (`src/server/server-main.ts:221,287`, `src/server/perimeter.ts:196`).
  Acceptance: type-checks under Hono 4 (`package.json:52`); assertions `:157-196` unchanged.
  Verification: `tsc`; `vitest run src/server/ws-upgrade-guard.test.ts`; audit. Scope: S.
- T4 (E2): delete dead raw blocks `src/core/memory/gitnexus-client.ts:129-131,:250-255`;
  keep governed `egressFetch` `:137-144,:259-269` (`internal:true`, `timeoutMs`).
  Acceptance: no bare `fetch(`, no duplicate bindings. Verification: `tsc`; memory suites; audit
  check-7 (`scripts/audit-ground-rules.ts:511,616`). Dependencies: T1–T3. Scope: S.
- T5 (E5a): new `src/server/ws-heartbeat.test.ts` — fake `{isAlive,ping(),terminate()}` peers,
  never import `server-main.ts` (port bind, `:184-187` contract).
  Acceptance: 4 cases (dead→terminate+remove; alive→ping; ping-throws→drop; empty→no-op).
  Verification: new suite green; `tsc`; audit. Dependencies: T3. Scope: S.
- T6 Closeout: full gate (repo-wide `tsc` 0, audit 8/8, all touched shards green, no `dist/` edits).
  Hono 4.13.x stays deferred (pin `package.json:52` cited, ticketed not attempted).
- T7 (separate track): E6 OD/R investigation — superseded by Phase 4 per amended defaults;
  record only what Phase 4 executes.

Checkpoint (after T1–T3): `tsc` clean on touched files, guard suite green, audit 8/8, human review.
Checkpoint (after T5): heartbeat green, full targeted pass green, human review.
Risk: deleting the live line instead of dead — mitigation: each task names the line to KEEP.

## Phase 2 — P2 follow-ups (council deadline, UI timeout, peer-port trap)

Goal: close the two P2-track and one P1-track hardening items from the roll-in.

- P2-B1 Council deadline (`src/core/routeswitch/council.ts:97-98`): add council-level deadline
  (`Promise.race` with `council_timeout_ms` or `streamHooks.signal` + per-provider race); budget the
  local `LlamaCppProvider` path (`src/core/routeswitch/adapters/llama-cpp.ts:48`, no time budget).
  Acceptance: council cannot hang past deadline incl. local adapter. Verification: council tests
  + `tsc` + audit. Files: `council.ts`, `llama-cpp.ts`, tests. Scope: M.
- P2-B2 UI timeout (`src/ui/lib/api.ts:169-183`): default
  `signal: AbortSignal.any([init?.signal, AbortSignal.timeout(UI_FETCH_TIMEOUT_MS)])` in `authFetch`,
  opt-out via explicit signal (mirror `openai-compatible.ts:67-91` `combineSignals`).
  Acceptance: every dashboard poll bounded. Verification: UI suite + `tsc` + audit. Scope: S.
- P2-B4 Peer-port trap (P1-track wave 2, `src/core/basevault/network/sync-consent.ts:59-71`,
  `src/server/server-main.ts:373-394`): pin acceptable ports (allowlist/configured sync port),
  TOFU fingerprint on first handshake, PortGrid mismatch surface.
  Acceptance: approved peer cannot probe arbitrary LAN ports. Verification: sync-consent tests
  + `tsc` + audit. Scope: M.

Checkpoint: all three suites green, audit 8/8. Risk: timeout default breaks explicit-signal
callers — mitigation: opt-out path + chatbot `:36` controller preserved.

## Phase 3 — P3 structural batch (gated, ordered)

Goal: land approved P3 items without blocking Phases 1–2 or the reset.

1. Zen flag (option C, needs sign-off — NO removal): disable-by-default flag + UI label +
   explicit retired-type error. Removal surface documented
   (`FOLLOWUPS-P2-ROLLIN.md:66-71`); AGENTS.md Directive 3 stands until sign-off.
2. Hono bump: standalone chore post-gate (4.12.x → 4.13.x; pin `package.json:52`).
3. Port sweep: 4-file follow-up chore (exclude `App.tsx` — handled in Phase 4 D-14).
4. §5-14 decision (roll-in B3, `openai-compatible.ts:44-48`): keep raw-with-timeout as permanent
   provider contract OR design `egressFetch` provider lane preserving 30 s/15 s budgets.
5. Dual-DDL (roll-in B5, `src/core/basevault/db.ts:111-148`): versioned migration chain,
   CREATE = v-latest-only, 19 legacy ALTERs folded into `migrate_v0_v1`.
6. Worker writers (roll-in B6, `src/core/coreexec/worker.ts:279-293,321-323`): single-writer
   topology (workers read-only / RPC writes); until then document WAL contract, bound plugin writes.
7. `claim_batch_size` (roll-in B8, `src/core/coreexec/settings.ts:47-54`): Axiom-6-safe default
   ceiling replacing `MAX_SAFE_INTEGER`.
8. DegradationEngine OSLayout ticket (OD-5 rider): if a real component exists outside the test,
   rewrite test against `OSLayout` instead of deleting.

Each item: atomic commit, gate per commit, `tsc` + shard + audit. Dependencies: Phase 1 green.

## Phase 4 — Canonical-reset execution (per amended plan + secrets riders)

Goal: canonical empty-state box per `ARCHITECT-canonical-reset.md` §5–§7.

- Order: §6 commits 1–7 (artifacts → dead scripts → dead chain → genesis → orphan UI → DB purge → runbook).
- Riders: R-2 scheduled rotation (provider dashboards, NOT covered by scrub `:162-163`);
  `.master.key` boot gate (verify keygen path pre-deletion, OD-3 option A auto-gen + boot assert);
  S-1/S-3 incident treatment stands regardless of scrub (`:174-176`).
- OD defaults applied: OD-1 keep-one; OD-2 DROP `test_tx`; OD-3 auto; OD-4 create+delete
  (condition met) else delete; OD-5 delete test now + ticket; OD-6 option A scoped
  (analyze-before-scrub, operator approval); OD-7 resolved (verify existing patterns first).
- Verify: §7 N-1–N-5 + P-1–P-5; fresh-clone equivalence (§5.8).

Checkpoint per §6 commit: `tsc` 0 + audit 8/8 or stop. Risk: lockout (R-7) — mitigation: never
purge a running server; window re-opens on fresh boot.

## Phase 5 — P3 frontend/toolchain (HELD — needs explicit order)

Scope (defined but gated): eslint, Vite chunking, lazy dashboards, terminal WS URL, jsdom.
No work starts without an explicit go-order. When released, each item gets the same
Description/Acceptance/Verification/Dependencies/Files/Scope treatment with per-commit gates.
