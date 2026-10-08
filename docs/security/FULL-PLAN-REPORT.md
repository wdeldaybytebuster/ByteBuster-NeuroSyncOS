# Full Security Program Report — P1 + P2 Roll-in + Phases 0–3, Reset + P3-frontend Outstanding

Status: REPORT ONLY — no `src/` modified by this document. All source docs read-only.
Date: 2026-10-08. HEAD: `7a4facf`. GitNexus index: up-to-date at `7a4facf`.
Env for every gate: `NODE_OPTIONS=--max-old-space-size=512 UV_THREADPOOL_SIZE=3`, `vitest --fileParallelism=false`.

---

## 1. Program status dashboard

### DONE

| Phase | Commits | Gate evidence (per commit) |
|-------|---------|---------------------------|
| P1 perimeter hardening | `be852d6` — WS fail-closed, chunked cap, heartbeat, randomUUID | Auditor Rounds 1+2 clearance, audit 8/8 |
| P1 follow-ups plan + process | `917e9a3` — plan (T1–T7) + four-stage loop process docs | Docs-only, no gate |
| P2 execution resilience | `dd729d3` — timeouts, shutdown, port, user_version | 133/134 targeted (sole red = pre-existing E1); `llm.test.ts` 9/9; broad 228/228 assertions |
| Phased plan + decisions | `7682e5e` — PHASED-PLAN.md + DECISIONS-LOG.md (D1–D11) | Docs-only, human sign-off gate |
| Phase 0 amendments + hygiene | `50a21e7` — RESET-PLAN-AMENDMENTS.md; 84 `backup/reflog-rescue-*` local branches deleted | Record-only; `git branch -r` untouched; filter-repo analyze-only in fresh clone |
| Phase 1 gate restore (T1–T5) | `53cc472` (T1 dash `:113`), `1b5c300` (T2 chatbot `:45`), `6de1f62` (T3 guard typing), `73c62d1` (T4 gitnexus raw blocks), `8275b7f` (T5 heartbeat suite) | Each: `tsc` + shard + audit 8/8; full closeout T6 green |
| Phase 2 follow-ups (B1/B2/B4) | `4f588b4` (B4 peer-port), `07ad51a` (B1 council deadline), `58e01eb` (B2 authFetch bound) | Per-commit `tsc` 0 + suite + audit 8/8 |
| Phase 3 structural batch (8 commits) | `0af48f9` (S1 Zen C), `7d0a613` (S2 Hono bump), `4cd44e3` (S3 port sweep), `506f79e` (S4 D12), `7a4facf` (S5 dual-DDL), `f756c25` (S6 worker bound), `1fc5d87` (S7 claim_batch_size), `b67d6ad` (S9 stage-run) | Each commit message records shard + `tsc` 0 + audit 8/8 (see §4) |

### IN PROGRESS

None — tree is idle at `7a4facf`, gates green. No open branches with content work pending.

### REMAINING

**Phase 4 — canonical-reset execution** (per amended plan + OD defaults). Order: §6 commits
1–7 (artifacts → dead scripts → dead chain → genesis → orphan UI incl. D-14 App subtree +
DegradationEngine.test.tsx delete + S3 port sweep remainder → DB purge → runbook).
OD defaults applied: OD-1 keep-one, OD-2 DROP `test_tx`, OD-3 auto-gen + boot assert,
OD-4 create+delete (condition met) else delete, OD-5 delete test now + ticket (conditional
closed per Phase 0(c) — no real component found), OD-6 option A scoped (analyze-before-scrub,
operator approval), OD-7 resolved (patterns already in `.gitignore`, nothing to append).
Riders: R-2 scheduled rotation at provider dashboards (NOT covered by scrub); `.master.key`
boot gate (verify keygen pre-deletion); S-1/S-3 incident treatment stands regardless of scrub.
Verify per commit: `tsc` 0 + audit 8/8 or stop; §7 N-1–N-5 + P-1–P-5; fresh-clone equivalence (§5.8).
Key risk R-7 lockout: never purge a running server; window re-opens on fresh boot.

