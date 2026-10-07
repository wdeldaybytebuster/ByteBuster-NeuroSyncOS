# AUDITOR Round 1 Findings — HEAD a979caa (C1–C10 over d6e5869)

**Auditor:** THE AUDITOR (verification only; zero `src/` edits — `git diff --stat -- src/ scripts/` is empty).
**Date:** 2026-10-07. **Fix-retest cycles consumed:** 0 of 3 (no FAILs found, none needed).
**Commit tested:** `a979caa4b5484740531df898ae5cd6095bd743f9`. Working tree clean except untracked `docs/security/`.
**Engineer logs in `/tmp/opencode/neurosync/` (60 files):** NOT trusted; everything below was re-run independently.
**Constraints honored:** every vitest run used `NODE_OPTIONS=--max-old-space-size=512 --fileParallelism=false`, strictly sequential; no new npm deps; no `dist/`/`*.generated.cjs` edits.

## Verdict: CLEARANCE — definition of done met

- Auditor negatives: **20/20 green** (`docs/security/audit-loop/audit-neg-{v1,v2,v3}.test.ts`)
- `tsc --noEmit`: **exit 0**
- `audit-ground-rules`: **6/8, FAILs are exactly pre-existing checks #2 and #5, no third FAIL**
- Full suite: **88 files / 682 tests green** = Engineer's 85/662 **plus** my 20 auditor tests in 3 files. Arithmetic matches exactly.

## Gate re-runs (independent, from scratch)

