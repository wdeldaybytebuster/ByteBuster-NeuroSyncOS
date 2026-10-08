# THE ARCHITECT — Zero-Trust Security Remediation Plan (CRITICAL perimeter)

**Status:** PLAN ONLY — no source, config, or test file was modified in producing this document.
**Target repo:** `/home/williamdeldaymarketing/Projects/NeuroSyncMega` @ `d6e586996a146d8698e43c9a9ddae9f518083c22` (branch `main`)
**Scope:** The three CRITICAL findings (V1 arbitrary SQL via WebSocket, V2 bypassed authentication, V3 un-gated network fetch in CoreExec).
**Hardware envelope:** Axiom 6 edge node — i3-N305, 8 E-cores, **6.3–6.4 GiB RAM**, eMMC 5.1, `UV_THREADPOOL_SIZE=3`, `NODE_OPTIONS=--max-old-space-size=512`, earlyoom present. Every mechanism below carries an explicit memory/syscall/thread cost.
**Audience:** an Engineer (who must implement without re-deriving any decision) and an Auditor (who must be able to test every claim).

> **Method:** every line number in §0 was re-read from source during this session. Where the
> preceding audit was wrong, the correction is stated explicitly. Where a claim could not be
> reproduced, it is marked **REFUTED** or **NUANCED** rather than repeated.

---

## 0. Verification of findings

### V1 — Arbitrary SQL via WebSocket — **CONFIRMED (4 sites in `transport.ts`, 3 in `sync.ts`), with one scope correction**

#### Evidence A — `src/core/basevault/network/transport.ts` (live network path)

Zod gate — no table allowlist, no identifier validation, no payload shape check:

```ts
// transport.ts:8-13
export const SyncPacketSchema = z.object({
  type: z.enum(['SYNC_OFFER', 'SYNC_ANSWER', 'SYNC_DELTA']),
  lastSyncTimestamp: z.number().int(),
  deltas: z.array(SyncEventLogSchema).optional(),
});
// src/core/basevault/schema.ts:11-17
export const SyncEventLogSchema = z.object({
  id: z.number().int(),
  table_name: z.string(),                                   // ← unbounded
  action: z.enum(['INSERT', 'UPDATE', 'DELETE']),           // ← DELETE reachable
  timestamp: z.number().int(),
  payload: z.string(),                                      // ← JSON parsed at :151, keys used raw
});
```

The four interpolation sites (all inside `handleSyncDelta`, lines 140–192):

```ts
// transport.ts:159  (SELECT — identifier injection → arbitrary read)
const existing = db.prepare(`SELECT * FROM ${delta.table_name} WHERE id = ?`).get(payload.id)
// transport.ts:169  (UPDATE — identifier + column-name injection → arbitrary write)
db.prepare(`UPDATE ${delta.table_name} SET ${sets.join(', ')} WHERE id = ?`).run(...params);
// transport.ts:175  (INSERT OR REPLACE — identifier + column-name injection)
db.prepare(`INSERT OR REPLACE INTO ${delta.table_name} (${keys.join(', ')}) VALUES (${placeholders})`).run(...Object.values(payload));
// transport.ts:180  (DELETE — identifier injection)
db.prepare(`DELETE FROM ${delta.table_name} WHERE id = ?`).run(payload.id);
```

`keys`/`sets` are built at lines 164–166 and 173–174 from `Object.entries(payload)` — i.e. from
attacker-controlled JSON keys.

#### Evidence B — `src/core/basevault/sync.ts` (duplicate path)

```ts
// sync.ts:46
db.prepare(`INSERT INTO ${event.table_name} (${cols.join(', ')}) VALUES (${placeholders})`).run(...values);
// sync.ts:61
db.prepare(`UPDATE ${event.table_name} SET ${setClause} WHERE id = ?`).run(...values);
// sync.ts:64
db.prepare(`DELETE FROM ${event.table_name} WHERE id = ?`).run(payload.id);
```

**Correction to the prior audit ("sync.ts may be test-only"): it IS test-only — confirmed.**
A repo-wide grep (excluding `dist/`, `node_modules/`) returns exactly five non-definition hits:

| File | Uses |
|---|---|
| `src/core/basevault/sync.ts` | definitions |
| `src/core/basevault/sync.test.ts:3,31` | `generateDeltaPayload` only |
| `src/core/basevault/network/reconciliation.test.ts:3,4,65,69` | both functions |

`reconcileDeltaPayload` has **zero production importers**, and it is not in `dist/`. It is a
dead-but-loadable second writer. Recommended disposition: **delete it** (§2.1-C2), not patch it.

#### Evidence C — reachability (all verified)

* `server-main.ts:236-256` — `app.get('/api/sync', upgradeWebSocket(...))`, handler forwards raw
  frames to `transport.handleIncomingMessage(raw, peerId, ws)`. No auth on the frame path.
* `server-main.ts:258-269` — `POST /api/sync/manual` takes caller `{ip, port}` and calls
  `transport.connectToManualPeer(ip, Number(port))` with **no IP/port validation** (SSRF-shaped).
* `server-main.ts:28-35` — `new NodeTransport()`, `new MDNSDiscovery(3743)`,
  `mdnsDiscovery.on('peer-discovered', node => transport.connectToPeer(node))`, `mdnsDiscovery.start()`.
  All unconditional at module load → **the surface is always live, no config flag.**
* `mdns-discovery.ts:46-72` — any mDNS response carrying an SRV answer for
  `neurosync._webrtc._udp.local` is auto-trusted and emitted; `mdns-discovery.ts:75-82` re-queries
  every 5 s; `mdns-discovery.ts:26-44` answers every inbound query. **Auto-connect without consent.**
* `transport.ts:65-69` — a 1 s `setInterval` polls `sync_event_log` and broadcasts to all peers
  (started in the constructor, never cleared).
* Transport is plaintext `ws://` (`transport.ts:31`, `:212`) with the comment
  *"Simulates an E2EE connection over WebSocket or WebRTC Data Channels"* (`transport.ts:16`) —
  **it is neither encrypted nor authenticated.**

#### Evidence D — the true sync-eligible table set (derived from triggers, `db.ts:713-758`)

Only **three** triggers-pairs exist. They are the *only* producers of `sync_event_log` rows:

| Trigger (`db.ts`) | `table_name` written | Payload columns emitted |
|---|---|---|
| `sync_projects_insert` / `_update` (:713, :721) | `projects` | `id, name, created_at` |
| `sync_workflow_runs_insert` / `_update` (:729, :737) | `workflow_runs` | `id, project_id, status, dag_layout, track, created_at, completed_at` |
| `sync_tasks_insert` / `_update` (:745, :753) | `tasks` | `id, run_id, status` |

There are **no DELETE triggers**, so this codebase can never legitimately emit an `action='DELETE'`
delta. Triggers are guarded by `sync_lock` (`db.ts:714` et al., lock row created `:710`).

#### Blast radius (what an unauthenticated attacker can actually do)

Entry: (i) any LAN host that answers mDNS → the server auto-connects to it; (ii) any host reachable
via `POST /api/sync/manual` (unauthenticated); (iii) any direct connection to `ws://<victim>:3743/api/sync`.

1. **Arbitrary read-shape + arbitrary write to any table that has an `id` column.**
   Live DB inspection: 24 of 39 tables have an `id` column, including
   `projects`, `workflow_runs`, `tasks`, `dag_proposals`, `llm_providers`, `llm_routing_rules`,
   `os_todos`, `cerebro_memories_meta`, `council_decisions`, `okf_nodes`, `hardware_profiles`,
   `environment_rules`, `context_events`, `sync_event_log`.
   * `table_name='dag_proposals'` + payload `{id, project_id, proposal:'{"nodes":[…shell node…]}', confidence:0.9, status:'pending', created_at}` → injects a **pending DAG proposal into PortGrid's HITL queue**; a human approving it executes attacker-chosen work.
   * `table_name='projects'` + payload `{id, name, project_root_path:'/'}` → re-roots `CommandSandbox.resolveCwd` for that project.
   * `table_name='llm_providers'` (has `id`) → INSERT/UPDATE `config_json` to point provider traffic at an attacker endpoint (exfiltrates every subsequent prompt).
   * `table_name='environment_rules'` / `hardware_profiles` → rewrites `UV_THREADPOOL_SIZE`, `max_workers`, `local_llm_enabled` (Axiom 6 safeguards).
   * `DELETE FROM projects|workflow_runs|tasks WHERE id = ?` → data destruction.
2. **Stacked queries are NOT possible** — `better-sqlite3` rejects multi-statement strings
   (verified: *"The supplied SQL string contains more than one statement"*). So this is not a
   `DROP TABLE;` one-liner; it is a *semantic* injection.
3. **Derived-table injection still works for reads:** `table_name = "(SELECT key AS id, value FROM system_settings)"`
   produces `SELECT * FROM (SELECT key AS id, value FROM system_settings) WHERE id = ?` (verified parse OK).
   The read result stays server-side (see 5.), so it widens *what the merge can see*, not direct exfil.
4. **Accidental (not designed) protection:** tables *without* an `id` column (notably
   `system_settings`, whose PK is `key`) make the `SELECT * FROM … WHERE id = ?` at `:159` throw
   *before* the INSERT/UPDATE runs — the inner `try/catch` at `:184` swallows it. So
   `system_settings` is **not** currently writable through this path. This is luck, not a control,
   and it disappears the moment an attacker aliases `id` in a derived table.
5. **Exfiltration chain:** `POST /api/sync/manual` → server opens an outbound `ws://` to an
   attacker host → attacker replies with `SYNC_OFFER` → `handleSyncOffer` (`transport.ts:118-138`)
   returns **the entire local `sync_event_log`** to the attacker. Full project/workflow/task metadata
   disclosure, no credentials needed.
6. **Reflection/amplification:** every applied delta is re-inserted into the local log by the
   sync triggers (unless `sync_lock` is set), so a crafted delta is re-broadcast to *other* peers —
   one malicious peer poisons the whole mesh.

**Prior-audit line numbers for V1: correct** (`:159, :165, :169, :175, :180` in `transport.ts`;
`:46, :61, :64` in `sync.ts`; schema claims correct).

---

### V2 — Bypassed authentication — **CONFIRMED, and stronger than reported**

#### Evidence A — the single global middleware, `server-main.ts:41-80` (verbatim)

```ts
app.use('/*', async (c, next) => {
  const contentLength = c.req.header('content-length');
  if (contentLength && parseInt(contentLength, 10) > 64 * 1024) return c.json({ error: 'Payload Too Large' }, 413);

  const ip = c.req.header('x-forwarded-for') || '127.0.0.1';   // ← attacker-chosen key
  const now = Date.now();
  let limit = rateLimits.get(ip);
  if (!limit || limit.resetTime < now) limit = { count: 0, resetTime: now + 60000 };
  if (limit.count >= 120) return c.json({ error: 'Too Many Requests' }, 429);
  limit.count++;
  rateLimits.set(ip, limit);                                    // ← Map (:39) never pruned

  const path = c.req.path;
  if (path.startsWith('/health') || path.startsWith('/api/config')) return next();   // ← neither route exists

  if (!readiness.configured) return next();                     // ← auth off, by default

  const authHeader = c.req.header('Authorization');
  if (!authHeader) {
    if (path.startsWith('/api/')) return c.json({ error: 'Unauthorized' }, 401);
  }
  await next();                                                 // ← ANY Authorization value passes
});
```

Confirmed sub-findings:

* **(i) `readiness.configured` is an LLM side-effect.** `readiness.ts:4-12` =
  *"does `system_settings.llm_api_key` have a non-empty value"*.
  **Live-DB check performed during this session:** the row `system_settings.llm_api_key` **does not
  exist** (live keys are `aria_enforcement, autonomy, budget, … smart_tips` — 20 keys, no
  `llm_api_key`). Provider keys now live in `llm_providers.api_key_encrypted` instead.
  ⇒ **`readiness.configured === false` on this machine, so the middleware executes
  `return next()` unconditionally: authentication is currently 100 % disabled, on every route.**
  This is not "auth turns on once you configure an LLM" — the migration to `llm_providers`
  orphaned the flag, so auth never turns on at all.