**Phase 5 — P3 frontend/toolchain + worker RPC (HELD — needs explicit go-order).**
Scope: eslint, Vite chunking, lazy dashboards, terminal WS URL, jsdom; worker single-writer
RPC cutover per `WORKER-WRITE-TOPOLOGY.md` §5 (5 preconditions: write-RPC endpoint with
backpressure, all §2a/§2b sites routed, `workerDb` param removed, prune-vs-insert regression
test, one release with WAL contention logging). No work starts without an explicit order;
each item gets Description/Acceptance/Verification/Dependencies/Files/Scope + per-commit gate.

---

## 2. Approved decisions (D1–D12)

| # | Decision | Rationale (one line) | Evidence | Status |
|---|----------|----------------------|----------|--------|
| D1 | Zen provider: option C — disable-by-default flag + UI label + retired-type error; NO removal | Preserves AGENTS.md Directive 3 while bounding the FreeTierError surface; P2-1 already fixed the hang | `FOLLOWUPS-P2-ROLLIN.md:65-74`; `provider-factory.ts:4,9,42-43`; `RouteSwitchDashboard.tsx:341,388,474,505,544,548,555-556`; `DECISIONS-LOG.md:5-22` | Implemented (`0af48f9`) |
| D2 | R-2 rotation: option B — scheduled rotation + riders (branch cleanup, filter-repo analyze, boot gate) | Clones already exist; scrub never rotates live provider keys | `ARCHITECT-canonical-reset.md:162-163,174-176,310-311`; `DECISIONS-LOG.md:24-33` | Planned (Phase 4 rider; operator dashboard action) |
| D3 | OD-6 scrub: option A scoped — cleanup first, analyze-before-scrub, operator approval, post-content-commits | Minimizes collaborator divergence; runbook covers recovery | `ARCHITECT-canonical-reset.md:161,230-231,310,330`; `DECISIONS-LOG.md:35-43` | Planned (Phase 4; Phase 0 analyze-only done) |
| D4 | OD-3 master key: option A — auto-gen + boot assert (verify keygen pre-deletion) | `initDB` recreation is the documented path; fallback only if missing | `ARCHITECT-canonical-reset.md:150,314,327`; `FOLLOWUPS-P1-REMEDIATION.md:181`; `DECISIONS-LOG.md:45-54` | Planned (Phase 4 boot gate) |
| D5 | OD-4 reset helper: option A — create + delete after use (keep only if §5 insufficient) | One-shot script; §5 procedure is durable; never a DAG node (SA-01–SA-06) | `ARCHITECT-canonical-reset.md:238,328`; `DECISIONS-LOG.md:56-64` | Planned (Phase 4) |
| D6 | OD-1 system-maintenance: keep-one (grep; keep code-created row, delete 2 test projects) | Safe under both outcomes; amends purge-all default | `ARCHITECT-canonical-reset.md:312,325`; `idle.ts:120-127,217-224`; `DECISIONS-LOG.md:66-75` | Planned (Phase 4 purge) |
| D7 | OD-2 test_tx: DROP after `db.ts` schema check confirms non-schema | Test-only artifact `(1,'hello')`; check first, drop second | `ARCHITECT-canonical-reset.md:51,66,132,144,315,326`; `DECISIONS-LOG.md:77-86` | Planned (Phase 4 purge) |
| D8 | OD-5 DegradationEngine: delete test now + OSLayout ticket | Unblocks orphan-UI commit; ticket preserves component if real (none found — conditional closed) | `ARCHITECT-canonical-reset.md:103,116,212,227,329`; `RESET-PLAN-AMENDMENTS.md:47-64`; `DECISIONS-LOG.md:88-97` | Planned (Phase 4 D-14) |
| D9 | OD-7 gitignore: resolved — append-after-verify | Trivial; verify-first avoids duplicate patterns | `ARCHITECT-canonical-reset.md:231,245,331`; `DECISIONS-LOG.md:99-106` | CLOSED — pre-resolved, patterns already at `.gitignore:58,61,62,63` (Phase 0 verified) |
| D10 | Hono bump: standalone chore post-gate, never bundled | Version bumps risk the T3 tuple-typed guard wiring | `FOLLOWUPS-P1-REMEDIATION.md:152,159,218`; `FOLLOWUPS-P2-ROLLIN.md:90`; `DECISIONS-LOG.md:108-115` | Implemented (`7d0a613`: hono → 4.13.13, node-server → 2.1.4 installed) |
| D11 | Port sweep: 4-file chore, `App.tsx` excluded (belongs to Phase 4 D-14) | Keeps orphan-UI deletion atomic in the reset track | `ARCHITECT-canonical-reset.md:103,212`; `DECISIONS-LOG.md:117-123` | Implemented (`4cd44e3`: Statusline, RunHistory, SettingsModal → API chokepoint) |
| D12 | §5-14: KEEP raw-with-timeout as permanent provider contract; NO lane build | Per-attempt errorText diagnostics + 30 s/15 s budgets + public-gateway compat outweigh uniformity | `openai-compatible.ts:44-50`; `audit-ground-rules.ts:455-457`; `DECISIONS-LOG.md:125-138` | Implemented (`506f79e`) |