| Command | Result |
|---|---|
| `npx tsc --noEmit` | `TSC_EXIT=0`, zero output |
| `npx tsx scripts/audit-ground-rules.ts` | 6/8 PASS; FAILs: #2 shell-exec `src/server/index.ts`, #5 OKF-seed wiring. Checks 6,7,8 all PASS. `AUDIT_EXIT=1` |
| vitest `sync-policy` + `transport-sync-safety` | 2 files / 24 tests passed |
| vitest `src/server/auth/` + `src/server/perimeter.test.ts` | 4 files / 49 tests passed |
| vitest `egress` + `gate-order` + `scraping` + `discovery` | 4 files / 39 tests passed |
| vitest `sync-consent` + `sync-ws-e2e` + `mdns-discovery` + `ui/lib/api` + `audit-ground-rules.test` | 5 files / 62 tests passed |
| vitest `docs/security/audit-loop/audit-neg-v1` | 7/7 (hostile table, stacked/derived names, DELETE, injected column, unauth wire delta, wrong-MAC, llm_providers) |
| vitest `docs/security/audit-loop/audit-neg-v2` | 6/6 (anon 401, garbage-bearer 401, LAN 403, ticket misuse 401 / stream 200, setup 404, logout revokes) |
| vitest `docs/security/audit-loop/audit-neg-v3` | 7/7 (file://, loopback SSRF 0 wire hits, 169.254, kill-switch, 5MB-vs-1MB cap, internal allow, malformed URL) |
| Full suite (once) | **88 files / 682 tests, all passed, 84 s** |

## Per-control verdicts (all PASS)

- **V1 allowlist:** `sync-policy.ts:15-18` = exactly `projects/workflow_runs/tasks` with trigger-shaped columns; `SYNC_ACTIONS` excludes DELETE (`:22`). `transport.ts` contains zero `${` inside SQL (`grep prepare(\`` hits at :137/:329/:376/:413 are static strings; remaining `${` are log lines + validated `ws://ip:port` construction).
- **V1 sync.ts deleted:** absent from tree; zero non-test importers of `reconcileDeltaPayload`/`generateDeltaPayload`.
- **V1 HMAC peer auth:** `sync-handshake.ts:20,70` (`timingSafeEqual`), `transport.ts:168-249` (challenge, 5 s window, `4401` close). Behaviorally: unauthenticated and wrong-MAC `SYNC_DELTA` write nothing (auditor N5/N6).
- **V1 sync_enabled default false:** `sync-consent.ts:86-88` (absent = false); `server-main.ts:59` (mdns gated).
- **V2 auth layer:** `src/server/auth/{credentials,sessions,middleware,routes}.ts` exist; `basevault/auth.ts` + `readiness.ts` deleted; `server-main.ts` has no `readiness` import (only historical comments :36/:69).
- **V2 credential/setup:** `operator_credential` + `auth_setup_expires_at` in `credentials.ts:31-32`; loopback-gated (`:275`, `isLoopbackAddress`).
- **V2 RAM sessions:** `sessions.ts:48-49` (`new Map`, sha256-hashed keys); `MAX_SESSIONS=16` (`:23,:79`); `TICKET_TTL_MS=30_000`, `TICKET_MAX_USES=10` (`:24,:26,:157`); zero `CREATE TABLE` in `sessions.ts`.
- **V2 C5-before-C6:** `git log` order `dffd874` (loopback/CORS/rate-limit) → `620b3a2` (auth). Bind `server-main.ts:619,639` (`127.0.0.1` default, `hostname:` passed); CORS allowlist `perimeter.ts:30-33`; rate-limit 1024-entry bound + `TRUST_PROXY` gate.
- **V2 zero migrations:** `git diff d6e5869..HEAD -- src/core/basevault/db.ts` is empty. The single `+CREATE TABLE IF NOT EXISTS discovered_models` in the range sits in `discovery.test.ts` (test-local `:memory:` DDL), not production schema.
- **V3 egressFetch:** `egress.ts` gates parse → scheme → kill-switch → private-deny (`:209`) → policy → byte-counting reader; `DEFAULT_MAX_BYTES = 2_000_000` (`:118,:320`).
- **V3 gate hoist:** `worker.ts:318-328` — `gateAndDispatch` runs all policy checks before the dispatch closure containing `executePlugin`; closure executes only when nothing denied. (Wrapper form, not the plan's literal inline block; semantics identical, pinned by `gate-order.test.ts`, re-run green.)
- **V3 okf_indexer via egress:** `worker.ts:10,133` (`egressFetch` import + call site; no bare `fetch`).
- **V3 scrape backend:** `scraping.ts:46-55` (`scrape_backend`, default `'http'`); **sandbox `--unshare-net` intact** (`sandbox.ts:143`).

## Control-removal proofs (in COPY files only; tree ends clean)

1. **sync-policy table guard** (`/tmp/opencode/neurosync-audit/control-removal/sync-policy-noguard.ts`): guarded `parseDelta(system_settings…)` → `{ok:false,reason:'unknown-table'}`; unguarded copy → `TypeError: Cannot read properties of undefined (reading 'includes')` — the guard converts an unhandled throw inside the message loop into a clean reject-and-`continue`. Load-bearing: CONFIRMED.
2. **egress private-deny** (`…/egress-suite/routeswitch/egress-noguard.ts`, mirrored `coreexec/` for the relative import): guarded → `{ok:false,blocked:'private-address'}` with server never hit; unguarded → `{ok:true,text:'SECRET-LOCAL-BYTES'}` exfiltrated from loopback. Textbook fails-open: CONFIRMED. (The copy's dynamic `../basevault/db.js` import fails outside the tree and fails open as designed — visible as an `ERR_MODULE_NOT_FOUND` trace in the proof output; the private-deny line is the sole behavioral delta.)

## C2/C7 RED gap — closed independently (no persisted RED logs existed)

- **C7 RED, executed:** `docs/security/audit-loop/red-old-middleware.proof.ts` runs the verbatim `d6e5869` middleware logic with `readiness.configured=false` (proven: live `.data/neurosync.db` has 20 `system_settings` keys, no `llm_api_key`). Result: `OLD-CODE anonymous: 200 {"rows":["SECRET-DB-ROWS"]}` and `OLD-CODE bearer-garbage: 200 …`. New code returns 401 on both (auditor N1/N2). Bug existed, now closed.
- **C2 RED, static:** at `d6e5869`, 7 interpolation sites: `transport.ts:159,169,175` (+DELETE ~:180), `sync.ts:46,61,64`; `SyncEventLogSchema.table_name: z.string()` unbounded with `DELETE` reachable. Current tree: 0 sites, file deleted. Before/after proven; GREEN by auditor N1–N7.

## Audit-exit-code discrepancy — RESOLVED in favor of Engineer §7.4

- `scripts/audit-ground-rules.ts:610-624`: `main()` returns `passedCount === CHECKS.length ? 0 : 1`. At 6/8 it returns **1**; `process.exit(main())` (`:626`). My direct re-run: `AUDIT_EXIT=1`. **Engineer §7.4 ("exits 1") is TRUE.**
- `final-gates.log`'s `AUDIT_EXIT=0` is a **capture artifact**: the output was piped (npm-notice formatting), so `$?` read the last pipeline stage (`tee`/`echo`), not the script. The 6/8 content in that log is identical to mine.
- **CI must enforce:** do NOT gate on `AUDIT_EXIT==0` until the two pre-existing FAILs are fixed. Gate on parsed output: `6/8 AND failures ⊆ {check 2 shell-exec, check 5 OKF-seed}`. Capture exit codes with `set -o pipefail` or without pipes. Fixing pre-existing checks #2 (`src/server/index.ts` unused `child_process` import) and #5 (OKF-seed check targets wrong file) is out of scope for this perimeter (§5-16) — any future change to either must be a separate, explicitly approved commit.

## §5 deferral verdict — UNTOUCHED (PASS)

- `git log d6e5869..HEAD -- src/core/memory/cerebro/vector.ts` → empty; `-- src/core/routeswitch/adapters/` → empty.
- `src/server/routes/system.ts` touched only by C9 with the explicit §5-3 deferral comment + `allowPrivate` plumbing (`:402-405` marker present verbatim); probe still raw `fetch` as deferred — confirmed intentional, not a regression.
- Check-6 allowlist still contains `vector.ts` deliberately (§5-17); check-7 allowlist still contains `adapters/` (§5-14).

## Minor observations (NOT FAILs, no action required)

- Live DB has 38 tables vs the plan's "39 baseline tables" (§0-V1) — trivial inventory drift, no security relevance.
- `worker.ts` implements C8-c via a `gateAndDispatch` wrapper rather than the plan's literal inline ordering block — semantics verified equivalent (gate strictly before dispatch).
- `live-test.ts` move used env name `NEUROSYNC_LIVE_TEST` (commit message notes the plan's name was typo'd) — documented deviation, accepted.

## Reproduction paths for the orchestrator

- Negatives: `NODE_OPTIONS=--max-old-space-size=512 npx vitest run --fileParallelism=false docs/security/audit-loop/audit-neg-v1.test.ts docs/security/audit-loop/audit-neg-v2.test.ts docs/security/audit-loop/audit-neg-v3.test.ts` → 20/20.
- RED proof: `npx tsx docs/security/audit-loop/red-old-middleware.proof.ts` → both 200s.
- Control-removal: `npx tsx /tmp/opencode/neurosync-audit/control-removal/proof1b.ts`; `npx tsx /tmp/opencode/neurosync-audit/control-removal/egress-suite/proof2.ts`.