* **(ii) Even if configured, the header value is never validated.** `if (!authHeader) {…}` then a
  fall-through to `await next()`. `Authorization: Bearer garbage` passes. Verified by reading —
  there is no other `authHeader` use in the file, and `grep -rn Authorization src/server` returns
  only this line.
* **(iii) Dead exemptions.** `path.startsWith('/health')` — the only `/health` route is
  `/api/cerebro/health` (`cerebro.ts:35`). `/api/config` does not exist anywhere.
* **(iv) Rate-limit key is `x-forwarded-for`,** i.e. fully attacker-controlled: an attacker rotates
  the header to bypass 120 req/min entirely, and a *no-header* client (every real client, since
  nothing here sits behind a proxy) collapses into a **single shared `127.0.0.1` bucket** — so one
  LAN attacker can 429-lock the operator's own UI. The `rateLimits` Map (`:39`) is never pruned →
  unbounded growth keyed by attacker-chosen strings (memory DoS).
* **(v) The 64 KB payload cap only inspects `content-length`.** A chunked request with no
  `content-length` header bypasses it entirely (multipart `/api/system/restore` included).

#### Evidence B — the orphaned real credential code

`src/core/basevault/auth.ts` (64 lines) implements Argon2id (`memoryCost 2^16` = 64 MiB,
`timeCost 3`, `parallelism 1`) and scrypt-derived AES-256-GCM key encryption.
**`grep -rn "AuthManager|basevault/auth" src` returns exactly one hit: its own definition. Zero importers. Confirmed orphaned.**
The crypto actually in use is `src/core/basevault/crypto.ts` (`encrypt`/`decrypt`, AES-256-GCM,
32-byte key read/created at `.data/.master.key`), used by `server-main.ts:276`, `llm.ts`,
`system.ts:10`.

#### Evidence C — binding, CORS, and the UI

* `server-main.ts:554-557` — `serve({ fetch: app.fetch, port })` with **no `hostname`**.
  `@hono/node-server` (`dist/index.mjs:1032`) calls `server.listen(options?.port ?? 3000, options.hostname)`;
  with `hostname === undefined` Node binds **all interfaces** (`0.0.0.0`/`::`). ⇒ LAN-reachable.
* `server-main.ts:26` — `app.use('/*', cors())`. Hono's default (`hono/dist/middleware/cors/index.js`)
  is `origin: "*"` with `allowHeaders: []` → it **reflects** whatever `Access-Control-Request-Headers`
  the browser asks for, and `allowMethods` includes `POST`. ⇒ **any web page in the operator's
  browser can issue cross-origin JSON/multipart POSTs to `http://localhost:3743/...` and *read the
  responses* (ACAO `*`, no credentials involved).** This is a drive-by, no-LAN-required vector.
* UI: **19 files** declare `const API = 'http://localhost:3743';`
  (`AgentKPIStrip, CerebroChatbot, DeveloperModeContext, GovernorUI, NotificationCenter, OKFMindmap,
  OKFWorkspaceWidget, PathBrowser, PreferencesContext, ProjectSwitcher, ScopeLogicChat,
  BaseVaultDashboard, CerebroDashboard, CoreExecDashboard, PortGridDashboard, ScopeLogicDashboard,
  ScoutDaemonDashboard, UnifiedMasterDashboard, RouteSwitchDashboard`); **24 files / 29 matches**
  contain `localhost:3743` (plus `Statusline.tsx:11` and `EmbeddedTerminal.tsx:6` hardcode full
  URLs). 11 call sites use relative `/api/...` (served by the Vite proxy).
* `src/ui/components/chat-backend-routing.test.ts:44,62` asserts
  `expect(src).not.toMatch(/Authorization['"]?\s*:/)` for `ScopeLogicChat.tsx` and
  `CerebroChatbot.tsx` — **any V2 design must not put a literal `Authorization:` header in those two files.**

#### Evidence D — the three WebSocket/SSE surfaces

| Surface | Where | Browser can set headers? |
|---|---|---|
| `GET /api/sync` (WS) | `server-main.ts:236-256` | Node `ws` client only (`transport.ts:31/212`) — yes, `headers` option |
| `GET /api/portgrid/terminal/:projectId` (WS) | `server-main.ts:178-234` | **No** (browser `WebSocket`) |
| `GET /api/system/metrics` (SSE) | `system.ts:65-89` | **No** (`EventSource`) |
| `GET /api/scout/events` (SSE) | `scoutdaemon/sse.ts:15` | **No** |
| `GET /api/system/backup` (SSE) | `system.ts:175-198` | **No** |
| `GET /api/telemetry/metrics` (Prometheus text) | `telemetry.ts:17` | n/a (plain GET) |

**Upgrade routing fact (verified in `@hono/node-ws/dist/index.js`):** `injectWebSocket(server)`
intercepts `server.on('upgrade')`, rebuilds the request, and calls `init.app.request(url, {headers}, env)`.
The full Hono middleware chain — including the global middleware at `server-main.ts:41` — **does run
for WS upgrades**. If the middleware short-circuits (401), no `CONNECTION_SYMBOL` is set and the
library replies `HTTP/1.1 401 … Connection: close` and destroys the socket.
⇒ **The auth middleware is structurally capable of gating all three WS/SSE surfaces — it just has
nothing to check today.** This is what makes the ticket design in §2.2 viable.

**Corollary the prior audit missed:** because the UI never sends `Authorization` and
`EventSource`/`WebSocket` cannot, the moment `readiness.configured` becomes true **the entire UI,
both WS endpoints and all three SSE streams would return 401**. The product is currently only
usable *because* auth is disabled. Any V2 fix must ship server + UI together (§3, commit C6).

#### Evidence E — exposed endpoints (unauthenticated *today*, verified)

| Route | File:line | Capability |
|---|---|---|
| `POST /api/cerebro/query` | `cerebro.ts:64-76` | arbitrary SQL string → `db.prepare(query).all()` |
| `POST /api/system/restore` | `system.ts:200-233` | overwrites `.data/neurosync.db`, then `process.exit(0)` at `:223` |
| `GET /api/portgrid/terminal/:projectId` | `server-main.ts:178-234` | interactive shell WS, filesystem-contained, **network deliberately OPEN** (`terminal-session.ts:19-30`) |
| `POST /api/system/browse-directory` | `system.ts:708-741` | arbitrary directory listing (`{path}` → `fs.readdirSync`) |
| `GET /api/system/settings` | `system.ts:107-131` | all `system_settings` incl. decrypted `llm_api_key` prefix |
| `GET /api/system/backup` | `system.ts:175-198` | writes `backup-<ts>.db` into `process.cwd()`, leaks path |
| `POST /api/llm/config`, `POST /api/llm/providers` | `llm.ts:60, 131` | read/write provider API keys (encrypted at rest, but attacker can *replace* them) |
| `POST /api/sync/manual` | `server-main.ts:258-269` | SSRF-shaped outbound WS + delta exfil (§0-V1) |
| `POST /api/routeswitch/provider` | `server-main.ts:427-447` | swap live LLM provider + key, bypassing governor/registry |
| `POST /api/system/settings` | `system.ts:133-…` | overwrite any `system_settings` row (incl. `tool_registry`, `agent_permissions`) |
| `POST /api/system/daemon/kill` / `/migrate` | `system.ts:241, 257` | park the daemon / re-run `initDB()` |
| `GET /api/telemetry/metrics` | `telemetry.ts:17` | process metrics |

**CRITICAL NUANCE the prior audit got WRONG — `/api/cerebro/query` is read-only, not "arbitrary SQL":**
the handler calls `stmt.all()` (`cerebro.ts:70`). `better-sqlite3` refuses non-SELECT statements at
`.all()` **before executing them** — verified empirically in this session:

```
all() on INSERT threw: This statement does not return data. Use run() instead   → rows: []
all() on DELETE threw: This statement does not return data. Use run() instead    → rows survived
all() on UPDATE threw: This statement does not return data…                      → values survived
CTAS / ATTACH via .all() → threw, schema unchanged
```

So the honest blast radius is **unauthenticated arbitrary READ of the whole DB** (including
`llm_providers.api_key_encrypted` ciphertexts, all memory content, all project paths) plus error-message
schema disclosure — **not** unauthenticated writes/DDL. Still CRITICAL, but the fix priority and the
test assertions must reflect "read", or the Auditor will write a test that passes for the wrong reason.
(Writes *are* reachable elsewhere: `POST /api/system/settings`, `POST /api/llm/providers`, V1.)

---

### V3 — Un-gated network fetch in CoreExec — **CONFIRMED, with four refinements and two file-path corrections**

#### Evidence A — fetch before the gate

```ts
// worker.ts:125-132   (inside executePlugin, plugin === 'okf_indexer')
if (!content && url) {
   try {
     const response = await fetch(url);        // ← :127
     content = await response.text();          // ← :128  (unbounded read)
   } catch (e: any) {
     return { status: 'error', … };
   }
}
```

```ts
// worker.ts:291-296   plugin dispatch
if (input.plugin) {
  const { CerebroVectorStore } = require('../memory/cerebro/vector');
  const { db: workerDb } = require('../basevault/db');
  const result = await executePlugin(input, projectId ?? null, workerDb, CerebroVectorStore);
  if (result) return result;                   // ← returns HERE, never reaches the gate
}
// worker.ts:298-310   permission enforcement (Phase 5)
if (directive.action === 'shell' || directive.action === 'scrape') {
  const gate = await checkActionPermission(projectId, directive.action);
  if (gate.blocked) return errEnvelope(gate.reason, taskId, directive.action);
}
```

**Confirmed:** the plugin path returns at `:295`, so `checkActionPermission` at `:306` is never
reached for any plugin node.

**Corrections / refinements to the prior audit's framing:**

1. **Wrong file path:** the scraper is `src/core/coreexec/scraping.ts`, **not**
   `src/core/portgrid/scraping.ts` (the latter does not exist; `glob src/**/*scrap*` returns
   `src/core/coreexec/scraping.ts` and `src/core/coreexec/python_scripts/scraper.py`).
2. **`permission_archetype` cannot currently block it — but not for the stated reason.** The live
   DB has `permission_archetype = NULL` for **all three** projects, and `permission-gate.ts:76`
   documents *"Permissive default: no archetype assigned → behave exactly as today"*. Also
   `DEFAULT_ARCHETYPES` (`permission-gate.ts:54-58`) ships `research_only: network: true` —
   the `network:false` case only exists if an operator hand-edits `agent_permissions`
   (`permission-gate.test.ts:75` does exactly that in tests). So the accurate statement is:
   **the gate is skipped for plugins entirely (`:291-296`), and even when it runs it is a documented
   fail-open no-op for un-archetyped projects (`:64, :76, :132-137`).**
3. **`system_settings.tool_registry` does not exist in the live DB** → `DEFAULT_TOOL_REGISTRY`
   (`permission-gate.ts:44-52`) applies, where `web_scrape: 'Active'`. The `'Disabled'` case is a
   configurable, not the current state. Same for `agent_permissions` (absent → defaults).
4. **`bwrap --unshare-net` genuinely does not apply here:** `fetch()` runs in the poolifier worker
   thread (`worker.ts:436` `export default new CoreExecWorker()`), not in a spawned process.
   Confirmed: `CommandSandbox` is only used in `case 'shell'` (`:376`) and inside `StealthScraper`
   (`scraping.ts:23`). Worker-thread `fetch` is unaffected by any bwrap flag.
5. **New:** `scoutdaemon/idle.ts:210-223` stages `okf_indexer` runs under project
   `system-maintenance` (archetype `NULL`) — so even after the gate is hoisted, the archetype
   layer would still no-op for the ScoutDaemon-originated plugin path. This is why §2.3 mandates a
   **non-bypassable EgressGate with unconditional controls**, not just a policy-gate move.