---

## 3. Incidentals + extra findings reconciliation (nothing dropped)

### P1 track (FOLLOWUPS-P1-REMEDIATION.md T1–T7; E5/E6)

| Item | Description | Disposition / phase | Proof |
|------|-------------|---------------------|-------|
| T1 (E1+E3dash) | `CerebroDashboard.tsx:113` bare-`fetch` + duplicate `res` | CLOSED | `53cc472`; T6 closeout green |
| T2 (E3chatbot) | `CerebroChatbot.tsx:45` stale duplicate `body:` | CLOSED | `1b5c300`; `:46` shaped body kept, `:51` signal + `:36` timeout preserved |
| T3 (E4+E5b/c) | `ws-upgrade-guard.test.ts:114,141` Hono tuple spread + stale mirror comments | CLOSED | `6de1f62`; no `any`; cites `:231/:297/:299` live wiring |
| T4 (E2) | `gitnexus-client.ts:129-131,:250-255` dead raw-fetch blocks | CLOSED | `73c62d1`; governed `egressFetch` kept |
| T5 (E5a) | Zero heartbeat-sweep unit tests | CLOSED | `8275b7f` new `ws-heartbeat.test.ts` (4 cases, no `server-main` import) |
| T6 | Full-gate closeout + Hono deferral note | CLOSED | Repo-wide `tsc` 0 + audit 8/8 recorded; deferral consumed by `7d0a613` |
| T7 (E6) | E6 canonical-reset OD/R investigation track | SUPERSEDED → Phase 4 | ODs resolved per D2–D9/Phase 0; execution is Phase 4 §6 commits 1–7 |
| E5 track | Heartbeat coverage + mirror freshness (P1 hardening theme) | CLOSED | T3 (mirrors) + T5 (heartbeat) |
| E6 track | Canonical-reset ODs/Rs on separate non-blocking track | OPEN → Phase 4 | See OD/R rows below |

### P2 roll-in (FOLLOWUPS-P2-ROLLIN.md A1–A2 resolved; B1–B8 open)

