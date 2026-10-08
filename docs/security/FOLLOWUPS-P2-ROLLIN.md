# P2 Roll-in Follow-ups

Status: PLAN ONLY — no `src/` modified by this document.
Author: P2 FINAL AUDITOR (directive: roll-in check for Explorer incidentals + provider decommission).
Verified against: HEAD `917e9a3` + uncommitted P2 working tree (15 modified + 4 created files), 2026-10-07.
Process: follows `FOLLOWUPS-PROCESS.md` (four-stage loop, gates per commit, Auditor owns DoD).

## Phase taxonomy

- **P2 follow-up** — same-track hardening rolling into the next P2 wave (timeout/lifecycle/port themes).
- **P1 follow-up** — append to the perimeter/security track (`FOLLOWUPS-P1-REMEDIATION.md` wave 2).
- **P3** — architecture/strategy track (schema unification, single-writer topology, provider strategy).

---

## A. Incidentals RESOLVED by P2 (no follow-up needed — recorded for traceability)

### A1. Scheduler stale lifecycle claim — RESOLVED (P2-2)
- **Was:** `_stopSchedulerLoopForTests` claimed "Production code does NOT need to call this — the process lifecycle owns the loop until SIGINT."
- **Now:** `src/core/coreexec/scheduler.ts:17-22` — comment corrected to name the centralized shutdown as the one production stop path. Wired at `src/server/server-main.ts:714-728` (`installShutdownHandlers({ … stopScheduler: () => stopSchedulerLoop() … })`) → `src/server/shutdown.ts:182-190`.
- **Verified:** `src/server/shutdown.test.ts` (7 tests) green; full stop clears refreshTimeout, reflectionInterval, reflectionWorker, and cron jobs (`scheduler.ts:24-42`).

### A2. Uncapped OpenCode free-model rotation loop — RESOLVED (P2-1)
- **Was:** `for (const model of freeModels)` — every catalog candidate cost a full request with no cap; long catalogs stalled requests unboundedly.
- **Now:** `src/core/routeswitch/adapters/opencode.ts:16-20` (`OPENCODE_MAX_CANDIDATES = 3`) + `:90` (`freeModels.slice(0, OPENCODE_MAX_CANDIDATES)`); each candidate is additionally bounded by the 30 s adapter budget (`openai-compatible.ts:48-49`).
- **Verified:** `opencode-reasoning.test.ts` + `streamhooks-regression.test.ts` green.

---

## B. OPEN follow-ups

### B1. Council-mode hang bound is provider-dependent — P2 follow-up
- **Cite:** `src/core/routeswitch/council.ts:97-98` — `providers.map(p => p.generate(prompt, estimatedTokens, schema))` + `await Promise.all(promises)`. No council-level deadline; `streamHooks` is not passed (3-arg call), so no engine abort signal reaches providers in council mode.
- **State after P2:** HTTP providers (`OpenAICompatibleProvider` subclasses) are now bounded at 30 s each (`openai-compatible.ts:262-263`). `LlamaCppProvider` (`src/core/routeswitch/adapters/llama-cpp.ts:48`, `implements LLMProvider` directly — NOT a subclass) has **no time budget**; on Axiom 6 hardware (i3-N305) a single local generation can stall the whole council for minutes.
- **Ask:** add a council-level deadline (e.g. `Promise.race` with a configurable `council_timeout_ms`, or pass `streamHooks.signal` + per-provider race), and decide a wall-clock budget for the local adapter path.
- **Target phase:** P2 follow-up.

### B2. UI `authFetch` has no default timeout — P2 follow-up
- **Cite:** `src/ui/lib/api.ts:169-183` — `authFetch` forwards `init` verbatim to `fetch`; no `AbortSignal.timeout` default. Only `CerebroChatbot.tsx:36` carries its own 30 s controller (per P1 doc); every other call site (dashboards polling `/api/...`) can hang a fetch indefinitely on a wedged-but-open connection.
- **Ask:** default `signal: AbortSignal.any([init?.signal, AbortSignal.timeout(UI_FETCH_TIMEOUT_MS)])` inside `authFetch` (opt-out via explicit signal), mirroring the P2-1 adapter pattern (`openai-compatible.ts:67-91` `combineSignals`).
- **Target phase:** P2 follow-up.