6. **Two phantom files, and a phantom column.** The prior audit located the gate at
   `src/core/basevault/permission-gate.ts` and cited a migration
   `src/core/basevault/migrations/20260928_coreexec_permission_scaffolding.ts:13` adding
   `gate_action TEXT DEFAULT 'observe'`. **None of the three exist:**
   * `find src -name permission-gate\*.ts` → only `src/core/coreexec/permission-gate.ts` (+ its test).
     BaseVault does not own the gate; CoreExec does. (Corrects the module attribution, not the finding.)
   * `find src -path '*migration*' -name '*.ts'` → **no migration directory anywhere in `src`**;
     `grep -rn gate_action src` → **zero hits**, and `PRAGMA table_info(tasks)` on the live DB →
     `id, run_id, status, claim_lease, output_data, retry_count, started_at, node_type` — no
     `gate_action`, no `permission_*` column at all.
   * Consequence **in our favour**: `GateAction` is a pure TypeScript union
     (`permission-gate.ts:41`), so widening it to include `'fetch'` (C8-b) needs **no schema change
     and no `ALTER`** — consistent with the "DB migration required: NONE" claim in §3. The gate's
     input is `directive.action` from the DAG node (`worker.ts:305`), not a stored column.

#### Evidence B — the `scrape` vs `--unshare-net` conflict (structurally real)

```ts
// portgrid/sandbox.ts:143  — ALWAYS passed, for every sandboxed command
spawn('bwrap', ['--unshare-net', '--dev-bind', '/', '/', rootCommand, ...parts.slice(1)], {…})
// coreexec/scraping.ts:20  — scrape is a sandboxed python3 invocation
const command = `python3 ${scriptPath} --url ${url}${headless ? ' --headless' : ''}`;
// coreexec/python_scripts/scraper.py:14-19 — live network fetch inside that sandbox
fetcher = StealthyFetcher(headless=headless, executable_path='/usr/bin/google-chrome-beta')
page = fetcher.get(url)
```

`python3` is on `ALLOWLIST` (`sandbox.ts:25`, comment: *"Authorized explicitly for Scrapling/Cloak
support"*). ⇒ **`scrape` cannot work as written**: the browser has no network. It fails closed (which
is safe) but is a non-functional feature. `sandbox.ts:143` must not be weakened — it is the control
that makes `shell` safe.

#### Evidence C — related egress paths

| Site | Live? | Note |
|---|---|---|
| `routeswitch/live-test.ts:49` `runTest()` at module scope | **DEAD** | `grep -rn "live-test" src package.json scripts` → only its own file + no npm script. Nothing imports it. It fires *if and only if* it is executed directly. The audit's "fires at import time" is true but **it is never imported**, so it is not live at boot. |
| `routeswitch/router.ts:9,34-46` `executeWithFallback` with `process.env.OPENROUTER_API_KEY` | **DEAD in prod** | importers: `live-test.ts:5`, `router.test.ts:2`. Bypasses provider registry, `FreeModeGovernor`, paid-tier lock, BaseVault encrypted key store. |
| `routeswitch/model-selector/cerebro-assist.ts:42-49` same pattern | **DEAD in prod** | importers: `cerebro-assist.test.ts` only. |
| `server-main.ts:547-552` `ModelDiscovery.fetchModels()` at boot | **LIVE** | unconditional `https://openrouter.ai/api/v1/models` on every start (also `discovery.ts:118` `https://opencode.ai/zen/v1/models`). Egress at boot with no kill switch. |
| `server/routes/system.ts:404-419` `probeMcpReachability` → `fetch(conn.url, {method:'HEAD'})` | **LIVE** | SSRF-shaped (operator-configured URL, unauthenticated today). |
| `memory/gitnexus-client.ts:128,205,230` | **LIVE** | loopback-only (`host:port` of a local eval server) + a `/shutdown` call. Legit local egress. |

**Blast radius:** an unauthenticated caller who can cause a DAG node to be created (direct DB write
via V1, `POST /api/system/proposals/stage`, or an LLM-authored `dag_layout` with `plugin:
'okf_indexer'`, `params.url`) gets **server-side SSRF with an unbounded response read**: internal
HTTP services (`http://127.0.0.1:3743/api/...`, cloud metadata `169.254.169.254`, LAN devices),
with the body written into `memory_quarantine` + an `os_todos` ticket (so the content is retrievable
later through Cerebro/OKF read paths). Secondary: `response.text()` is unbounded → a hostile URL
returning a multi-GB body OOMs a process capped at 512 MB V8 heap.

---

## 1. Threat model

| # | Adversary | Reach | Preconditions | Exploitability | Rank |
|---|---|---|---|---|---|
| T1 | **Drive-by browser page** (any website the operator visits) | `http://localhost:3743` from the operator's own browser | User visits a page; `cors()` = `origin:"*"` reflects `POST` + all headers | **Trivial** — `fetch('http://localhost:3743/api/cerebro/query', {method:'POST', body:...})`; ACAO `*` lets the page *read* the response. Can POST to `/api/system/settings`, `/api/llm/providers`, `/api/sync/manual`, and (JSON preflight succeeds) stage proposals. Multipart `/restore` also passes preflight. | **1** |
| T2 | **LAN host** (same L2/subnet) | TCP 3743 on all interfaces (no `hostname`), plus mDNS mesh | Nothing — surface is live at boot | **Trivial** — full V1 SQL injection via `ws://…/api/sync`, or auto-connect via spoofed mDNS; terminal WS; every HTTP endpoint. | **2** |
| T3 | **LAN host, no app bug** | mDNS presence + auto-connect (`server-main.ts:31-33`) | Spoof one mDNS response | **Trivial** — becomes a trusted sync peer, then T2. | **3** |
| T4 | **Authenticated-but-malicious / stolen token holder** | everything | V2 implemented; token theft (XSS — `csp: null` in `tauri.conf.json`) | Medium — post-V2 this is the residual risk. | 4 |
| T5 | **Local unprivileged process / other user on the box** | loopback after V2 bind-127.0.0.1 | local account | Medium — loopback still open; `.data/.master.key` is `0644` (world-readable). | 5 |
| T6 | **Remote/internet host** | nothing direct | operator would have to port-forward | Low, but **only because the OS firewall presumably blocks it** — the app itself binds `0.0.0.0`. | 6 |
| T7 | **Supply-chain / LLM-induced** (no network adversary) | `dag_layout` authored by an LLM or imported | a proposal is approved in PortGrid | Medium — `okf_indexer` URL / shell node content. This is the *non-network* path into V3. | — |

**Trust boundaries in force:** the app has **no credential of any kind**; the only real boundary
today is "can open a TCP connection to port 3743". CORS is the *only* thing standing between T1 and
the API, and it does not stop the request — only the response read, and only for preflighted ones.

**Assumed threat model for remediation (to be recorded in `SECURITY.md`):**
single-operator machine, local-first, zero-cloud. LAN is *untrusted*. Browser origins other than
our own UI are *untrusted*. Same-machine processes are *semi-trusted* (loopback-only bind + `.data`
file permissions are the boundary). **Confidentiality of sync traffic against a passive LAN sniffer
is explicitly accepted as a residual risk in v1 of this plan** (§2.1-C4 options) — integrity and
authenticity are not.

---

## 2. Zero-Trust remediation design

### 2.1 V1 — Arbitrary SQL via WebSocket

**Root cause (one sentence):** peer-controlled `table_name` and payload column keys are interpolated
into SQL identifiers because `SyncPacketSchema` validates only *types*, not *identities*, and no
peer is authenticated.

#### Files

| Action | Path | Function-level change |
|---|---|---|
| **CREATE** | `src/core/basevault/network/sync-policy.ts` | New pure module (no DB, no I/O): `SYNC_TABLES`, `SYNC_ACTIONS`, `parseDelta()`, `assertIdentifier()`. Unit-testable in isolation. |
| **MODIFY** | `src/core/basevault/network/transport.ts` | `handleSyncDelta()` rewritten to validate-then-template; new `private authenticatedPeers: Set<string>`; `handleIncomingMessage()` gains an auth-state branch; `connectToPeer()`/`connectToManualPeer()` perform a challenge–response before sending `SYNC_OFFER`; new `dispose()`; new `private stmtCache: Map<string, Statement>`. |
| **MODIFY** | `src/core/basevault/schema.ts` | `SyncEventLogSchema.table_name` → `z.string().min(1).max(64).regex(/^[A-Za-z0-9_]+$/)` (defense in depth; the authoritative check is `sync-policy.ts`). |
| **DELETE** | `src/core/basevault/sync.ts` | `reconcileDeltaPayload` (the duplicate unguarded writer) and `generateDeltaPayload` (a duplicate of the read in `transport.ts:75-81`). |
| **DELETE** | `src/core/basevault/sync.test.ts`, `src/core/basevault/network/reconciliation.test.ts` | Replaced **in the same commit** by `transport-sync-safety.test.ts` (§4). |
| **MODIFY** | `src/server/server-main.ts` | `:28-35` — do **not** auto-connect on `peer-discovered`; gate `mdnsDiscovery.start()` on `sync_enabled`; `:258-269` validate `ip`/`port` and require auth; add `POST /api/sync/peers` (approve/reject/list). |
| **MODIFY** | `src/core/basevault/network/mdns-discovery.ts` | `start()` no-ops (except a `console.log`) when sync is disabled; `stop()` clears the query interval (currently leaked at `:75`). |
| **CREATE** | `src/ui/views/PortGridSyncPeers.tsx` (or a section inside `PortGridDashboard.tsx`) | Pending/approved peer list with Approve/Reject (PortGrid consent boundary). |

#### Mechanism

**C1 — Table + column allowlists, parameterized statements, identifier validation.**

`sync-policy.ts` (exact content an Engineer can transcribe):

```ts
import { z } from 'zod';

/** Derived from db.ts:713-758 — the ONLY tables the sync triggers ever write. */
export const SYNC_TABLES = {
  projects:      ['id', 'name', 'created_at'],
  workflow_runs: ['id', 'project_id', 'status', 'dag_layout', 'track', 'created_at', 'completed_at'],
  tasks:         ['id', 'run_id', 'status'],
} as const;
export type SyncTable = keyof typeof SYNC_TABLES;

/** DELETE is never emitted by any trigger in db.ts (INSERT/UPDATE only) — refuse it. */
export const SYNC_ACTIONS = ['INSERT', 'UPDATE'] as const;
export type SyncAction = (typeof SYNC_ACTIONS)[number];

/** TEXT PKs in this codebase: UUIDs, slugs like 'system-maintenance', 'test-proj-1'. */
export const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_:.-]{0,127}$/;

/**
 * 'parked' is a real runtime status for BOTH tables (engine.ts:199, :256) even though
 * WorkflowRunSchema/TaskSchema omit it — validate against the superset actually written,
 * not against the Zod enums, or legitimate syncs get dropped.
 */
const RUN_STATUS = new Set(['pending','running','completed','failed','blocked-by-validation','parked']);
const TASK_STATUS = new Set(['unclaimed','claimed','completed','failed','blocked-by-validation','parked']);

const MAX_PAYLOAD_BYTES = 256 * 1024;   // dag_layout is the largest legal column
const MAX_AGE_MS = 30 * 24 * 3600 * 1000;
const MAX_FUTURE_MS = 60_000;

export type DeltaReject =
  | 'unknown-table' | 'unsupported-action' | 'unknown-column' | 'bad-id'
  | 'bad-status' | 'bad-timestamp' | 'payload-too-large' | 'bad-type';

export type ValidatedDelta = {
  table: SyncTable; action: SyncAction; timestamp: number;
  id: string; columns: string[]; values: unknown[];
  setSql: string;   // "col1 = ?, col2 = ?" built ONLY from allowlisted identifiers
  insertSql: string;// "(col1, col2) VALUES (?, ?)"
};

export function parseDelta(raw: unknown): { ok: true; delta: ValidatedDelta } | { ok: false; reason: DeltaReject } {
  if (raw === null || typeof raw !== 'object') return { ok: false, reason: 'bad-type' };
  const d = raw as Record<string, unknown>;
  if (typeof d.table_name !== 'string' || !(d.table_name in SYNC_TABLES)) return { ok: false, reason: 'unknown-table' };
  const table = d.table_name as SyncTable;
  if (typeof d.action !== 'string' || !(SYNC_ACTIONS as readonly string[]).includes(d.action)) return { ok: false, reason: 'unsupported-action' };
  const action = d.action as SyncAction;
  if (typeof d.timestamp !== 'number' || !Number.isFinite(d.timestamp)) return { ok: false, reason: 'bad-timestamp' };
  const now = Date.now();
  if (d.timestamp < now - MAX_AGE_MS || d.timestamp > now + MAX_FUTURE_MS) return { ok: false, reason: 'bad-timestamp' };
  if (typeof d.payload !== 'string' || d.payload.length > MAX_PAYLOAD_BYTES) return { ok: false, reason: 'payload-too-large' };

  let payload: unknown;
  try { payload = JSON.parse(d.payload); } catch { return { ok: false, reason: 'bad-type' }; }
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return { ok: false, reason: 'bad-type' };
  const p = payload as Record<string, unknown>;

  if (typeof p.id !== 'string' || !ID_RE.test(p.id)) return { ok: false, reason: 'bad-id' };

  const allowed = SYNC_TABLES[table] as readonly string[];
  const columns: string[] = [];
  const values: unknown[] = [];
  for (const [k, v] of Object.entries(p)) {
    if (!(allowed as readonly string[]).includes(k)) return { ok: false, reason: 'unknown-column' };
    if (v !== null && typeof v === 'object') return { ok: false, reason: 'bad-type' };   // only scalars
    if (k === 'status') {
      const set = table === 'tasks' ? TASK_STATUS : RUN_STATUS;
      if (typeof v !== 'string' || !set.has(v)) return { ok: false, reason: 'bad-status' };
    }
    if (k === 'created_at' || k === 'completed_at') {
      if (v !== null && (typeof v !== 'number' || !Number.isInteger(v))) return { ok: false, reason: 'bad-type' };
    }
    if ((k === 'name' || k === 'dag_layout' || k === 'project_id' || k === 'run_id') && typeof v !== 'string') {
      return { ok: false, reason: 'bad-type' };
    }
    columns.push(k); values.push(v);
  }
  if (columns.length === 0) return { ok: false, reason: 'bad-type' };
  if (action === 'UPDATE' && !columns.includes('id')) return { ok: false, reason: 'bad-id' };

  return { ok: true, delta: {
    table, action, timestamp: d.timestamp, id: p.id as string,
    columns, values,
    setSql: columns.map(c => `${c} = ?`).join(', '),
    insertSql: `(${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
  }};
}
```

`transport.ts` `handleSyncDelta` becomes:

```ts
private stmtCache = new Map<string, ReturnType<Database['prepare']>>();
private static MAX_CACHED_STMTS = 32;