| Item | Description | Disposition / phase | Proof |
|------|-------------|---------------------|-------|
| A1 scheduler lifecycle | Stale `_stopSchedulerLoopForTests` comment | CLOSED in P2 | `scheduler.ts:17-22`; `shutdown.test.ts` 7/7 |
| A2 free-model loop | Uncapped OpenCode free-model rotation | CLOSED in P2 (P2-1) | `opencode.ts:16-20` cap=3 + 30 s budget |
| B1 council hang | No council-level deadline; `llama-cpp.ts:48` no budget | CLOSED (Phase 2) | `07ad51a` per-leg signals + 60 s default |
| B2 UI timeout | `authFetch` no default timeout | CLOSED (Phase 2) | `58e01eb` COMBINE default 30 s + budgets |
| B3 §5-14 deferral | Raw-with-timeout now load-bearing | CLOSED → D12 (Phase 3 S4) | `506f79e` |
| B4 peer-port trap | Approved peer any-port 1–65535 + optional fingerprint | CLOSED (Phase 2 wave 2 of P1 track) | `4f588b4` route-layer allowlist + TOFU + banner |
| B5 dual DDL | CREATE vs 19 ALTERs two-place schema | CLOSED (Phase 3 S5) | `7a4facf` versioned chain, `migrate_v0_v1` |
| B6 worker writers | Worker threads hold write-capable DB handles | DOC+BOUND done; RPC cutover → Phase 5 | `f756c25` + `WORKER-WRITE-TOPOLOGY.md:108-124` preconditions |
| B7 Zen decommission | Keep-vs-remove decision request | CLOSED → D1 option C (Phase 3 S1) | `0af48f9`; directive stands |
| B8 claim_batch_size | `MAX_SAFE_INTEGER` default burst risk | CLOSED (Phase 3 S7) | `1fc5d87` → `HARDWARE_SAFE_MAX_WORKERS` ceiling |

### Phase 3 items 1–9 + idle item 9

| Item | Description | Disposition | Proof |
|------|-------------|-------------|-------|
| 1 Zen flag | Option C flag + label + retired error | CLOSED | `0af48f9` |
| 2 Hono bump | 4.12.x → 4.13.x standalone | CLOSED | `7d0a613` (4.13.13 / node-server 2.1.4) |
| 3 Port sweep | 4-file follow-up chore | CLOSED | `4cd44e3` |
| 4 §5-14 (D12) | Permanent provider contract | CLOSED | `506f79e` |
| 5 Dual-DDL | Versioned migration chain | CLOSED | `7a4facf` basevault 101/101 |
| 6 Worker writers | WAL contract + plugin-write bound | DOC+BOUND CLOSED; RPC → Phase 5 | `f756c25` (31/31 + 13/13 suites) |
| 7 claim_batch_size | Axiom-6-safe ceiling | CLOSED | `1fc5d87` coreexec 22/22 |
| 8 DegradationEngine ticket | OSLayout rewrite if real component exists | → Phase 4 D-14 (conditional closed: no component) | `RESET-PLAN-AMENDMENTS.md:47-64` |
| 9 idle dual writers (new) | Consolidate `idle.ts:120-133` + `:217-230` staging blocks | CLOSED | `b67d6ad` `stage-run.ts` chokepoint; scoutdaemon 5/5 |

### OD-1–OD-7 / R-1–R-8

| Item | Description | Disposition | Proof |
|------|-------------|-------------|-------|
| OD-1 | `system-maintenance` code-created? | RESOLVED keep-one (D6) → Phase 4 | `idle.ts:120-127,217-224`; `RESET-PLAN-AMENDMENTS.md:66-76` |
| OD-2 | `test_tx` schema vs artifact? | RESOLVED DROP-after-check (D7) → Phase 4 | `ARCHITECT-canonical-reset.md:51,66,132,144` |
| OD-3 | `.master.key` auto-regen path? | RESOLVED auto+assert (D4) → Phase 4 boot gate | `ARCHITECT-canonical-reset.md:150,314,327` |
| OD-4 | Reset helper keep vs delete? | RESOLVED create+delete w/ condition (D5) → Phase 4 | `ARCHITECT-canonical-reset.md:238,328` |
| OD-5 | DegradationEngine real vs test-only? | RESOLVED delete+ticket (D8); conditional closed → Phase 4 D-14 | `RESET-PLAN-AMENDMENTS.md:47-64` (zero hits in schema/Statusline) |
| OD-6 | Scrub tool + window + approval? | RESOLVED option A scoped (D3) → Phase 4 | `ARCHITECT-canonical-reset.md:310`; analyze-only done Phase 0 §7 |
| OD-7 | Exact gitignore lines? | CLOSED pre-resolved (D9) | `.gitignore:58,61,62,63` verified via `check-ignore` |
| R-1 | Scrub diverges clones | Mitigated → Phase 4 operator-approved step | Runbook line + D3; restated `RESET-PLAN-AMENDMENTS.md:34-45` |
| R-2 | Cloned keys need rotation | Ticket → Phase 4 rider (D2) | Dashboards action, NOT scrub-covered `:162-163` |
| R-3 | Purge breaks code-created project | Covered by OD-1 keep-one | D6 |
| R-4 | Missing keygen → boot crash | Covered by OD-3 verify-first | D4 |
| R-5 | `test_tx` DROP breaks idempotency | Covered by OD-2 check-first | D7 |
| R-6 | App deletion breaks unknown importer | Per-file proof rule → Phase 4 | `grep App` + `tsc` + UI suite per commit |
| R-7 | Lockout on credential purge | Procedure ordering → Phase 4 | Never purge running server |
| R-8 | `~/.neurosync/user_okf` keys | Out of scope; runbook note → Phase 4 | Operator self-audit |