### B3. §5-14 adapters raw-`fetch` deferral — decision now load-bearing — P3
- **Cite:** `src/core/routeswitch/adapters/openai-compatible.ts:44-48` (P2-1 comment: LLM traffic deliberately bypasses `egressFetch` kill-switch/private-address block). Deferral recorded at `docs/security/ARCHITECT-ci-gating-cleanup.md:94,305` and `docs/security/audit-loop/AUDITOR-round1-findings.md:67`; audit allowlist keeps check-7 green (`scripts/audit-ground-rules.ts` approved-usage list includes `adapters/openai-compatible.ts`).
- **State after P2:** P2-1 *increased* the deferred surface (embeddings + retry fetch now raw-with-timeout too, `:381-393`, `:291-300`). The rationale (provider calls ≠ agent egress) is sound, but the deferral is now load-bearing for timeout semantics — a future move to `egressFetch` must preserve the 30 s/15 s budgets.
- **Ask:** P3 decision — keep raw-with-timeout as the permanent provider contract (document §5-14 as settled) or design an `egressFetch` provider lane that preserves timeout/AgentStop semantics.
- **Target phase:** P3.

### B4. Peer-port trap — approved-peer port is unconstrained — P1 follow-up
- **Cite:** `src/core/basevault/network/sync-consent.ts:59-71` — `validateManualPeer` accepts ANY port 1–65535 for a private-range IP; no pinning to the expected sync port(s). `src/server/server-main.ts:373-394` — `/api/sync/peers` approve then calls `transport.connectToPeer({ hostname: ip, ip, port })` (`:394`); manual route `server-main.ts:334-345` same shape. `addApprovedPeer` fingerprint parameter is optional (`sync-consent.ts` signature below `:115`).
- **Risk:** an approved peer entry becomes a blind LAN probe primitive (connect-and-handshake against arbitrary ports on private hosts, error/timing oracle); with `sync_allow_public` the scope widens to any routable host. Operator consent gates *who* you connect to, but nothing constrains *which service* is expected on the far end.
- **Ask:** restrict acceptable ports (allowlist or the configured sync port only), require/verify a service fingerprint on first handshake (TOFU), and surface mismatches to PortGrid.
- **Target phase:** P1 follow-up (perimeter track wave 2).

### B5. Dual schema-definition paths in BaseVault — P3
- **Cite:** `src/core/basevault/db.ts:142-148` (`CREATE TABLE projects` already carries `workspace_path`/`project_root_path` inline) vs the 19 gated legacy `ALTER TABLE` migrations (`db.ts:111-131` gate; regions `:520-682`, `:713-731`, `:798-808`). P2-4 (`SCHEMA_VERSION = 1`, `db.ts:114`) gates the ALTERs behind `user_version` but the schema is still authored in two places (CREATE bodies + ALTER list); a future column added to only one path silently diverges fresh vs legacy databases.
- **Ask:** adopt a versioned migration chain (`SCHEMA_VERSION` bump + explicit `migrate_v1_v2` functions) and treat CREATE bodies as v-latest-only; fold the 19 legacy ALTERs into a single `migrate_v0_v1`.
- **Target phase:** P3.

### B6. Worker threads hold write-capable DB handles — P3
- **Cite:** `src/core/coreexec/worker.ts:279-293` (worker thread `require('../basevault/db')` + `initDB()` + SELECT), `:321-323` (`const { db: workerDb } = require('../basevault/db')` passed into `executePlugin` — plugins receive a write-capable handle), `:346-352` (verify-node reads). In production each worker thread opens its own better-sqlite3 connection to the same `.data/neurosync.db`; WAL + `busy_timeout` mitigate contention but nothing serializes worker→main writes (e.g. `CerebroVectorStore` writes from `okf_indexer` inside `executePlugin`).
- **Ask:** P3 single-writer topology — workers read-only (or RPC results back to the main thread for writes); until then, document the multi-connection WAL contract and bound plugin writes.
- **Target phase:** P3.

