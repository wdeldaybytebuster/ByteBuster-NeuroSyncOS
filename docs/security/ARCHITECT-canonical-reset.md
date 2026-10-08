# Canonical Reset — Architecture Plan (THE ARCHITECT)

**Status:** PLAN ONLY — no code, DB, or git state modified by this document.
**Author role:** THE ARCHITECT (research + planning). Execution is a separate agent's job.
**Repo state at plan time:** HEAD `5ff1c5c`, `git status` clean, pushed. Audit 8/8, `tsc` 0 (as reported; re-verify at execution).
**Scope:** Return the repo + live DB + tracked secrets + orphan/dead code + test artifacts to a reproducible **canonical state**: a fresh clone boots to an empty-DB, no-provider, setup-window-open server with the knowledge base re-indexed from the committed seed, zero secrets anywhere, and a green suite.

---

## 0. Independent verification (file:line + snippet)

Every Explore-agent fact was re-checked. **Deviations from the Explore inventory are marked [DEVIATION].**

### 0.1 Live DB — `.data/neurosync.db` (528K), 38 tables

Verified via `sqlite3` (`SELECT name FROM sqlite_master`, per-table `COUNT(*)`):

| # | Table | Rows | Disposition (§1) |
|---|-------|------|------------------|
| 1 | `cerebro_learning_approvals` | 0 | PURGE (already empty) |
| 2 | `cerebro_memories_meta` | 4 | PURGE |
| 3 | `cerebro_memories_vec` | vec0-ERR (virtual table, no sqlite-vec module in python; chunk/info side tables hold the data) | PURGE via parent |
| 4 | `cerebro_memories_vec_chunks` | 0 | PURGE |
| 5 | `cerebro_memories_vec_info` | 4 | PURGE |
| 6 | `cerebro_memories_vec_rowids` | 0 | PURGE |
| 7 | `cerebro_memories_vec_vector_chunks00` | 0 | PURGE |
| 8 | `cerebro_prune_log` | 0 | PURGE |
| 9 | `context_events` | 0 | PURGE |
| 10 | `council_decisions` | 0 | PURGE |
| 11 | `dag_proposals` | 1 (`d063b8db-…`) | PURGE (test leftover) |
| 12 | `discovered_models` | 466 | PURGE (re-fetched at runtime) |
| 13 | `environment_rules` | 0 | PURGE (re-derived by CoreExec at boot) |
| 14 | `hardware_profiles` | 0 | PURGE (re-profiled by ScoutDaemon at genesis) |
| 15 | `llm_providers` | 2, both `api_key_encrypted` BEARING | PURGE (operator must re-add post-reset) |
| 16 | `llm_routing_rules` | 1 (`rule_2ef84eb57538`, chain `["prov_2f72dbcf04c6","prov_8d6ad3de1991"]`) | PURGE |
| 17 | `memory_audit_log` | 0 | PURGE |
| 18 | `memory_quarantine` | 0 | PURGE |
| 19–23 | `memory_quarantine_vec*` (5 side tables) | 0/4-info/0/0/0 | PURGE via parent |
| 24 | `model_benchmarks` | 0 | PURGE (writer `Benchmarker` is itself deleted, §3) |
| 25 | `okf_edges` | 11 | PURGE (re-indexed) |
| 26 | `okf_nodes` | 110 (`GLOBAL` 83 + `USER` 27) | PURGE (re-indexed from seed + user dir) |
| 27 | `os_todos` | 1 (SA-06 rejection test artifact) | PURGE |
| 28 | `projects` | 3 (`system-maintenance`, 1 ScopeLogic session, `test-proj-1`) | PURGE — see OPEN DECISION OD-1 on `system-maintenance` |
| 29 | `scout_okf_nodes` | 0 | PURGE |
| 30 | `scout_symbols` | 0 | PURGE |
| 31 | `sqlite_sequence` | 1 (`sync_event_log`=30) | RESET (autoincrement restart; harmless either way) |
| 32 | `sync_event_log` | 30 | PURGE |
| 33 | `sync_lock` | 1 (`rowid=1`) | KEEP (created by `initDB` itself, `INSERT OR IGNORE`) |
| 34 | `system_settings` | 20, all non-secret config keys | PURGE (boot re-inserts defaults; operator re-tunes) |
| 35 | `tasks` | 2 (1 completed + `test-node-2`) | PURGE |
| 36 | `test_tx` | 1 (`(1,'hello')`) | PURGE + DROP TABLE (test-only; see OD-2) |
| 37 | `workflow_runs` | 4 (completed/failed/failed/running) | PURGE |
| 38 | `workflows` | 0 | PURGE |

Evidence:

- `src/core/basevault/db.ts:710` — `INSERT OR IGNORE INTO sync_lock (rowid, is_syncing) VALUES (1, 0);` (the only seed-type write in `initDB`).
- `src/core/basevault/db.ts:221,236,251–284` — all other `INSERT` hits are audit-trigger bodies, not seed rows. **`initDB()` inserts ZERO seed rows — VERIFIED.**
- `llm_providers` schema (`PRAGMA table_info`, verified): `(id, name, type, config_json, api_key_encrypted, is_enabled, created_at, updated_at, require_paid_tier, is_paid_tier)`.
  - **[DEVIATION — column name]:** the secret column is `api_key_encrypted`, not `api_key`. Rows: `prov_8d6ad3de1991/FreeLLMAPI/freellmapi` key-prefix `96fa3a3b…`, `prov_2f72dbcf04c6/Freellmapi/openai-compatible` key-prefix `9550f624…` (format `hexIV:hexCipher`, AES-256-GCM via BaseVault crypto). Both operator-added, both secrets-bearing.
  - `config_json` of `prov_2f72dbcf04c6` contains `{"baseUrl":"http://localhost:3001/v1","m…` — verify at execution whether a real endpoint/secret hides in the truncated tail; treat as secret-bearing regardless.