### Phase 0 Architect extras (all reconciled)

S-3 lineage narrowing (oss-readiness-only, `165f9b6`) → Phase 4 scrub scope; S-1/S-2 main-track
→ Phase 4 DB-wipe + rotation; artifacts grep-clean (2 documented fixtures S-6/S-4 kept by design);
`e2e-report/`+`test-results/` in-history blobs → Phase 4 scrub path set; `.bak` 217,120 B → S-3
scrub target. Nothing outstanding except execution.

---

## 4. Gate scoreboard (current, HEAD `7a4facf`, verified 2026-10-08)

| Gate | State | Note |
|------|-------|------|
| `npx tsc --noEmit` | 0 errors | Clean repo-wide |
| `npm run audit:ground-rules` | 8/8 | Checks 1–8 all PASS; check-7 allowlist holds `adapters/openai-compatible.ts` (permanent per D12) |
| Key suites | Green per commit | basevault 101/101 (S5); worker/pool 31/31 + cerebro 13/13 (S6); provider 126/126 (S4); server 152/152 (S2); coreexec 22/22 (S7); scoutdaemon 5/5 + idle 3/3 (S9) |
| hono / node-server | 4.13.13 / 2.1.4 installed | Pins `package.json:52` `^4.13.13` / `^2.1.3`; GHSA-5r4p-p66f-jhc7 serveStatic covered |
| `npm audit` residual | 4 vulns (1 high, 3 critical), toolchain only | `tar` high + `simple-git`→`node-llama-cpp` chain; no `src/` runtime dependency affected |

---

## 5. Next actions (operator, in order)

1. **oss-readiness sign-off.** Approve `git push origin --delete oss-readiness` + local `-D` (carries the
   `165f9b6` `.bak` lineage; left untouched per runbook). Coordinates with the R-1 window.
2. **Rotation scheduling.** Schedule provider-side key rotation at the dashboards (FreeLLMAPI/OpenRouter)
   for S-1/S-3 material — mandatory, NOT covered by any scrub (D2/R-2). Independent of content commits.
3. **Phase 4 order.** Authorize canonical-reset §6 commits 1–7 with OD defaults (§1 REMAINING) + riders
   (boot-gate verify-first, R-6 per-file proof, R-7 never-purge-running). Per-commit gate `tsc` 0 + audit 8/8 or stop.
4. **Phase 4 scrub approval.** After ALL content commits land + rotation scheduled: approve scoped
   `filter-repo` scrub (`.data.bak_20261001_104101/` + `e2e-report/` + `test-results/`) + coordinated
   force-push window with the `fetch + reset --hard origin/main` runbook line (D3/OD-6/R-1).
5. **Phase 5 order (separately gated).** Release frontend/toolchain batch (eslint, Vite chunking, lazy
   dashboards, terminal WS URL, jsdom) + worker RPC cutover only when all 5
   `WORKER-WRITE-TOPOLOGY.md` §5 preconditions hold. Until then the WAL + bound contract stands.