private stmt(sql: string) {
  let s = this.stmtCache.get(sql);
  if (!s) {
    if (this.stmtCache.size >= NodeTransport.MAX_CACHED_STMTS) this.stmtCache.clear(); // simple bound, no LRU bookkeeping
    s = db.prepare(sql);
    this.stmtCache.set(sql, s);
  }
  return s;
}
```
…and for each delta: `const parsed = parseDelta(delta); if (!parsed.ok) { reject(reason); continue; }`
then the existing read-modify-write **semantics are preserved exactly** (see the comment currently at
`transport.ts:154-158` — a blind `INSERT OR REPLACE` would null out `tasks.output_data` /
`workflow_runs.dag_layout` on partial trigger payloads), but every SQL string now contains only
identifiers that were proven to be members of `SYNC_TABLES[table]`, and every *value* is a `?` binding.

Three statements are used in practice (per table × per distinct key-set — the key-set is one of a
handful of fixed trigger payloads, so the cache holds ~6–10 entries, not 32):

* `SELECT * FROM projects WHERE id = ?`
* `UPDATE projects SET name = ?, created_at = ? WHERE id = ?`
* `INSERT OR REPLACE INTO projects (id, name, created_at) VALUES (?, ?, ?)`

**Why template-literal + allowlist instead of "pure parameterization":** SQLite has no syntax for
binding an identifier. Validation *is* the fix; parameterization is retained for every value.
**Rejected alternative:** fully static per-table SQL with `COALESCE(?, col)` to preserve absent
columns — it cannot distinguish *"absent"* from *"explicit null"* (e.g. clearing
`workflow_runs.completed_at`), which would silently change merge semantics. Recorded as rejected.

**C2 — delete the duplicate writer.** One commit: delete `sync.ts` + its two test files + land
`transport-sync-safety.test.ts` covering the same invariants (existing-column preservation,
`sync_lock` released in `finally`, no reflection, rejects). `grep` output above proves nothing else
imports it. This satisfies "one path, one guard" without stripping any *behavior* (the behavior
moves to the tested transport path).

**C3 — peer authentication (challenge–response), plaintext verdict.**

* New file `.data/.sync.secret` — 32 random bytes, created with `fs.openSync(p, 'wx', 0o600)`.
  Shared across nodes by the operator (documented in `SECURITY.md`); fingerprint =
  `sha256(secret).slice(0,16)` displayed in PortGrid for pairing verification.
* **Handshake (server side, on WS open):** send
  `{type:'SYNC_CHALLENGE', nonce: randomBytes(16).toString('base64url')}`.
  Peer must reply within 5 000 ms with `{type:'SYNC_AUTH', nonce, mac: hmacSHA256(secret, nonce + '|' + peerId)}`.
  Verify with `crypto.timingSafeEqual` on equal-length buffers.
* **Enforcement point:** `handleIncomingMessage()` short-circuits to *only* accept `SYNC_AUTH`
  unless `peerId ∈ this.authenticated`. This is the closure of V1 independent of the SQL allowlist
  (defense in depth): an unauthenticated frame can never reach `handleSyncDelta`.
* `connectToPeer` / `connectToManualPeer` perform the same handshake as client **before** sending
  `SYNC_OFFER` (they currently send it in the `open` handler, `transport.ts:33-42`, `:229-235`).
* Failure: close with code `4401`; allow max 3 failed handshakes per peer per 5 min (small
  `Map<peerId, {fails, until}>`, ≤ 64 entries).
* **Plaintext `ws://` verdict: acceptable for v1, recorded as residual risk.** TLS would require a
  CA or TOFU certificate distribution over mDNS plus a new dependency — disproportionate on a
  zero-cloud edge box, and it would not address mDNS spoofing (which the HMAC does).
  **Optional hardening (V1-C6, droppable):** encrypt each `SYNC_DELTA` payload with AES-256-GCM
  using `crypto.scryptSync(secret, 'neurosync-sync-v1', 32)` — uses the already-imported `crypto`
  module, ~30 lines, +32 B nonce/tag overhead per message, ≈2 µs/message on AES-NI. Recommend doing it;
  it makes the `"Simulates an E2EE"` comment at `transport.ts:16` true and can be reverted alone.

**C4 — mDNS auto-discovery must not auto-connect (PortGrid consent boundary).**

* `system_settings.sync_enabled` (JSON `true|false`), **default `false`** (absent = false).
  With it false: `MDNSDiscovery.start()` does not answer queries and does not query
  (removes the 5 s beacon *and* the always-live accept path); `NodeTransport` still constructs but
  holds no connections.
* On `peer-discovered` **while enabled**: do *not* call `connectToPeer`. Instead push into a
  `pendingPeers: Map<nodeId, DiscoveredNode>` and `scoutEmitter.emit('PEER_DISCOVERED', node)` for
  PortGrid. Only `POST /api/sync/peers {ip, port, action:'approve'|'reject'}` (auth required) may
  call `transport.connectToPeer`.
* Approved list: `system_settings.sync_peers` = `[{ip, port, fingerprint, approvedAt}]`, hard cap 32
  entries (≈1.6 KB total).
* `POST /api/sync/manual`: require auth; `net.isIP(ip)` must be non-zero; `port` integer 1–65535;
  default-deny non-RFC1918/non-link-local targets unless `system_settings.sync_allow_public` is true;
  the target is appended to `sync_peers` (so "manual pairing" and "consent" are the same list).
  This closes the §0-V1-5 exfiltration chain.

**Module-boundary compliance (V1):**
* All SQL lives in BaseVault (`basevault/network/*`) — BaseVault *stores and protects data*; the
  sync writer is data-replication, i.e. storage-layer concern, and it performs **no** workflow logic
  and **no** outbound communication decision (connection policy is applied by the caller).
* **PortGrid** gains the Approve/Reject peer UI → *"requests permission and displays data"* — exactly
  its boundary; consent is no longer implicit.
* **ScoutDaemon** only *emits* `PEER_DISCOVERED`; it never connects (Rule P8-1 spirit: the watcher
  never triggers execution/connection).
* **RouteSwitch is untouched** — note honestly: sync peer traffic is arguably *RouteSwitch's*
  egress domain. Today `NodeTransport` lives in BaseVault, which is a **pre-existing boundary
  smell**. Moving it is a large refactor; **recorded as deferred** (§5-19) rather than folded into
  a CRITICAL fix.

**Hardware / Axiom 6 cost (V1):**