- `system_settings` keys (all 20, verified — values never printed): `aria_enforcement, autonomy, budget, cerebro_access_boost, cerebro_decay_multiplier, cerebro_keyword_base, cerebro_keyword_boost, cerebro_keyword_fallback, cerebro_min_similarity, daily_cost_ceiling, directory_lock, env_stripping, external_calls_enabled, file_arg_validation, grammar_constrained, redaction_level, reduced_motion, retention_max_days, retention_max_runs, smart_tips`. Query for `llm% / operator% / bind% / api_key% / credential%` returns **empty — VERIFIED: `llm_api_key` / `operator_credential` / `bind_address` ABSENT as rows → setup window open.**
- `okf_nodes` schema uses **`tier`**, not `scope`.
  - **[DEVIATION — column name]:** Explore said "GLOBAL 83 + USER 27" grouped by scope; actual: `SELECT tier, COUNT(*) … → ('GLOBAL',83), ('USER',27)`. Counts match, column name corrected. `src/core/scoutdaemon/genesis.ts:24-29` queries `WHERE project_id = ?` — consistent with schema (`project_id` nullable; USER sample rows show `project_id NULL`, types `greeting/index/log` — i.e. current USER tier looks like test/default content, safe to purge).
  - **[DEVIATION — attribution]:** `discovered_models` schema is `(id, name, context_length, pricing_prompt, pricing_completion, fetched_at)` — **there is NO `provider_id` column**, so per-provider attribution of the 466 rows is unverifiable from the DB. Count 466 VERIFIED; sample `google/gemini-nano-banana-2.1`, `mistralai/mistral-large-4-0`. Treat all 466 as disposable cache (re-fetched via Zen discovery at runtime).
- Test leftovers VERIFIED: `os_todos` 1 row (SA-06 rejection artifact), `tasks` includes `test-node-2` with `output_data` `"Test received. I am functioning correctly…"`, `test_tx (1,'hello')`, `dag_proposals d063b8db-…`, `workflow_runs` 4 rows. `test-proj-1` + ScopeLogic-session project + 2 tasks + 4 runs + 30 `sync_event_log` rows are one consistent test session's residue.

### 0.2 `.data/.master.key` + tracked backup