### B7. OpenCode Zen provider — decommission or keep-funded decision — P3 (requires human sign-off)
- **Cites (full removal surface if decommissioned):**
  - Adapter: `src/core/routeswitch/adapters/opencode.ts` (whole file; `OPENCODE_ZEN_BASE_URL` `:13`; `OPENCODE_MAX_CANDIDATES` `:20`).
  - Factory: `src/core/routeswitch/provider-factory.ts:4` (import), `:9` (`PROVIDER_TYPES` entry), `:42-43` (`case 'opencode'`).
  - Discovery: `src/core/routeswitch/discovery.ts:125-145` (`OpenCodeDiscoveryService`, `https://opencode.ai/zen/v1/models`).
  - UI: `src/ui/views/RouteSwitchDashboard.tsx:341,386,472,503,542-553` (type option "OpenCode Zen", modelId forms, key placeholder); `src/ui/views/PortGridDashboard.tsx:590` (CLI-agent label mention — cosmetic).
  - Tests: `src/core/routeswitch/adapters/opencode-reasoning.test.ts`, `src/core/routeswitch/adapters/streamhooks-regression.test.ts` (+ incidental mentions in `src/core/basevault/network/transport-sync-safety.test.ts`, `sync-ws-e2e.test.ts`).
- **Conflict flag:** AGENTS.md Core Directive 3 currently mandates keeping the Zen integration (FreeTierError is server-side; integration works on funded workspaces). Decommissioning **contradicts the standing directive** — this item is a DECISION REQUEST, not an approved removal. P2-1 meanwhile hardened the adapter (candidate cap + timeout-retriable), so the operational hang risk that motivated the question is resolved (see A2).
- **Ask:** human decision — (a) keep as-is (directive stands; close this item), or (b) decommission via the removal surface above with a directive update. If (b): remove type from `PROVIDER_TYPES`, delete adapter + discovery service, drop UI option, delete/re-scope the two test suites, migrate any DB rows with `type='opencode'`.
- **Target phase:** P3.

### B8. `claim_batch_size` default unbounded — P3 (optional hardening)
- **Cite:** `src/core/coreexec/settings.ts:47-54` — `getClaimBatchSize()` defaults to `Number.MAX_SAFE_INTEGER` (deliberate: reproduces pre-existing behavior, capped only by `availableSlots`). On Axiom 6 hardware an unset setting plus a large eligible queue is a burst-risk knob with no ceiling of its own.
- **Ask:** consider an Axiom-6-safe ceiling (e.g. `HARDWARE_SAFE_MAX_WORKERS`-multiple) as the default instead of MAX_SAFE_INTEGER. Low priority — documented as deliberate.
- **Target phase:** P3.

---

## C. Gate evidence (P2 final audit, 2026-10-07)

| Gate | Result | Note |
|------|--------|------|
| Targeted vitest (14-file superset of the P2 surface) | 133/134 | Sole red: `api.test.ts > no bare fetch(` → `CerebroDashboard.tsx` (pre-existing E1, `FOLLOWUPS-P1-REMEDIATION.md` Task 1) |
| `src/server/routes/llm.test.ts` | 9/9 | P2-touched route green |
| Broad run (`src/server/` + db + routeswitch, 34 files) | 228/228 assertions | 5 route suites fail at BUILD: pre-existing E2 duplicate declarations in `src/core/memory/gitnexus-client.ts:129-272` (untouched by P2; P1 Task 4) |
| `npx tsc --noEmit` | 13 errors, all pre-existing | E1 `CerebroDashboard.tsx:113-114` (2), E3 `CerebroChatbot.tsx:46` (1), E4 `ws-upgrade-guard.test.ts:113,140` (2), E2 `gitnexus-client.ts:129-272` (8) — zero in P2 files |
| `npm run audit:ground-rules` | 7/8 | Sole fail: check-7 raw egress on `CerebroDashboard.tsx` (pre-existing E1); check-2 shell-exec, check-3 test DB, check-8 loopback serve literal all PASS |