| Item | Cost |
|---|---|
| `sync-policy.ts` module | ~4 KB source; at runtime a frozen object (3 arrays ≈ 300 B) + per-delta allocation of one result object (~300 B, GC'd immediately) |
| Statement cache | ≤ 32 × (better-sqlite3 `Statement` ≈ 1–4 KB) = **≤ 128 KB worst case, typically ~40 KB** (≈10 entries). Map clear on overflow, no timer. |
| Rejected-delta path | 1 object alloc + 1 `console.warn`; **no SQL prepared at all** (validation precedes `db.prepare`) → *fewer* `sqlite3_prepare_v2` calls than today on hostile traffic |
| HMAC handshake | 1 × HMAC-SHA256 (≈1 µs), 2 messages ≤ 200 B, 16 B nonce + 1 boolean per peer |
| AES-GCM envelope (optional) | ≈2 µs/msg, +32 B/msg |
| mDNS consent maps | ≤ 32 peers + ≤ 32 pending ≈ **~3 KB** |
| New threads | **0** |
| New npm dependencies | **0** (`node:crypto`, `node:net`, existing `ws`, existing `zod`) |
| eMMC writes | `.data/.sync.secret` written **once** (32 B); `sync_peers`/`sync_enabled` written only on operator action |

---

### 2.2 V2 — Bypassed authentication

**Root cause (one sentence):** there is no credential to check — the gate keys off an orphaned LLM
setting and never inspects the `Authorization` value — so every route is anonymous.

#### Explicit resolution of the eight design questions

**(a) First-run bootstrap — no user table exists.**
There is no account table and creating one needs a migration the project doesn't have.
**Decision:** reuse the existing `system_settings` table (key/value, already present at
`db.ts:334-337`) with three keys:

| key | value |
|---|---|
| `operator_credential` | Argon2id hash string from `AuthManager.hashPassword` |
| `auth_setup_expires_at` | epoch ms of the boot-time setup window |
| `auth_sessions_persistent` | `true` (opt-in: persist nothing — sessions stay in RAM) |

* `POST /api/auth/setup {password}` is accepted **iff** (1) `operator_credential` absent, (2) request
  source is loopback, (3) `Date.now() < auth_setup_expires_at` (set to boot time + 10 min, or
  indefinite when `NEUROSYNC_AUTH_SETUP=1`), (4) `bind_address` is loopback.
  On success: write the hash, set `auth_setup_expires_at = 0`, the route returns 404 forever after.
* Password policy: ≥ 12 chars (checked with a simple length test — no new dependency).
* Why loopback + time window: closes the *LAN race to claim an unclaimed box* (T2/T3) while never
  locking the operator out (they are, by definition, on the box). Why not a generated token printed
  to stdout: it lands in `ui.log`/`server.log` (both exist in the repo root) and in journal output.

**(b) Token/session vs API-key — what the browser stores.**
**Decision: opaque random session token, server-side in RAM.**
* `createSession()` → 32 random bytes, base64url (43 chars), stored in
  `Map<tokenHash, {createdAt, lastSeen}>` where `tokenHash = sha256(token)` (so a heap dump / log
  line never exposes a usable token). TTL 12 h sliding, hard cap **16 sessions**, oldest evicted.
* Transport: `Authorization: Bearer <token>`.
* Browser: `localStorage['neurosync.session']` + `GET /api/auth/session` on boot to validate;
  `AuthGate.tsx` shows a login overlay on 401. `localStorage` over `sessionStorage` because the
  product is a single-page dashboard frequently reloaded; the 12 h TTL bounds the theft window.
* **No DB migration** (sessions are ephemeral by design; losing them on restart just means one
  re-login). If persistence is ever wanted, add via `initDB()`'s try/catch `CREATE TABLE IF NOT EXISTS`
  pattern — not part of this plan.

**(c) How SSE + the three WS surfaces authenticate.**
**Decision: short-lived query-string ticket** (because `EventSource` and browser `WebSocket` cannot
set headers, and `SameSite` cookies cannot be sent from the Tauri origin to `http://localhost:3743`
without HTTPS).

* `POST /api/auth/ticket` (Bearer-authenticated) → `{ ticket, expiresIn: 30 }`; server stores
  `Map<ticketHash, {sessionHash, expiresAt, uses}>`, TTL **30 s**, max **64** entries, `uses` cap **10**
  (non-consuming on use so `EventSource`'s automatic reconnect within the TTL still works; the cap
  bounds replay). Pruned on every `issue()`/`verify()` sweep (expired entries deleted) — no timer.
* Client flow: fetch a ticket → immediately open
  `new EventSource(`${API}/api/system/metrics?ticket=${t}`)` or
  `new WebSocket(`${WS_BASE}/api/portgrid/terminal/${id}?ticket=${t}`)`.
  On `EventSource.onerror`, re-fetch a ticket and reopen (a `retry()` helper in `lib/api.ts`).
* Server: `authMiddleware` accepts `?ticket=` **only** on the allowlisted stream paths
  `{/api/system/metrics, /api/system/backup, /api/scout/events, /api/portgrid/terminal/*}` and
  consumes the `uses` budget. Everywhere else `?ticket=` is ignored (prevents a leaked URL from
  being a general bearer).
* `GET /api/sync` (Node↔Node) does **not** use tickets — it uses the V1 HMAC sync secret (§2.1-C3).
  Two different credentials for two different trust relationships: *operator's browser* vs *peer machine*.

**(d) Where does auth live?**
**Decision: new server-layer module `src/server/auth/` — NOT BaseVault, NOT PortGrid, NOT RouteSwitch.**

| File | Contents |
|---|---|
| `src/server/auth/credentials.ts` | **absorbs `src/core/basevault/auth.ts`** (the orphan) — `hashPassword`, `verifyPassword`, `isSetupComplete`, `completeSetup`, plus the serialized-verify mutex |
| `src/server/auth/sessions.ts` | `createSession/verifySession/revokeSession`, `createTicket/verifyTicket`, prune-on-access |
| `src/server/auth/middleware.ts` | `export const authMiddleware` — the replacement for `server-main.ts:41-80` |
| `src/server/auth/routes.ts` | `/api/auth/setup`, `/login`, `/logout`, `/session`, `/ticket` |
| *(delete)* `src/core/basevault/auth.ts` | moved, not duplicated |

Justification against AGENTS.md: **BaseVault "must NEVER process logic, run workflows, or
communicate with the outside world"** — authentication is logic *and* it is the inbound network
perimeter, so it cannot live in BaseVault (this is precisely why the orphan sat unused).
**PortGrid** "requests permission and displays data; it never executes background logic" — it may
*render* the login/pairing UI, never *enforce*. **RouteSwitch** is the *egress* gateway; inbound
auth is not its domain. AGENTS.md enumerates eight modules and assigns none of them auth;
introducing a **server-layer** (not a ninth module) crosses no listed boundary, and BaseVault keeps
only `crypto.ts` (symmetric protection of data at rest = "stores and protects data", in-boundary).

**(e) `readiness.configured` gate removal.**
Delete `server-main.ts:67-69` entirely and the import at `:16`. Delete `readiness.ts` (its only
importer is `server-main.ts` — verified by grep). Auth state is now derived from exactly one thing:
`system_settings.operator_credential` exists. Also delete the dead exemptions at `:63`
(`/health` and `/api/config` are not routes).

**(f) Bind address + CORS (with the dev-mode reality resolved).**

```ts
// server-main.ts:554
const bindAddress = process.env.NEUROSYNC_BIND || dbSetting('bind_address') || '127.0.0.1';
const server = serve({ fetch: app.fetch, port: 3743, hostname: bindAddress });
```

**How dev mode actually connects (verified):**
* Vite serves the UI on **3742** (`vite.config.ts:7`) and proxies `/api` → 3743 (`vite.config.ts:9`).
* 19 UI files bypass the proxy with absolute `http://localhost:3743` → **cross-origin**
  (origin `http://localhost:3742`).
* 11 relative `/api/...` call sites go through the proxy → also arrive with origin `http://localhost:3742`.
* Production: Hono serves `dist/ui` itself (`server-main.ts:101-104`) on 3743 → **same-origin**.
* Tauri: `tauri.conf.json` `frontendDist: "../dist/ui"` → the shell loads the UI from
  `tauri://localhost` (Tauri v3 on Linux) and talks to `http://localhost:3743` → **cross-origin**.
* `tauri.conf.json` `devUrl: "http://localhost:5173"` while Vite runs on **3742**, and
  `beforeDevCommand: "npm run dev"` references an npm script that **does not exist**
  (`package.json` has `dev:ui`, `dev:server`, no `dev`) ⇒ **`tauri dev` is broken today** (deferred,
  §5-6). Allow-list `http://localhost:5173` anyway so it works the moment that is fixed.

CORS policy (replaces `cors()` at `:26`):

```ts
const ALLOWED_ORIGINS = new Set([
  'http://localhost:3742', 'http://127.0.0.1:3742',   // Vite dev
  'http://localhost:3743', 'http://127.0.0.1:3743',   // Hono static UI
  'http://localhost:5173', 'http://127.0.0.1:5173',   // tauri dev devUrl (currently broken)
  'tauri://localhost',                                 // Tauri v3 Linux/macOS shell
  'http://tauri.localhost',                            // Tauri v3 Windows shell
]);
app.use('/*', cors({
  origin: (o) => (ALLOWED_ORIGINS.has(o) ? o : null),   // no origin (same-origin, curl) → no ACAO header
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
  credentials: false,                                   // Bearer, not cookies → no credentialed CORS
  maxAge: 600,
}));
```

This is what closes **T1**: a random web page's origin is not in the set → no `Access-Control-Allow-Origin`
→ its preflighted JSON POST is refused, and simple requests cannot read the response.
Combined with `hostname: '127.0.0.1'`, **T2/T3/T6 close at the same commit** — before any auth work
lands (§3 guarantees "never less secure").

**(g) Rate-limit Map pruning.**

```ts
// key: real peer address, NOT x-forwarded-for
const ip = TRUST_PROXY && c.req.header('x-forwarded-for')?.split(',')[0]?.trim()
        || (c.env?.incoming?.socket?.remoteAddress ?? 'unknown');
// bound the map: sweep expired entries when it grows past 1024
if (rateLimits.size > 1024) { for (const [k, v] of rateLimits) if (v.resetTime < now) rateLimits.delete(k); }
```
`TRUST_PROXY` = `process.env.NEUROSYNC_TRUST_PROXY === '1'` (default off — nothing here sits behind
a proxy). Memory: ≤ 1024 entries × ~100 B ≈ **≤ 100 KB**, hard-bounded; zero timers, one O(n) sweep
that runs at most once per 1024 new keys. This also fixes the "all no-header clients share one
bucket → LAN attacker 429-locks the operator" bug.

**(h) Argon2id memory cost vs the 6.4 GiB envelope.**

* `memoryCost: 2^16` = **64 MiB per verification**, `timeCost 3`, `parallelism 1`
  (`auth.ts:13-15`). Argon2 allocates **native** memory — the `--max-old-space-size=512` guard does
  **not** bound it. 8 concurrent verifies = 512 MiB RSS spike on a 6.3 GiB box running earlyoom.
* **Decision: keep 64 MiB (OWASP floor for Argon2id is 19 MiB; 64 MiB is comfortably above) and
  serialize verification** behind a single promise-chain mutex in `credentials.ts`:

  ```ts
  let chain: Promise<void> = Promise.resolve();
  export function verifyOperator(pw: string): Promise<boolean> {
    const run = chain.then(async () => argon2.verify(hash, pw)).then(r => r, () => false);
    chain = run.then(() => {}, () => {});
    return run;
  }
  ```
  ⇒ **peak native Argon2 RSS is exactly 1 × 64 MiB regardless of concurrent logins**; added latency
  under contention is +~150–300 ms per queued attempt, which is irrelevant for a human login.
  A second layer (the rate limiter, 120 req/min/IP) bounds the queue itself.
* `parallelism: 1` → 1 native thread, **not** the UV pool ⇒ no interaction with
  `UV_THREADPOOL_SIZE=3`. No new threads.
* **Packaging safety:** `argon2` is already in `ESBUILD_EXTERNALS` (`scripts/build-sidecar.js:66-73`),
  so the packaged sidecar `require`s the real addon. Still, `credentials.ts` must **lazy
  `import('argon2')`** and fall back to `crypto.scrypt` (`N=2^15, r=8, p=1` = 32 MiB, built-in) if the
  addon fails to load — a packaged-sidecar crash on login would be worse than a weaker KDF. The KDF
  choice stays behind one `hashCredential`/`verifyCredential` pair so it is swappable without
  touching the middleware.
* Alternative considered and rejected: lowering to `memoryCost: 2^15` immediately — it solves a
  problem the mutex already solves, at a security cost. Keep it documented as the escape hatch if
  measured RSS proves uncomfortable.

**(i) Backward compatibility — operator upgrading an existing `.data/neurosync.db` with no credentials.**

**Decision: fail-closed for the network, fail-open for the local human.** Zero migration.

| Condition | Behaviour after the change |
|---|---|
| `operator_credential` absent **and** request from loopback | static UI + `/`, `/api/auth/setup`, `/api/auth/login` allowed; **every other API → 401** with `{error:'setup-required'}` |
| `operator_credential` absent **and** request from non-loopback | **403 for everything**, including static UI (and moot anyway, because the bind is `127.0.0.1`) |
| `operator_credential` present | normal `Bearer`/`ticket` flow; setup route permanently 404 |

What this means for the operator: they open the local UI, see `AuthGate`'s setup screen, choose a
password, and continue. **Nothing manual, no migration, no lock-out** (loopback is always reachable).
What it means for an attacker: from commit C5 onward they have nothing to reach.

Breakage inventory (must be handled in the same commit or immediately after):
* **e2e Playwright** (`e2e/lifecycle-audit.spec.ts`, `e2e/omni-audit.spec.ts`) drive the browser at
  `http://localhost:3743` → will 401. Fix: a Playwright `globalSetup` that calls
  `POST /api/auth/setup` (loopback, box-local) and injects the token via `context.addInitScript`,
  **or** run the suite with `NEUROSYNC_AUTH_SETUP=1` + a seeded credential. Must be decided in C6.
* **vitest route tests** call `router.request(...)` directly on sub-routers (`cerebro.test.ts:16`)
  and therefore **bypass the global middleware entirely** → unaffected.
* Any operator script/curl hitting the API → 401 until paired. Intended; document in `SECURITY.md`.

**Module-boundary compliance (V2):**
* Enforcement lives in `src/server/*` → satisfies *"BaseVault … never process logic / never
  communicate with the outside world"* and *"ScopeLogic/Cerebro … never takes real-world action"*.
* The UI's setup/login flow is a **consent** surface → may be rendered by PortGrid (its "Consent,
  Visibility, Control" role) without PortGrid ever executing the check.
* RouteSwitch untouched by auth (it remains purely the egress gateway).
* No module gains a new responsibility; one orphaned file moves out of BaseVault.

**Hardware / Axiom 6 cost (V2):**

| Item | Cost |
|---|---|
| Session map | ≤ 16 × (43-char key hash 64 B + 2 numbers) ≈ **≤ 3 KB** |
| Ticket map | ≤ 64 × ~120 B ≈ **≤ 8 KB**, pruned on access, no timer |
| Rate-limit map | ≤ 1024 × ~100 B ≈ **≤ 100 KB** (bounded, was unbounded) |
| Argon2id | **64 MiB native, 1 at a time** (serialized) — the single largest cost in the plan; explicitly bounded |
| Session token | 32 B + sha256 per request ≈ **0.5 µs** |
| Ticket verify | 1 sha256 + Map lookup ≈ **0.3 µs** per stream open |
| New threads / timers | **0** (all pruning is on-access) |
| New npm dependencies | **0** (`argon2` already in `dependencies`) |
| DB migration | **none** (`system_settings` reused) |
| eMMC writes | 1 × ~80 B (credential hash) at setup; sessions/tickets are RAM-only |
| Extra syscalls | 1 file-exists check for the credential (cacheable in a module-level `boolean` after first read) |

---

### 2.3 V3 — Un-gated network fetch in CoreExec

**Root cause (one sentence):** `executePlugin` is dispatched and returns *before* the permission gate,
and the `fetch` it performs is a raw worker-thread call that no layer of the system governs.

#### Decision: where does worker-thread egress live?

**Decision: a narrow `egressFetch()` inside RouteSwitch — `src/core/routeswitch/egress.ts`.**
*AGENTS.md* makes **RouteSwitch** *"the designated egress gateway … routes traffic and translates
signals; it never stores memory or executes the user's project logic."* `egressFetch` does exactly
that: it *translates a request into a wire call* and hands bytes back to the caller; it stores
nothing and decides nothing about project execution. Introducing a 9th `EgressGate` module would
either duplicate RouteSwitch's stated role or create a boundary AGENTS.md does not define.
**Rejected alternative:** a standalone `EgressGate` module (would become an unlisted 9th module).
**Rejected alternative:** routing plugin fetches through `RouteSwitchEngine.execute()` (category
error — it is an LLM-call orchestrator, not an HTTP client).

The worker already bundles RouteSwitch today (`worker.ts:7` imports `RouteSwitchEngine`,
`worker.ts:62,175` instantiate it), so importing `egress.ts` in `worker.ts` adds **no new wiring and
no new bundle weight**.

#### Mechanism

**C8-a — `src/core/routeswitch/egress.ts` (new).**

```ts
export type EgressAction = 'fetch' | 'scrape' | 'shell';      // re-exported from permission-gate
export interface EgressContext { projectId?: string | null; action: EgressAction; owner: string; }
export interface EgressOptions {
  timeoutMs?: number;          // default 15000
  maxBytes?: number;           // default 2_000_000  — BOUND, replaces unbounded response.text()
  internal?: boolean;          // loopback-only callers (gitnexus-client)
  allowPrivate?: boolean;      // operator opt-in (MCP probe with conn.allowPrivate)
}
export interface EgressResult { ok: boolean; status: number; text: string; bytes: number; blocked?: string; }

export async function egressFetch(rawUrl: string, opts: EgressOptions, ctx: EgressContext): Promise<EgressResult>
```

Ordered, non-bypassable checks (the first four are **unconditional** — they do not depend on
`permission_archetype`, because §0-V3-A5 showed that layer is a fail-open no-op for
`system-maintenance` and every un-archetyped project):

1. **Parse** with `new URL(rawUrl)` → on throw, `blocked:'bad-url'`.
2. **Scheme** ∈ `{http:, https:}` (plus `{http:, https:}` restricted to loopback when `internal`);
   anything else (`file:`, `data:`, `gopher:`, `ftp:`) → `blocked:'scheme'`.
3. **Kill switch:** `system_settings.external_calls_enabled` — the key **already exists in the live
   DB and is read by nothing today**; adopt it here. Absent → allow (preserves current behaviour);
   `'false'`/`'0'` → block every non-`internal` request.
4. **Private-address deny:** `dns.promises.lookup(hostname)` then reject `10/8, 172.16/12,
   192.168/16, 127/8, 169.254/16, 0.0.0.0/8, ::1, fc00::/7, fe80::/10` unless `internal` or
   `allowPrivate`. (DNS-rebinding TOCTOU between lookup and connect is an accepted residual risk —
   it requires the attacker to already control the host's DNS; recorded in §5.)
5. **Policy:** `checkActionPermission(ctx.projectId, ctx.action)` — extended with `'fetch'` (below).
   Preserves the documented fail-open contract for `shell`/`scrape`/`fetch` when no archetype is set.
6. **Fetch** with `AbortSignal.timeout(opts.timeoutMs)` and a **byte-counting reader**:
   ```ts
   const reader = response.body!.getReader();
   const chunks: Uint8Array[] = []; let bytes = 0;
   for (;;) {
     const { done, value } = await reader.read();
     if (done) break;
     bytes += value.byteLength;
     if (bytes > maxBytes) { await reader.cancel(); return { ok:false, status:response.status, text:'', bytes, blocked:'too-large' }; }
     chunks.push(value);
   }
   ```
   This is the fix for the unbounded `response.text()` OOM risk on a 512 MB heap.

**C8-b — `permission-gate.ts`: extend `GateAction`.**

```ts
export type GateAction = 'shell' | 'scrape' | 'fetch';
// :117  } else {   →   } else if (action === 'scrape') {
// NEW:  } else {   // action === 'fetch'  — same rule as scrape: web_scrape tool + archetype.network
```
`fetch` is treated as a network action, identical to `scrape` (both check
`tool_registry.web_scrape !== 'Disabled'` and `archetype.network`). `checkActionPermission`'s
signature, fail-open contract, lazy `import('../basevault/db.js')` and its existing tests are
unchanged — only the union grows.

**C8-c — `worker.ts`: hoist the gate above plugin dispatch, and route the fetch.**

Replace `worker.ts:291-310` with an explicit, commented ordering block:

```ts
// ── Zero-Trust ordering: policy gate BEFORE any dispatch, plugins included ──
// (was: plugins dispatched at :291 and returned at :295, never reaching the gate at :305)
const pluginNeedsNetwork =
  input.plugin === 'okf_indexer' &&
  !input.params?.files && !input.params?.mockContent && !!input.params?.url;

const gateAction: GateAction | null =
  pluginNeedsNetwork ? 'fetch'
  : (directive.action === 'shell' || directive.action === 'scrape') ? directive.action
  : null;

if (gateAction) {
  const gate = await checkActionPermission(projectId, gateAction);
  if (gate.blocked) return errEnvelope(gate.reason, taskId, gateAction);
}

if (input.plugin) {
  … existing executePlugin call …
}
switch (directive.action) { … }
```

Extract `resolveGateAction(input, directive): GateAction | null` as an **exported pure function** so
the ordering is unit-testable without spinning worker threads (see §4).

Inside `executePlugin`, `worker.ts:125-132` becomes:

```ts
if (!content && url) {
  const res = await egressFetch(url, { timeoutMs: 15_000, maxBytes: 2_000_000 },
                                { projectId, action: 'fetch', owner: 'coreexec/okf_indexer' });
  if (!res.ok) return { status:'error', action:'generic', error: res.blocked
      ? `Egress blocked (${res.blocked}) for ${url}` : `Failed to fetch URL: HTTP ${res.status}`, taskId, … };
  content = res.text;
}
```

**C8-d — `scrape` must be able to work under Zero-Trust.**
`CommandSandbox`'s `--unshare-net` (`sandbox.ts:143`) is *the control that makes `shell` safe* and
must not be weakened. Therefore the browser-based scraper cannot run inside it.

**Decision: two backends, selected by `system_settings.scrape_backend`, default `'http'`.**

* `'http'` (default) → `StealthScraper.scrape()` calls `egressFetch(url, {action:'scrape'})` and
  returns the **same object shape** `scraper.py` prints (`{status, url, title?, content_length, preview}`
  — `scraper.py:25-31`), so `worker.ts:386-398`'s `typeof result === 'string' ? … : result?.markdown`
  handling and any consumer stay byte-compatible. `scrape` now actually returns content instead of
  dying inside a network-less bwrap.
* `'browser'` → the existing `StealthScraper` path (`python3 … scraper.py`) is invoked unchanged.
  Documented in code as *"expected to fail under `--unshare-net`; requires an operator-approved
  network-enabled sandbox, which is intentionally not offered today"*.
* Nothing is deleted (`No Silent Stripping`); `ALLOWLIST` keeps `python3` (`sandbox.ts:25`) and
  `scraper.py` stays. Removal of the browser backend is recorded as a **deferred decision** (§5-9).

**C9 — the remaining egress sites.**

| Site | Change |
|---|---|
| `server-main.ts:547-552` boot model discovery | wrap in `egressFetch(..., {owner:'boot-discovery', timeoutMs:5000, maxBytes:1_000_000})`; **skip entirely when the kill switch is off** (kills unconditional boot-time egress + speeds boot on eMMC) |
| `router.ts:34-46`, `cerebro-assist.ts:42-49` | route their `fetch` through `egressFetch(..., {allowPrivate:false})` (≈4-line diff each) **and** mark both `@deprecated dead code — do not import; kept for tests`. No deletion (documented, deliberate). |
| `gitnexus-client.ts:128,205,230` | `egressFetch(..., {internal:true})` (loopback-only; keeps the eval-server bridge and `/shutdown` working) |
| `live-test.ts` | **move** to `scripts/live-test.ts` and gate `runTest()` behind `process.env.NEurOSYNC_LIVE_TEST === '1'`. Grep proves zero importers, so the move is safe; the gate makes accidental execution impossible even from a stray `tsx` invocation. |
| `system.ts:410` MCP probe | **deferred** (§5-3): once V2 lands it is auth-gated and operator-configured. Add `allowPrivate` plumbing now so the follow-up is a one-liner. |

**Module-boundary compliance (V3):**
* Egress physically owned by **RouteSwitch** → satisfies *"RouteSwitch … the designated egress gateway"*.
* **CoreExec** still only *acts*; it asks for permission and receives bytes — it does not decide
  what is reachable (the decision moved out of its worker).
* **PortGrid** unchanged: it still owns the consent *surface* (`tool_registry`, archetypes are edited
  through its UI) and the HITL queue; `permission-gate.ts` is read-only policy.
* **ScoutDaemon** (Rule P8-1) untouched: it still only writes `pending` rows; its `okf_indexer`
  staging path is now gated like everything else, without ScoutDaemon ever calling execution.
* **BaseVault** gains nothing and loses nothing (no egress, no auth).

**Hardware / Axiom 6 cost (V3):**

| Item | Cost |
|---|---|
| `dns.promises.lookup` per request | ~0.3–1 ms, one libuv threadpool op (**`UV_THREADPOOL_SIZE=3` — bounded by the request rate; logins/scrapes are human-paced; boot discovery is the only burst and it is now optional**) |
| `AbortSignal.timeout` | 1 internal timer per in-flight request, auto-cleared; **0 persistent threads** |
| Byte-counting reader | ~1 extra object per chunk; replaces an **unbounded** allocation with a **≤ maxBytes (2 MB default)** one — this *reduces* peak RSS |
| `resolveGateAction` | pure function, 1 object comparison chain, ~0 B retained |
| Statement/Map growth | none |
| New npm dependencies | **0** (`node:dns`, `node:net`, `AbortSignal`, streams) |
| eMMC | none (no new files) |

---

## 3. Execution order & atomic commits

Every commit is independently revertible with `git revert`, and **no intermediate state is less
secure than the previous one.** Order is chosen so the network perimeter closes *before* the
credential system exists (so there is never a window where auth is "partially on").

| # | Commit | Contents | Security delta | Revert safety |
|---|---|---|---|---|
| **C1** | `fix(basevault): allowlist + parameterize sync delta SQL` | new `sync-policy.ts`; rewrite `transport.handleSyncDelta`; `SyncEventLogSchema` tightening; add `NodeTransport.dispose()`; tests `sync-policy.test.ts`, `transport-sync-safety.test.ts` (first half) | Closes 4 of 7 SQLi sites | Pure tightening; revert restores the bug but nothing else depends on it |
| **C2** | `refactor(basevault): remove duplicate sync writer` | delete `sync.ts`, `sync.test.ts`, `reconciliation.test.ts`; move their invariants into `transport-sync-safety.test.ts` **in the same commit** | Closes the last 3 SQLi sites | Tests land with it → revert must restore tests too (atomic by construction) |
| **C3** | `feat(basevault): HMAC handshake for sync peers` | `.data/.sync.secret`, challenge/response, `authenticatedPeers`, reject unauthenticated `SYNC_DELTA`, handshake tests | Unauthenticated frames can no longer reach the writer at all | Additive (extra state); revert leaves C1/C2 intact |
| **C4** | `feat(portgrid): sync peer consent + manual peer validation` | `sync_enabled` default false, no auto-connect on `peer-discovered`, pending/approved peers, `POST /api/sync/peers`, `net.isIP`/port/CIDR validation on `/api/sync/manual`, `mdns-discovery` gated + `stop()` fixes | Closes mDNS auto-trust + the delta-exfil SSRF chain; **sync becomes opt-in (functional change — call out in CHANGELOG)** | Feature-flag revert: re-enable `sync_enabled` + restore the one-line auto-connect |
| **C5** | `fix(server): bind loopback, explicit CORS allowlist, bounded rate limiter` | `serve({hostname})`, `cors({origin: allowlist,…})`, rate-limit rekey + prune, `TRUST_PROXY` gate | **Closes T1 (drive-by browser) and T2/T6 (LAN + all-interfaces) in one commit — before any auth code exists** | Fully independent; revert is a 3-line change |
| **C6** | `feat(auth): operator credential + sessions + tickets + UI gate` *(single atomic commit: server **and** UI)* | `src/server/auth/{credentials,sessions,middleware,routes}.ts`; delete `basevault/auth.ts` + `readiness.ts`; replace `server-main.ts:41-80`; `src/ui/lib/api.ts` + `AuthGate.tsx` + migrate the 19 `const API` files and the 5 SSE/2 WS call sites; e2e `globalSetup` | Authentication actually exists; `Bearer garbage` rejected; SSE/WS authenticated via tickets | **Must revert as a unit** (server+UI). Reverting leaves an inert `operator_credential` row — harmless to old code |
| **C7** | `test(auth): negative + regression suite for the perimeter` | §4 auth tests | Locks C5/C6 in place | tests only |
| **C8** | `feat(routeswitch/coreexec): governed egress + gate hoist` | `egress.ts`; `GateAction +='fetch'`; `resolveGateAction` + hoisted ordering in `worker.ts`; worker fetch → `egressFetch` | Closes V3 (ungated SSRF + unbounded read) | `egressFetch` is additive; revert restores the raw fetch but C5/C6 still hold |
| **C9** | `feat(coreexec): functional scrape backend + egress site sweep` | `scrape_backend` http default; discovery/boot gating; `router.ts`+`cerebro-assist.ts` via `egressFetch` + `@deprecated`; `live-test.ts` → `scripts/` + env gate; `gitnexus-client` internal | Removes the remaining ungated raw fetches | Each file independently revertible |
| **C10** | `feat(audit): ground-rules checks for SQL interpolation, raw egress, and loopback bind` | `scripts/audit-ground-rules.ts` checks 6–8 + `scripts/audit-ground-rules.test.ts` cases | Regression tripwire | **Must be last** so it passes on the final tree |

**DB migration required: NONE.** Every new piece of state uses an existing table
(`system_settings`: `operator_credential`, `auth_setup_expires_at`, `sync_enabled`, `sync_peers`,
`scrape_backend`, `bind_address`) or is RAM-only (sessions, tickets, rate limits) or is a file
(`.data/.sync.secret`). This matters because `initDB()` (`db.ts:114-771`) has **no migration
framework** — only `CREATE TABLE IF NOT EXISTS` and try/catch `ALTER`s. If a future iteration wants
a `sessions` table, it must be added as `try { db.exec('CREATE TABLE IF NOT EXISTS …') } catch` at
the end of `initDB()`, never as a bare migration.

**Do NOT reorder C5 after C6.** C5 closes the LAN/browser surface with zero dependencies and no
user-visible change; putting auth first would create a window where the UI is broken *and* the
network is still open.

---

## 4. Test plan (for the Auditor)

Runner: `npx vitest run --fileParallelism=false` with `NODE_OPTIONS=--max-old-space-size=512`.
**All tests below are node-environment, server-side** — the repo's jsdom/undici incompatibility
(documented in `src/ui/components/chat-backend-routing.test.ts:8-13`) rules out component tests.
Existing patterns to follow: `src/server/routes/cerebro.test.ts` (`router.request(path)`),
`src/core/coreexec/permission-gate.test.ts` (seed/delete in `beforeEach`, unlink DB in `afterAll`).

### 4.1 V1 tests

**`src/core/basevault/network/sync-policy.test.ts`** (pure, no DB)
| # | Assertion | "Verified truth" |
|---|---|---|
| 1 | `parseDelta` accepts a trigger-shaped delta for each of the 3 tables with exactly the payload columns from `db.ts:717/733/749` | the allowlist matches reality |
| 2 | **NEGATIVE:** `table_name:'system_settings'` → `{ok:false, reason:'unknown-table'}` | the §0-V1-4 table is refused |
| 3 | **NEGATIVE:** `table_name:'projects; DROP TABLE tasks;--'`, `table_name:'(SELECT key AS id, value FROM system_settings)'`, `table_name:'tasks/**/WHERE/**/1=1'` → `unknown-table` | stacked + derived-table injection refused |
| 4 | **NEGATIVE:** action `'DELETE'` → `unsupported-action` | no trigger emits DELETE |
| 5 | **NEGATIVE:** payload key `id = 1 WHERE 1=1; --` → `unknown-column` | column injection refused |
| 6 | **NEGATIVE:** `status:'x'`, non-integer `created_at`, object-valued `dag_layout`, `timestamp` +5 min → respective rejects | row-value validation |
| 7 | `id:'system-maintenance'`, `id:'test-proj-1'`, `id:<uuid>` all accepted | no over-tightening of real IDs |

**`src/core/basevault/network/transport-sync-safety.test.ts`** (in-memory DB via `VITEST` branch of `db.ts`)
Construct a `NodeTransport`, call `handleIncomingMessage(JSON.stringify(packet), 'peer', fakeWs)` in
`beforeAll`/`afterAll` with `transport.dispose()` (verify `dispose` clears the 1 s interval — use
`vi.useFakeTimers()` + `vi.getTimerCount()`).
| # | Assertion |
|---|---|
| 1 | legit INSERT/UPDATE for `projects`/`workflow_runs`/`tasks` applies and **preserves columns absent from the partial payload** (the `transport.ts:154-158` invariant) |
| 2 | **NEGATIVE:** a delta naming `system_settings` leaves `system_settings` byte-identical and does **not** throw |
| 3 | **NEGATIVE:** `table_name:'tasks'` + key `id = (SELECT value FROM system_settings), status` → no column added, no write |
| 4 | after 3 hostile packets, `SELECT name FROM sqlite_master` still returns all 39 baseline tables |
| 5 | `sync_lock.is_syncing` is `0` after every packet (including a failing one) — the `finally` at `:188-190` |
| 6 | unauthenticated peer sending `SYNC_DELTA` (post-C3) is dropped and **touches nothing** |
| 7 | authenticated peer + hostile delta still rejected by policy (defense in depth: auth ≠ validation) |
| 8 | `stmtCache.size ≤ 32` after 100 deltas |

**Also assert the negative end-to-end shape** (once, integration-style):
`ws://127.0.0.1:<port>/api/sync` with `{type:'SYNC_DELTA', deltas:[{…table_name:'os_todos'…}]}` →
`os_todos` unchanged. This is the literal exploit from §0-V1.

### 4.2 V2 tests

Do **not** import `server-main.ts` (it binds a port, starts a scheduler, resumes runs). Test the
middleware on a scratch app:

**`src/server/auth/auth-middleware.test.ts`**
```ts
const app = new Hono().use('*', authMiddleware);
app.get('/api/cerebro/query', c => c.json({ ok: true }));   // stand-in for the dangerous route
app.get('/api/system/metrics', c => c.text('stream'));
app.get('/', c => c.json({ ok: true }));
```
| # | Assertion |
|---|---|
| 1 | **NEGATIVE (the exploit):** `POST /api/cerebro/query` with **no** `Authorization` → **401** |
| 2 | **REGRESSION (the actual bug):** `Authorization: Bearer definitely-not-a-token` → **401** (today's code returns `next()` here) |
| 3 | valid Bearer → 200 |
| 4 | `GET /` (static/root) reachable with no credential in setup mode |
| 5 | non-loopback source in setup mode → **403** for every route incl. `/` (inject `remoteAddress` via an overridable `getIp(c)` seam — design it in C6 for exactly this test) |
| 6 | ticket on `/api/system/metrics` → 200; ticket on `/api/cerebro/query` → 401; expired (>30 s, fake timers) → 401; 11th reuse of the same ticket → 401 |
| 7 | after `completeSetup()`, `/api/auth/setup` → **404 forever** |
| 8 | rate limiter: `getIp` returning 2048 distinct values → `rateLimits.size ≤ 1024`; `x-forwarded-for` ignored when `TRUST_PROXY` unset; all requests sharing one IP → 429 on the 121st |
| 9 | chunked request with **no** `content-length` > 64 KB → 413 (fixes §0-V2-(v); if you choose not to fix it here, assert the *current* behaviour and move it to §5) |

**`src/server/auth/auth-routes.test.ts`** — setup/login/ticket happy paths, weak-password reject,
double-setup 404, logout revokes (subsequent request 401), 17th concurrent session evicts the oldest.

**`src/server/auth/argon2-budget.test.ts`** — launch 8 *concurrent* `verifyOperator()` calls and
assert they all resolve and that **no more than one Argon2 verify is in flight**: instrument the
mutex (expose a `pendingVerifies` counter for tests) and assert `maxPending === 1`. This is the
Axiom-6 safety proof for (h).

**UI-side, node-environment source contract (mirrors `chat-backend-routing.test.ts`):**
`src/ui/lib/api.test.ts` — assert `src/ui/lib/api.ts` contains exactly one `Authorization` literal
and that `ScopeLogicChat.tsx` / `CerebroChatbot.tsx` still contain **none**
(`expect(src).not.toMatch(/Authorization['"]?\s*:/)` must keep passing).

### 4.3 V3 tests

**`src/core/routeswitch/egress.test.ts`** (spin a local `http.createServer` on `127.0.0.1:0`)
| # | Assertion |
|---|---|
| 1 | **NEGATIVE:** `file:///etc/passwd` → `blocked:'scheme'`, no bytes read |
| 2 | **NEGATIVE (the SSRF):** `http://127.0.0.1:<server>/` **without** `internal/allowPrivate` → `blocked:'private-address'` (i.e. the §0-V3 exploit of `http://127.0.0.1:3743/api/system/settings` fails) |
| 3 | **NEGATIVE:** `http://169.254.169.254/latest/meta-data/` → `blocked:'private-address'` |
| 4 | kill switch `external_calls_enabled='false'` → `blocked:'kill-switch'`; absent → allowed |
| 5 | **NEGATIVE:** server returns 10 MB, `maxBytes: 1_000_000` → `blocked:'too-large'` **and** the process RSS does not hold 10 MB (assert `bytes ≤ 1_000_000 + chunk`) |
| 6 | server never responds → `timeoutMs: 200` → `ok:false`, test completes < 1 s |
| 7 | `internal:true` to loopback → allowed |

**`src/core/coreexec/gate-order.test.ts`** (pure function, no worker threads)
| # | Assertion |
|---|---|
| 1 | `resolveGateAction({plugin:'okf_indexer', params:{url:'https://x'}})` → `'fetch'` |
| 2 | **REGRESSION (the ordering bug):** the plugin branch is now reached only *after* the gate — assert by giving `checkActionPermission` a mocked `blocked:true` (via `vi.mock` of `./permission-gate`) and confirming `executePlugin`/`egressFetch` is **never called** |
| 3 | `{params:{files:[…]}}` and `{params:{mockContent:'…'}}` → `null` (no network) |
| 4 | `{directive:{action:'shell'}}` → `'shell'`; `{directive:{action:'generic'}}` → `null` |
| 5 | `checkActionPermission(p,'fetch')` with `archetype network:false` → blocked (extends `permission-gate.test.ts`, which already covers shell/scrape) |

**Scrape:** `src/core/coreexec/scraping.test.ts` — default `scrape_backend` absent → HTTP backend
returns `{status:'success', url, content_length, preview}` from the local test server (**proves
`scrape` works without network inside bwrap**); `scrape_backend='browser'` → still invokes
`StealthScraper` (assert via mock that `sandbox.execute` was called).

### 4.4 Static drift auditor — extend `scripts/audit-ground-rules.ts`

**Yes — two new checks fit perfectly**, following the existing `CHILD_PROCESS_ALLOWLIST` pattern
and the existing pure-scan testability style (`scanForChildProcessUsage`).

* **Check 6 — `checkNoUntrustedSqlInterpolation`.** Scan `src/**/*.ts` (skip `*.test.ts`) for
  `` `.prepare(`` / `` `.exec(` `` **backtick templates containing `${`**.
  Initial allowlist (verified to be the complete set of *server-controlled* fragment sites today —
  3 files, all building `updates`/`filters` from literals, not request keys):
  ```
  src/server/routes/coreexec-router.ts   // ${runFilter}, ${taskFilter} — literal fragments
  src/server/routes/llm.ts               // ${updates.join()} — push()ed literals only
  src/server/routes/projects.ts          // ${updates.join()} — push()ed literals only
  ```
  After C1/C2, `transport.ts` and `sync.ts` must **not** be on the allowlist (they leave the list by
  ceasing to interpolate, which is the point). Any new file must be added with a written
  justification comment, exactly like `CHILD_PROCESS_ALLOWLIST`.
* **Check 7 — `checkNoRawEgress`.** Mirror `CHILD_PROCESS_PATTERNS` with
  `/(?<![.\w])fetch\s*\(/` over non-test `.ts`, allowlisting only
  `src/core/routeswitch/egress.ts` (the gate itself),
  `src/core/routeswitch/adapters/*.ts` (provider adapters — note in a comment that they are the
  *next* thing to route through `egressFetch`, recorded as deferred §5-14),
  `src/core/memory/gitnexus-client.ts`, `src/server/routes/system.ts` (post-C9 comment).
* **Check 8 (recommended) — `checkServerBindsLoopback`:** assert `server-main.ts` contains
  `hostname:` inside the `serve({ … })` literal. Cheap, and it stops C5 from silently regressing.

Extend `scripts/audit-ground-rules.test.ts` with positive/negative fixtures for each new check
(it already exists and already exercises `scanForChildProcessUsage`-style pure functions).

**Baseline warning:** `npx tsx scripts/audit-ground-rules.ts` **already fails at HEAD**:
```
[FAIL] No unapproved shell-exec surface — … src/server/index.ts [from 'child_process']   (import at index.ts:1 is unused)
[FAIL] Global OKF seed mechanism is wired up (…server/index.ts does not import bootstrapGlobalOKFSeed…)  ← it is imported by server-main.ts, not index.ts
3/5 checks passed.
```
The Auditor must record this baseline **before** C10 so the two new checks are judged independently
of the two pre-existing failures (and those two are added to §5-16 rather than silently "fixed").

---

## 5. Risks, rollback, and what was deliberately NOT fixed

### 5.1 Risks in this plan

| Risk | Mitigation |
|---|---|
| C6 breaks the UI if server and UI ship in different builds | **single commit**; add a boot-time log line `Auth: enabled/disabled (setup pending)` so a mismatch is diagnosable in `server.log` |
| `tauri dev` is broken today → C6's Tauri origin can't be live-tested | allowlist `tauri://localhost` + `http://tauri.localhost` and assert the CORS set in a unit test; verify Tauri origin by a manual checklist item (§5.4) |
| Argon2id native memory vs earlyoom | serialized verify (max 1 × 64 MiB); `argon2-budget.test.ts` proves max-concurrency 1 |
| C4 turns sync off by default → users think sync "broke" | CHANGELOG + PortGrid banner: "Sync now requires explicit peer approval (PortGrid → Sync Peers)" |
| e2e Playwright 401s after C6 | e2e `globalSetup` decided **inside** C6, not after |
| Statement-cache eviction on overflow recompiles SQL | 32-entry cap with full clear; typical working set ~10 → no thrash. If a future payload shape churns, raise the cap (documented constant) |
| Reverting C6 leaves `operator_credential` in `system_settings` | old code never reads it — inert. Record in `SECURITY.md` |

### 5.2 Rollback

Each of C1–C10 is one `git revert`. C2 and C6 are **atomic units** and must be reverted as such.
No DB migration exists to roll back; the only persistent artifacts are
`.data/.sync.secret`, `system_settings.operator_credential`, and the `sync_peers`/`sync_enabled`
rows — all inert to older code.

### 5.3 Deliberately NOT fixed — recorded so nothing is lost (32 findings from the preceding audit)

1. **`enforceCategoryASafety` over-broad substrings** — `system.ts:604`
   `suspiciousShellFragments = ['sh','bash','!/bin/sh','#!/bin/bash','pts','echo ','\`','${']`;
   `'sh'` and `'pts'` match ordinary words → false-positive rejection of legitimate proposals.
2. **Mock content treated as success** — `worker.ts:76` `content = input.params?.mockContent`, then
   `:139` inserts it into `memory_quarantine` as an *external document* with an `os_todos` ticket.
3. **Missing project scoping** — e.g. `server-main.ts:462-485` `/api/basevault/runs` returns all
   projects when `?projectId` is omitted; several list endpoints likewise.
4. **`startWatcher` unwired** — `scoutdaemon/watcher.ts:49` has zero importers (chokidar file
   watching never starts).
5. **P8-4 `ProviderCapabilities` is write-only** — **verified**: `grep '\.capabilities'` outside
   `routeswitch/adapters/*` returns **zero hits**; `providers.ts:62` declares it optional. No
   consumer reads it, so ScopeLogic routing by capability does not happen.
6. **`tauri dev` broken** — `tauri.conf.json` `devUrl: http://localhost:5173` vs Vite's **3742**;
   `beforeDevCommand: "npm run dev"` references a script that does not exist in `package.json`.
   Also `"csp": null` (no Content-Security-Policy in the shell).
7. **`.data/.master.key` is `0644` (world-readable)** — should be `0600`; it decrypts every
   provider key. (One-line `fs.chmodSync`, out of scope here.)
8. **`/api/cerebro/query` remains a raw-SQL endpoint** post-auth: any session can `SELECT`
   anything. Recommend a read-only second connection (`PRAGMA query_only=1`) or removal later.
9. **Browser-based `scrape` (Scrapling/Chrome) is structurally incompatible with
   `--unshare-net`** — this plan makes `'http'` the default; removing the browser backend entirely
   is a product decision left open.
10. **`POST /api/system/restore` still accepts an unvalidated DB and calls `process.exit(0)`**
    (`system.ts:200-233`) — after V2 it is authenticated, but there is still no SQLite magic-header
    check and no backup integrity verification.
11. **64 KB payload cap is bypassable** by chunked requests with no `content-length`
    (`server-main.ts:43-46`).
12. **`GET /api/system/backup` writes `backup-<ts>.db` into `process.cwd()`** with no size/count
    cap → disk-fill on eMMC (`system.ts:178`).
13. **`POST /api/system/browse-directory` allows arbitrary directory listing** (`system.ts:708-741`)
    — auth-gated by V2 but no path allowlist.
14. **Provider adapters still use raw `fetch`** (`adapters/openai-compatible.ts:187,205,288`)
    — intentionally left on the Check-7 allowlist for this plan; the follow-up is to route them
    through `egressFetch` so *all* egress has one choke point.
15. **`bootProviderRegistry` / `POST /api/routeswitch/provider` set providers and keys without the
    `FreeModeGovernor`, paid-tier lock, or the registry** (`server-main.ts:427-447`) — the
    governor-bypass half of the V3 finding that is *not* an SSRF.
16. **Pre-existing `audit:ground-rules` failures** (2 of 5): `src/server/index.ts` unused
    `child_process` import; OKF-seed check looks in `server/index.ts` while the call lives in
    `server-main.ts`.
17. **Latent 4th-order SQL interpolation** — `memory/cerebro/vector.ts:130`
    `` const filterSQL = typeFilter ? `AND m.type = '${typeFilter}'` : `` — every production call
    site passes a literal or `undefined` (`reflection-sweep.ts:18`, `context-router.ts:95`,
    `cerebro.ts:98`), so it is **not exploitable today**, but it is a one-line fix
    (`type = ?` + bind) and Check 6 will not catch it (different file shape).
18. **`gitnexus-client.ts:205` can `POST /shutdown` to a local eval server** — auth-gated by V2;
    no allowlist on host/port.
19. **`NodeTransport` living in BaseVault is a boundary smell** (BaseVault initiates outbound
    connections via `connectToPeer`) — pre-existing AGENTS.md drift; a move to RouteSwitch is the
    correct long-term fix but is far larger than a CRITICAL remediation.
20. **`mdns-discovery.ts:75` interval is never cleared by `stop()`** (leaked timer) — noted; C4
    touches `start()` but the `stop()` fix is bundled, not designed here.
21. **Terminal WS has unrestricted network by documented design** (`terminal-session.ts:19-30`).
    After V2 it is authenticated, but any token/ticket holder gets a network-enabled shell —
    recorded as accepted residual risk of that feature.
22. **No CSRF token** — mitigated by the CORS allowlist + Bearer (no ambient credentials); residual
    risk is same-origin XSS, which needs a CSP (`csp: null`, item 6).
23. **DNS-rebinding TOCTOU in `egressFetch`** — accepted and documented (§2.3 C8-a step 4).
24. **`POST /api/system/settings` can overwrite `tool_registry`/`agent_permissions`** — becomes
    authenticated only; no integrity protection (no hash/HITL) on the permission matrix itself.
25. **`POST /api/system/daemon/kill`, `/daemon/restart`, `/migrate`** — unauthenticated DoS today,
    authenticated after V2; no further hardening.
26. **`scoutdaemon/idle.ts` writes `pending` runs as project `system-maintenance` with archetype
    NULL** — so the permissive default exempts ScoutDaemon-originated plugin runs even after C8;
    the *unconditional* EgressGate controls are what cover this (stated explicitly in §2.3).
27. **`test-guards.ts` is a non-asserting "test"** that prints ✅ regardless of outcomes.
28. **`e2e-report/`, `test-results/`, `server.log`, `ui.log`, `design_md*.b64` committed in repo
    root** — hygiene, not security.
29. **`model_benchmarks`/`discovered_models`/`test_tx` junk tables** in the shipped DB.
30. **Prometheus `/api/telemetry/metrics`** had no auth (becomes auth-gated in C6; no rate limit
    beyond the global one).
31. **`NODE_OPTIONS`/`UV_THREADPOOL_SIZE` injected into sandboxed children**
    (`sandbox.ts:137-138`) can be re-pointed via `environment_rules` rows written through
    V1/`/api/system/settings` — mitigated by V1+V2, not independently hardened.
32. **`resp.ok` unchecked in some provider adapters** (mock/degraded fallback silently substitutes
    content) — "mock-content-as-success" family, item 2.

### 5.4 Manual verification checklist (for the human, since `tauri dev` is broken)

1. Fresh clone/`.data` → start server → `curl -i http://127.0.0.1:3743/api/cerebro/query -X POST -H 'Content-Type: application/json' -d '{"query":"SELECT 1"}'` → **401**.
2. `curl -i http://<LAN-IP>:3743/` → **connection refused** (bind check).
3. Browser console on `https://evil.example` → `fetch('http://localhost:3743/api/system/settings')` → **CORS failure**.
4. Complete setup in the local UI → reload → dashboard renders with a stored token; a second tab on
   another origin cannot read responses.
5. `npx tsx scripts/audit-ground-rules.ts` → only the **two pre-existing** failures remain.
6. Packaged sidecar: `npm run build:sidecar` then login (exercises the lazy `argon2` require through
   `ESBUILD_EXTERNALS`).

---

*End of plan. No files other than this document were created or modified.*