- `.data/.master.key` 32B, `.data.bak_20261001_104101/.master.key` 32B, backup `neurosync.db` 212K — VERIFIED (`ls -lh`, `wc -c`).
- `git ls-files | grep -E "^\.data"` returns **exactly**: `.data.bak_20261001_104101/.master.key`, `.data.bak_20261001_104101/neurosync.db` — **VERIFIED: secret-bearing backup is COMMITTED to git** (introduced in `165f9b6`). `.data/` itself is gitignored (`.gitignore: `.data/`), so the live key/DB are untracked; only the `.bak` copy is tracked.
- `.data/` live contents: `.master.key`, `neurosync.db`, `workspaces/` (18 UUID dirs — VERIFIED `ls | wc -l` = 18). **`.sync.secret` ABSENT — VERIFIED** (never existed; nothing to purge, add a negative check to the test plan).
- Backup dir also contains a `workspaces/` subtree (dozens of entries); `git ls-files` shows only the 2 files tracked from it, so the backup's workspaces are untracked-but-present-on-disk. Both must go (§1.4).

### 0.3 Knowledge base (PRESERVE + re-index)

- **[DEVIATION — layout, counts confirmed]:** `resources/global_okf_seed/` is **5 subdirectories, 87 `.md` files recursively** (`find … -type f | wc -l` = 87), not "87 files" flat. Subdirs: `core-reasoning/ memory-context/ multi-agent-orchestration/ safety-reliability/ tooling-integration/`. Same for `~/.neurosync/global_okf` (5 dirs, 87 files) and `~/.neurosync/user_okf` (27 files). Counts match Explore; structure clarified. All committed seed content is PRESERVED (§1.3).
- Never-overwrite VERIFIED — `src/core/okf/global-seed.ts:57-66` (`seedIfEmpty`: `if (existing.length > 0) return { seeded:false … }`, "this is a first-run bootstrap, not a sync") and `bootstrapGlobalOKFSeed` (no-ops once tier has content; test-overridable dirs). Check-5 (`scripts/audit-ground-rules.ts:268-337`) pins: seed dir exists + has `.md` + `global-seed.ts` exports `bootstrapGlobalOKFSeed` + server entry imports it. **Any reset step touching these paths must keep check-5 green.**

### 0.4 Test secrets

- `e2e/global-setup.ts:25` — `const PASSWORD = process.env.NEUROSYNC_E2E_PASSWORD ?? 'neurosync-e2e-operator-pw';` VERIFIED (`:25`, env-overridable, comment "never a production one"). Global-setup flow VERIFIED (`e2e/global-setup.ts:1-20` docblock + `:48-60`): `POST /api/auth/setup → 200` fresh box, else `POST /api/auth/login → 200`; loud failure otherwise. **Line number corrected: default is on line 25, not 26.**
- 3 auth-test passphrases VERIFIED (all synthetic, in-test-only, all ≥12 chars): `src/server/auth/auth-routes.test.ts:30` `'a-sufficiently-long-passphrase'`; `src/server/auth/auth-middleware.test.ts:35` `'operator-grade-passphrase'`; `src/server/auth/argon2-budget.test.ts:25` `'budget-proof-passphrase'`. (Plus `'not-the-password-at-all'` wrong-password probe, `:60`.) **Disposition: KEEP + document (never touch real DB — enforced by check-3, `checkTestsUseInMemoryDb`).**
- `scripts/crypto-test.ts:8` — `const testKey = "***REMOVED-ANTHROPIC-KEY***";` VERIFIED. Synthetic `***REMOVED-ANTHROPIC-KEY***` prefix but realistic-looking; posts to live `/api/system/settings` (`:13-17`) and reads raw DB (`:38-40`). **Disposition: DELETE with the script (§3) — the string dies with it; no rotation needed (never a real key), but grep-proof required (§7).**

### 0.5 Orphans (zero-importer claims)

Method required: per-file `grep -rn` importer proof at execution time (§3 table). Verified now:

| File | Importer proof (verified) | Verdict |
|------|---------------------------|---------|
| `src/core/routeswitch/model-selector/benchmarker.ts` (`Benchmarker`, writes `model_benchmarks`) | `grep benchmarker/Benchmarker` outside itself → **zero hits** | DELETE |
| `src/core/routeswitch/model-selector/cerebro-assist.ts` (`generateResponse`) | Only caller is its own test `cerebro-assist.test.ts:72`; header `:30-33` self-declares `@deprecated DEAD CODE` | DELETE file + test |
| `src/core/routeswitch/router.ts` (`executeWithFallback`) | Header `:1-12` self-declares DEAD; production path is `engine.ts` (imports `dynamic-router`, `triage`, `providers` — **not** `router.ts`); only importers are `router.test.ts` + `scripts/live-test.ts` | DELETE file + test + live-test |
| `src/core/routeswitch/model-selector/classifier.ts` (`classifyComplexity`) | Importers: only `classifier.test.ts:2` + `scripts/live-test.ts:12`. Engine uses `TriageClassifier` from `triage.ts`, **not** this file | DELETE file + test (rides with the router chain) |
| `src/core/scoutdaemon/genesis.ts` (`bootstrapSkills`) | `grep bootstrapSkills` → only definition `:18`, zero callers | DELETE file (check for co-habitants first — file also holds `GenesisBootstrapper`; if anything imports the class, extract-or-keep; default DELETE) |
| `test-guards.ts` (repo root; `initDB()` + raw `INSERT` into live DB) | Nothing imports it; it **writes the live DB** on run | DELETE (dangerous, §6) |
| `scripts/build_scopelogic.cjs` | **65K** (Explore said 66K — immaterial), nothing references it | DELETE |
| `scripts/chaos.ts` (hardcoded `/usr/bin/google-chrome-beta`, `playwright` raw) | Nothing references it | DELETE |
| `scripts/crypto-test.ts` | Nothing references it; carries `***REMOVED-ANTHROPIC-KEY***` string | DELETE |
| `scripts/dag-test.ts`, `scripts/e2e-test.ts` (raw `fetch http://localhost:3743`, pre-governance) | Nothing references them | DELETE both |
| `scripts/fix_fetches.ts` (regex-mutates source, appends `.catch(()=>{})`) | `grep fix_fetches` → zero hits; dangerous codemod | DELETE |
| `src/ui/App.tsx` (508 lines) + views | **[DEVIATION — path + entry]:** lives at `src/ui/App.tsx`, not root `App.tsx`. `src/ui/main.tsx:1-15` boots `OSLayout`, **not** `App` — `grep ui/App` repo-wide → only importer is `DegradationEngine.test.tsx`. Views (`BaseVault/Cerebro/CoreExec/PortGrid/ScopeLogic/ScoutDaemon/UnifiedMaster/RouteSwitchDashboard`, 298–894 lines each, total 4770 incl. context) are reachable only via `App` | DELETE `App.tsx` + 8 orphan views + `DegradationEngine.test.tsx` (after proving no other importer; `ModuleRouter`/`AppShell` in components/ are the live shell — verify before deleting anything under `components/`) |
| `src/core/scoutdaemon/hardware-context.tsx` (`HardwareProvider`) | `HardwareProvider` export has zero users, but **`useHardwareTier` has 5 live importers** (`IntentPreview, NodeOutputInspector, RunHistory, SettingsModal, ScopeLogicChat`) | **KEEP file, DELETE only the `HardwareProvider` export** (or keep export with deprecation — Executor decides; default: remove export, keep hook) |

**NOT dead — VERIFIED, must stay:**

- `mock-provider` — LIVE fallback: `providers.ts:81` re-export; `provider-factory.ts:54` `return new MockProvider()`; `engine.ts:52` `new MockProvider()` default; `server-main.ts:334` documents MockProvider fallback. **KEEP.**
- `gitnexus-client` — LIVE: imported by `worker.ts:16`, `context-router.ts:2`; mocked (not bypassed) in tests. **[DEVIATION — allowlist]:** Explore claimed the check-7 `gitnexus-client` entry "matches nothing". **FALSE.** `gitnexus-client.ts:1` `import { spawn, ChildProcess }` + `:295` `import { execFile }` — it is a genuine `child_process` user and the allowlist entry is load-bearing. **RETAIN.**
- `terminal-session (pty)` — uses `node-pty` (`pty.spawn`, `:380`), not `child_process`; the allowlist entry is a deliberate documented exception (`audit-ground-rules.ts:84-89` comment says exactly this). **RETAIN as documented exception.**
- `dynamic-router.ts` (`selectOptimalModel`) — LIVE via `engine.ts:7`. **KEEP + KEEP its test.** (It is *imported by* the dead `live-test.ts`, but liveness is determined by production importers, not test-script importers.)

### 0.6 Tests + artifacts

- `find src -name "*.test.ts" -o -name "*.test.tsx" | wc -l` = **83** VERIFIED (includes `DegradationEngine.test.tsx` + `api.test.ts`). `scripts/*.test.ts` = 2 (`audit-ground-rules`, `tauri-config`) VERIFIED. `e2e/` = `global-setup.ts` + 2 specs (`lifecycle-audit`, `omni-audit`) VERIFIED.
- `DegradationEngine.test.tsx:1-3` forces `@vitest-environment jsdom` and renders the **orphan `App`** with heavy mocks — dies with §3's App subtree. No standalone `DegradationEngine.tsx` source found under `src/ui/` (only the test + references in `schema.ts`/`Statusline.tsx` — Executor must resolve whether a real component exists elsewhere before deleting; if yes, test is rewritten, not deleted — see §4).
- Suites covering dead code: `router.test.ts`, `cerebro-assist.test.ts`, `classifier.test.ts`, `dynamic-router.test.ts` — first three die with their subjects; `dynamic-router.test.ts` **STAYS** (subject is live).
- `e2e-report/` (584K) + `test-results/` (68K) are **tracked** (`git ls-files` lists `e2e-report/data/*.md`, `index.html`, `test-results/.last-run.json`, `…/error-context.md`) — failure artifacts committed. `dist/` 14M is **ignored** (`.gitignore: dist/`) — VERIFIED. Playwright config: UI `baseURL localhost:3742`, e2e API `http://127.0.0.1:3743` (two-port split is by design: vite 3742 → api 3743; the "connection-refused" failure mode is "API not running", which `global-setup.ts` already reports loudly).
- Source-regex suites (check-2/6/7/8 scan `src/`) will auto-heal when dead files leave; no suite edits needed except deletions in §4.

### 0.7 Empty-DB boot + setup window (danger items, VERIFIED)

- `server-main.ts:606-620` + `perimeter.ts:85` + `auth-middleware.test.ts:131-132,256-257` confirm: loopback-only bind, boot-time setup window, non-loopback refused everywhere in setup mode. **Credential deletion without an open window locks setup — the reset procedure (§5) MUST sequence stop → purge → start-with-window → POST setup on loopback within the window.**
- Check-5 deps: `resources/global_okf_seed/` + `src/core/okf/global-seed.ts` must exist at every commit (§6 gate).

---

## 1. Reset semantics — the canonical state

**Definition.** After canonical reset, a fresh clone + `npm ci` + boot MUST converge to this state without manual DB surgery:

1. **Database:** schema-complete (all 38 tables exist via `initDB()`), **zero operator/test data** — per-table disposition in §0.1 table. Net effect: every table empty **except** `sync_lock` (1 row, self-created) and `sqlite_sequence` (ignorable). `test_tx` is **dropped** if it is a test-created table rather than schema (see OD-2).
2. **Filesystem `.data/`:** `neurosync.db` fresh-schema, `.master.key` freshly generated 32B, `workspaces/` present-but-empty, **no `.bak*`, no journals, no `.sync.secret`**.
3. **Providers/routing/models:** `llm_providers` 0 rows, `llm_routing_rules` 0, `discovered_models` 0 → UI shows the **"No providers configured yet"** empty state (§5 confirms e2e Step 1 already asserts this).
4. **Knowledge base:** `resources/global_okf_seed/` (87 `.md`, committed) untouched; `~/.neurosync/global_okf` re-seeded iff empty (never overwritten); `~/.neurosync/user_okf` (27 operator files, **outside the repo**) untouched; `okf_nodes`/`okf_edges` re-indexed from those dirs at boot.
5. **Secrets:** zero keys/credentials/passwords in DB, files, git history (post-scrub), or committed fixtures. Only synthetic test constants remain, documented in §2.
6. **Code:** orphans deleted (§3), live code untouched, 8/8 audit + `tsc` 0 at every commit (§6).
7. **Suite:** dead-code suites deleted, e2e green against the canonical box, no tracked failure artifacts.

### 1.1 Per-table disposition (all 38 — normative)

`PURGE` = `DELETE FROM` (or whole-DB file removal, which is equivalent given `initDB` recreates schema — the Executor uses **whole-file removal**, §5, making this table a verification checklist, not 38 statements):

- PURGE: `cerebro_learning_approvals`, `cerebro_memories_meta` (+ all `cerebro_memories_vec*` side tables), `cerebro_prune_log`, `context_events`, `council_decisions`, `dag_proposals`, `discovered_models`, `environment_rules`, `hardware_profiles`, `llm_providers`, `llm_routing_rules`, `memory_audit_log`, `memory_quarantine` (+ `vec*`), `model_benchmarks`, `okf_edges`, `okf_nodes`, `os_todos`, `projects`, `scout_okf_nodes`, `scout_symbols`, `sync_event_log`, `system_settings`, `tasks`, `test_tx` (+DROP, OD-2), `workflow_runs`, `workflows`.
- KEEP: `sync_lock` (self-seeded by `initDB`, `db.ts:710`).
- IGNORE: `sqlite_sequence`, `*_vec_vector_chunks00`, `*_vec_rowids` (derived/empty).

### 1.2 `.data` handling — WIPE (not selective purge)

Rationale: `initDB()` inserts zero seed rows (§0.1), so file deletion ≡ selective purge + less risk of missed rows. **Delete `neurosync.db*` + `.master.key`; `initDB` recreates both on boot** (key generation is boot-side — Executor verifies this code path exists before deleting; if keygen is not automatic, generate-then-boot becomes an explicit step, OD-3).

### 1.3 Knowledge base — PRESERVE + re-index

- KEEP (never touch): `resources/global_okf_seed/` (87 `.md`), `src/core/okf/global-seed.ts`, `~/.neurosync/global_okf`, `~/.neurosync/user_okf`.
- RE-INDEX: boot-time `bootstrapGlobalOKFSeed` + `OKFIndexer` repopulates `okf_nodes`/`okf_edges` (expect ≈83 GLOBAL rows from seed + USER rows from `~/.neurosync/user_okf`; exact USER count may differ from 27 if the operator dir changed — assert `> 0`, not `== 27`).
- `~/.neurosync` is **outside the repo** — the plan never deletes outside the repo. Document, don't purge.

### 1.4 `.data.bak_20261001_104101/` + history scrub

1. `git rm -r --cached .data.bak_20261001_104101/` + filesystem `rm -rf` + append `.data.bak*/` to `.gitignore` (the current `backup-*.db` patterns do NOT cover this name — verify).
2. History scrub (Executor + operator approval — rewrites pushed history): `git filter-repo --path .data.bak_20261001_104101 --invert-paths` (or BFG equivalent), force-push, notify fetchers. Until scrubbed, the keys are public-to-cloners — hence §2 rotation is NOT deferrable.
3. **Key rotation is mandatory regardless of scrub** (clones already exist): the two `api_key_encrypted` blobs decrypt only with the committed `.master.key`; after reset those rows are gone, but the *provider-side* keys must still be rotated by the operator (they were exposed in ciphertext + key together = plaintext-equivalent to anyone holding the clone).

### 1.5 `workspaces/` — 18 empty dirs

Current 18 UUID dirs under `.data/workspaces/` are residue (projects table holds only 3 rows, one a test). Canonical: **empty `workspaces/` dir, gitignored via `.data/`**. The backup dir's workspaces copy goes with the backup.

---

## 2. Secret purge — every location

| # | Location | Content | Disposition |
|---|----------|---------|-------------|
| S-1 | `llm_providers.api_key_encrypted` ×2 (live DB) | 2 operator keys (`96fa3a3b…`, `9550f624…` + full `config_json` incl. `baseUrl`) | PURGE with DB wipe + **ROTATE provider-side** (exposed as plaintext-equivalent via committed `.master.key`) |
| S-2 | `.data/.master.key` (live, untracked) | 32B AES master key | DELETE; boot generates fresh (verify code path, OD-3) |
| S-3 | `.data.bak_20261001_104101/.master.key` + `neurosync.db` (**tracked**) | Same class as S-1/S-2, in git | `git rm` + history scrub + rotation (S-1). Treat as **the** incident: anyone who cloned post-`165f9b6` holds both halves |
| S-4 | `e2e/global-setup.ts:25` default `'neurosync-e2e-operator-pw'` | LOW RISK: env-overridable (`NEUROSYNC_E2E_PASSWORD`), documented non-production, ≥12 chars | **KEEP + document.** Rotate = change the default string only if it ever touched a real box (it didn't — e2e is connection-refused without a running server). Parameterization already exists. No action beyond a code comment affirming "synthetic, never production" |
| S-5 | 3 auth-test passphrases (§0.4) | Synthetic, in-test-only, check-3 guarantees in-memory DB | **KEEP + document.** Never rotate (they're fixtures, not credentials) |
| S-6 | `scripts/crypto-test.ts:8` `"***REMOVED-ANTHROPIC-KEY***"` | Synthetic but realistic prefix; script posts to LIVE api + reads raw DB | **DELETE with script** (§3). No rotation (never real). Grep-proof in §7 |
| S-7 | Browser residue (`localStorage['neurosync.session']`, e2e specs inject via `addInitScript`) | Session tokens minted during test runs | Procedure (§2.1): revoke server-side (credential rotation invalidates all tokens) + clear site data for `localhost:3742/3743` (DevTools → Application → Clear storage) + `rm -rf e2e-report test-results` (may embed tokens in traces). E2e never runs against non-loopback, so exposure is local-only |
| S-8 | `~/.neurosync/` (outside repo) | Operator's 27 user files; may reference keys | **Hands off.** Note in runbook: operator audits own dir. Never `rm` outside the repo |
| S-9 | `.env` (untracked, if exists) + `local_models/`, `.antigravity/` (ignored dirs) | Possible local keys | Verify absent-or-ignored at execution (`git status --ignored`); never commit. `.env.example` is clean (no secrets, verified) |

### 2.1 Browser-residue procedure (Executor runbook entry)

1. Rotate/re-create the operator credential post-reset (invalidates all minted tokens).
2. Chromium/Chrome: `DevTools → Application → Storage → Clear site data` for both `http://localhost:3742` and `http://127.0.0.1:3743`.
3. Delete `e2e-report/`, `test-results/`, `playwright/.cache` from disk (traces/screenshots may embed tokens).
4. Re-run e2e once to confirm fresh `setup → login → inject → pass` with no stale session.

---

## 3. Orphan deletion list (exact files)

**Rule:** no file is deleted until the Executor re-runs its importer proof (`grep -rn <symbol> src/ scripts/ e2e/ index.html vite.config.ts`) and pastes the empty result into the commit message. Table states the proof expected.

| # | Delete | Importer proof (re-run at execution) | Tests going with it |
|---|--------|--------------------------------------|---------------------|
| D-1 | `src/core/routeswitch/model-selector/benchmarker.ts` | `grep -rn Benchmarker` → only self | (none) |
| D-2 | `src/core/routeswitch/model-selector/cerebro-assist.ts` | `grep -rn CerebroAssistPipeline\|generateResponse` → only `cerebro-assist.test.ts` | `cerebro-assist.test.ts` |
| D-3 | `src/core/routeswitch/router.ts` | `grep -rn executeWithFallback` → only `router.test.ts` + `live-test.ts` | `router.test.ts` |
| D-4 | `src/core/routeswitch/model-selector/classifier.ts` | `grep -rn classifyComplexity` → only `classifier.test.ts` + `live-test.ts` | `classifier.test.ts` |
| D-5 | `scripts/live-test.ts` | `grep -rn live-test` → only self + docs | (none; env-gated operator script, superseded by e2e) |
| D-6 | `src/core/scoutdaemon/genesis.ts` | `grep -rn bootstrapSkills\|GenesisBootstrapper` → only self | `genesis*.test.ts` if exists (verify; none found in inventory) |
| D-7 | `test-guards.ts` (root) | nothing imports root file; **writes live DB** | (itself a script) |
| D-8 | `scripts/build_scopelogic.cjs` (65K) | `grep -rn build_scopelogic` → zero | (none) |
| D-9 | `scripts/chaos.ts` | zero references; hardcoded chrome path | (none) |
| D-10 | `scripts/crypto-test.ts` | zero references; carries S-6 | (none) |
| D-11 | `scripts/dag-test.ts` | zero references; raw-fetch pre-governance | (none) |
| D-12 | `scripts/e2e-test.ts` | zero references; raw-fetch pre-governance | (none) |
| D-13 | `scripts/fix_fetches.ts` | `grep -rn fix_fetches` → zero; regex codemod danger | (none) |
| D-14 | `src/ui/App.tsx` + 8 views (`BaseVault/Cerebro/CoreExec/PortGrid/ScopeLogic/ScoutDaemon/UnifiedMaster/RouteSwitchDashboard.tsx`) | `grep -rn ui/App` → only `DegradationEngine.test.tsx`; `main.tsx` boots `OSLayout` not `App` | `src/ui/DegradationEngine.test.tsx` (renders orphan `App`) |
| D-15 | `HardwareProvider` export in `hardware-context.tsx` | `grep -rn HardwareProvider` → zero users; `useHardwareTier` has 5 live users | keep file + hook, remove export only |

**Explicitly STAYS:** `adapters/mock-provider.ts` (+`providers.ts:81`, `provider-factory.ts`, `engine.ts:52`), `memory/gitnexus-client.ts` (+ allowlist entry), `dynamic-router.ts` (+ its test), `triage.ts` (`TriageClassifier`, the live classifier), `engine.ts`, `OSLayout`/`AppShell`/`ModuleRouter` shell, `global-seed.ts`, all of `components/` except proof-of-orphan removals (verify each).

**Allowlist cleanup — RETAIN BOTH, DOCUMENT (deviation from Explore):** `CHILD_PROCESS_ALLOWLIST` (`audit-ground-rules.ts:83-102`) keeps all 4 entries (`sandbox.ts`, `terminal-session.ts`, `gitnexus-client.ts`, `system.ts`) — `gitnexus-client` genuinely spawns (`:68-77`, `:295-297`), `terminal-session` is the documented `pty` exception. No dead entries exist. The Executor adds a one-line comment cross-referencing this plan so the next audit doesn't re-flag them. Any allowlist edit must be followed by `npm run audit:ground-rules` green before commit (§6).

---

## 4. Test-tree cleanup

| Suite / artifact | Disposition |
|------------------|-------------|
| `router.test.ts`, `cerebro-assist.test.ts`, `classifier.test.ts` | DELETE with subjects (D-2/3/4) |
| `dynamic-router.test.ts` | **KEEP** (subject live via `engine.ts:7`) |
| `DegradationEngine.test.tsx` | DELETE with orphan `App` (D-14) — **unless** Executor finds a real `DegradationEngine` component outside the test (references in `schema.ts`/`Statusline.tsx` suggest the name exists elsewhere); if so, REWRITE test against `OSLayout`, don't delete |
| `auth-routes/middleware/argon2` tests, `api.test.ts`, `context-router.test.ts`, `gitnexus_mapper.test.ts`, all other `src/**/*.test.*` | KEEP (live subjects; `context-router`/`gitnexus_mapper` mock the client boundary correctly) |
| `scripts/audit-ground-rules.test.ts`, `scripts/tauri-config.test.ts` | KEEP |
| `e2e/lifecycle-audit.spec.ts`, `e2e/omni-audit.spec.ts`, `e2e/global-setup.ts` | KEEP; re-run against canonical box (§5). E2e Step 1 already expects the empty state — confirm post-reset |
| `e2e-report/` (584K), `test-results/` (68K) | `git rm -r` both + append to `.gitignore` (`e2e-report/`, `test-results/`, `playwright/.cache`). Regenerable; must never be committed again |
| Source-regex suites (checks 2/6/7/8) | No edits — they scan `src/` and auto-heal as dead files leave. If a check references a deleted path by name (Executor greps the check sources for `router|classifier|cerebro-assist|App`), update the check in the same commit as the deletion |

---

## 5. Reset mechanics (procedure, not script — Executor writes the script)

> No raw-shell workflow nodes; the reset script is an operator-run `tsx`/bash helper under `scripts/` (deleted after use or kept as `scripts/canonical-reset.ts` — OD-4), never a DAG node (SA-01–SA-06).

1. **Stop everything.** Kill `dev:server`, vite, watchers. Confirm ports 3742/3743 free. (Prevents WAL-half-writes and the `running` workflow row from mutating mid-purge.)
2. **Snapshot (safety, local-only).** `cp .data/neurosync.db /tmp/opencode/reset-backup-$(date +%s).db` + `cp .data/.master.key …`. Never commit the snapshot.
3. **Purge.**
   - `rm -f .data/neurosync.db* .data/.master.key`
   - `rm -rf .data.bak_20261001_104101/ .data/workspaces/* e2e-report/ test-results/ dist/` (dist regenerates via build)
   - `git rm -r --cached .data.bak_20261001_104101/ e2e-report/ test-results/` (assume tracked; no-op-safe)
4. **Orphan + test deletions** (§3, §4) — as code commits *before* the DB purge commit or after; order in §6.
5. **Boot.** Start server on loopback (`npm run dev:server` or equivalent). `initDB` recreates schema + `sync_lock`; `.master.key` regenerates (verify path per OD-3); `bootstrapGlobalOKFSeed` seeds + indexes GLOBAL (≈83 rows); genesis profiler writes `hardware_profiles` + `environment_rules`; setup window opens (no `operator_credential` row).
6. **Credential.** Within the window: `POST /api/auth/setup {"password": <fresh operator pw>}` on loopback → 200. (E2e's global-setup does exactly this when `NEUROSYNC_E2E_PASSWORD` is set — reuse it.)
7. **Verify.** §7 checklist: row counts all-zero (except `sync_lock`/`sqlite_sequence` + freshly indexed `okf_*` + 1 credential row), seed counts, empty-state UI, `tsc` 0, audit 8/8, secret greps clean, e2e green.
8. **Fresh-clone equivalence.** `git clone <repo> && npm ci && boot` MUST reach the same state minus `~/.neurosync/user_okf` content (machine-local) and minus the operator credential. Executor proves this in a temp dir or documents why not.

**No-provider UX:** e2e Step 1 (`lifecycle-audit.spec.ts:39-51`) clicks `Set-up` and asserts the "No providers configured yet" empty state is NOT shown only after setup — i.e. the suite already encodes empty-state-first. Post-reset the assertion must pass unmodified; if it assumed seeded providers anywhere, that assumption is the bug, not the reset.

**Setup-window ordering (hard constraint):** stop → purge → start-with-window → POST setup on loopback ≤10 min. Deleting the credential row (or the whole DB) while the server runs with a closed window = lockout; the procedure never does that (server is stopped at purge time, window re-opens at boot because no credential exists).

---

## 6. Execution order, cost, boundaries, gates

**Atomic commits (each ends green — `tsc` 0 + `audit:ground-rules` 8/8 + targeted tests):**

1. `chore(reset): untrack failure artifacts + backup (git rm e2e-report test-results .data.bak; .gitignore additions)` — check-5 untouched, gate stays 8/8.
2. `chore(reset): delete dead scripts (D-5, D-7–D-13)` — scripts/ outside `src/` scans; gate unaffected. Prove `package.json` references none.
3. `chore(reset): delete dead RouteSwitch chain (D-1–D-4 + tests)` — engine/triage/providers untouched; run routeswitch suite.
4. `chore(reset): delete genesis bootstrap (D-6)` — verify no `GenesisBootstrapper` importer first; ScoutDaemon's staged-row contract (P8-1) untouched.
5. `chore(reset): delete orphan UI subtree (D-14/D-15 + DegradationEngine test)` — verify `main.tsx`/`OSLayout` build clean; run UI suite.
6. `chore(reset): purge live DB + rotate master key + clear workspaces` — stop-server procedure (§5.1-3), boot-verify (§5.5-7).
7. `docs(reset): runbook + this plan's follow-ups (OD resolutions, scrub ticket)`.

**Axiom 6 cost (edge-node budget):** each commit runs `tsc` + targeted vitest shard (not the full 83-file suite) with `NODE_OPTIONS=--max-old-space-size=512`, `UV_THREADPOOL_SIZE=3`, `--fileParallelism=false` (package.json test script already encodes this). Full suite + audit only on commits 5, 6, and final. Chokidar rules (P8-3) apply to any watcher started during verification — one watcher, `usePolling:false`, debounced.

**Module boundaries (non-negotiable):**

- ScoutDaemon never executes (P8-1): genesis deletion must not add any `executeRun` call anywhere; the profiler (`hardware-profiler.ts`, P8-5) is untouched.
- No `§VERIFY:` semantics change (P8-2); no chokidar change (P8-3); no provider `capabilities` change (P8-4 — `MockProvider` keeps its declared block).
- BaseVault owns the purge (file removal + `initDB`); CoreExec only reads post-boot rules; PortGrid only displays; RouteSwitch untouched except dead-chain deletion; `~/.neurosync` never touched.

**8/8 gate preservation:** checks at risk per commit: check-5 (seed wiring — commits 1/5 must not move `resources/global_okf_seed` or `global-seed.ts`; commit 4 must not remove the server-entry import of `bootstrapGlobalOKFSeed` — genesis.ts is NOT that import, verify the import lives in server entry per `audit-ground-rules.ts:320-324`); check-7 (allowlist — no entry removed, §3); check-3 (tests vs real DB — deletions only shrink surface). Run `npm run audit:ground-rules` after every commit; any red = stop, fix in same commit, never "fix forward".

---

## 7. Test plan for the Auditor

### Negative (must all pass — "no keys anywhere")

- N-1: `grep -rniE "***REMOVED-ANTHROPIC-KEY***|neurosync-e2e-operator-pw|BEGIN .*PRIVATE|api[_-]?key\s*[:=]\s*['\"][^'\"]{8,}" --include="*.ts" --include="*.tsx" --include="*.cjs" src/ scripts/ e2e/ index.html` → only S-4/S-5 documented fixtures.
- N-2: `git log --all -- .data.bak_20261001_104101/` post-scrub → no commits (history clean); `git ls-files | grep -E "^\.data|e2e-report|test-results"` → empty.
- N-3: `SELECT COUNT(*) FROM llm_providers` → 0; `SELECT key FROM system_settings WHERE key IN ('llm_api_key','operator_credential','bind_address')` → empty (pre-credential step); raw `strings .data/neurosync.db | grep -iE "***REMOVED-ANTHROPIC-KEY***|bearer"` → empty.
- N-4: `ls .data/` → only `neurosync.db workspaces .master.key`; `ls .data.bak*` → nonexistent; `.sync.secret` absent.
- N-5: `grep -rn "Benchmarker\|executeWithFallback\|CerebroAssistPipeline\|classifyComplexity\|bootstrapSkills\|HardwareProvider" src/ scripts/` → zero (except the retained `useHardwareTier` in its own file).

### Positive (must all pass)

- P-1: Stop → purge → boot from empty: server starts, schema has 38 tables, `sync_lock`=1, setup window open (`POST /api/auth/setup` → 200 on loopback, → 403 off-loopback).
- P-2: Seed re-indexes: `okf_nodes` GLOBAL ≈83 (source: 87 `.md` files; delta = indexer rejections — assert `> 75`, not exact), `okf_edges > 0`.
- P-3: Setup window works: fresh credential → login → 200; wrong password → 401; second setup → 404 (credential exists).
- P-4: No-provider UX: UI shows empty state; e2e Step 1 passes unmodified.
- P-5: Suite green: `tsc` 0, `audit:ground-rules` 8/8, vitest full suite (minus deleted files) green, e2e green with `NEUROSYNC_E2E_PASSWORD` set.

### Gate

- G-1: 8/8 audit + `tsc` 0 after EVERY §6 commit (not just final). Any red blocks the next commit.

---

## 8. Risks, rollback, deferred

| # | Risk | Mitigation / rollback |
|---|------|----------------------|
| R-1 | History scrub rewrites pushed `main` — collaborators' clones diverge | Announce + force-push window; provide `git fetch origin && git reset --hard origin/main` runbook line. Scrub is a separate operator-approved step AFTER all content commits land |
| R-2 | Real operator keys (S-1) already cloned via `.bak` commit | Rotation at the provider (FreeLLMAPI/OpenRouter dashboard) is mandatory and NOT covered by scrub; track as incident ticket |
| R-3 | `system-maintenance` project is code-created (not test residue) — purge breaks boot assumptions | OD-1: Executor greps for `system-maintenance` creation; if code-created, disposition flips to KEEP-row (delete only the 2 test projects) |
| R-4 | `.master.key` regeneration path missing → boot crash on missing key | OD-3: verify keygen code path pre-deletion; fallback = explicit generate step in reset script |
| R-5 | `test_tx` is schema (not test artifact) → DROP breaks `initDB` idempotency tests | OD-2: check `db.ts` schema for `test_tx`; if schema, PURGE-rows-only, keep table |
| R-6 | App-subtree deletion breaks an unknown importer (lazy `import()`, string reference) | Per-file proof includes `grep -rn "App\b" src/ index.html` + `tsc` + full UI suite before commit; rollback = revert single commit |
| R-7 | Lockout: credential purged with closed window | Procedure never purges a running server (§5 ordering); window re-opens on fresh boot by construction (no credential row) |
| R-8 | `~/.neurosync/user_okf` operator files contain keys | Out of scope (outside repo); runbook note for operator self-audit |

**Deferred (explicitly NOT in this reset):** provider re-onboarding UX improvements; e2e port unification (3742 vs 3743 is by design); `discovered_models` cache-warming; full-suite parallelization; `.env` rotation (no `.env` exists); localStorage token-Bound hardening.

---

## Open decisions (Executor: resolve before/within the listed commit; default given)

- **OD-1 (commit 6):** Is `system-maintenance` code-created? `grep -rn system-maintenance src/`. Default: PURGE all 3 projects; flip to keep-one if code-created.
- **OD-2 (commit 6):** Is `test_tx` in `db.ts` schema? Default: DROP. Flip to rows-only if schema.
- **OD-3 (commit 6):** `.master.key` auto-regeneration path — cite file:line. Default: auto (verify). Fallback: explicit generate step.
- **OD-4 (commit 2):** Reset helper `scripts/canonical-reset.ts` — keep as runbook artifact or delete after use? Default: DELETE (one-shot; the procedure in §5 is the durable artifact).
- **OD-5 (commit 5):** `DegradationEngine` real component vs test-only name (refs in `schema.ts`/`Statusline.tsx`) — REWRITE vs DELETE test. Default: DELETE unless component found.
- **OD-6 (post-6):** History-scrub tool (`filter-repo` vs BFG) + force-push window — operator approval required (R-1). Default: `filter-repo`, coordinated push.
- **OD-7 (commit 1):** Exact `.gitignore` lines (`.data.bak*/`, `e2e-report/`, `test-results/`, `playwright/.cache`) — verify no existing pattern covers them first.

## Deviations from the Explore inventory (summary)

1. `okf_nodes` grouping column is `tier`, not `scope` (§0.1). 2. Provider secret column is `api_key_encrypted`, not `api_key` (§0.1). 3. `discovered_models` has no `provider_id` — per-provider attribution unverifiable (§0.1). 4. Seed layout is 5 dirs / 87 recursive `.md`, not 87 flat files (§0.3). 5. Orphan `App.tsx` lives at `src/ui/App.tsx` and `main.tsx` boots `OSLayout`, making it *more* orphan than reported (§0.5). 6. `classifier.ts` is orphan but `dynamic-router.ts` is LIVE — the "router chain" splits (§0.5). 7. Check-7 allowlist entries are BOTH justified — `gitnexus-client` genuinely uses `child_process`; Explore's "matches nothing" is refuted with line cites (§0.5, §3). 8. `build_scopelogic.cjs` is 65K, not 66K (immaterial). 9. E2e default password is at `global-setup.ts:25`, not `:26` (§0.4).
