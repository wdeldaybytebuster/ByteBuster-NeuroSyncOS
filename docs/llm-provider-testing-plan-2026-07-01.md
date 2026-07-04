# LLM Provider Testing Plan — 2026-07-01

Status: **OpenCode Zen and OpenRouter were both live-tested end-to-end with
real keys and work correctly (concept extraction, correct object shape,
rate-limit resilience). The database has since been fully reset to a clean
slate** — no providers, routing rules, or projects — specifically so you can
redo testing from scratch as if a brand-new install. See §0 for everything
found and fixed in that live-test pass before you start.

## 0. Live-test pass (2026-07-03) — bugs found & fixed, DB reset

Both new provider types were exercised against the real APIs with real keys
you provided (now purged — see below):

- **OpenCode Zen**: real "pong" response confirmed the key works; found and
  fixed a real bug — its free `big-pickle` model (routes to DeepSeek)
  rejects `response_format: json_schema` outright (400 "response_format type
  is unavailable now"). `OpenAICompatibleProvider.generate()` now retries
  once without `response_format` on that specific error signal, relying on
  the prompt's own "output ONLY valid JSON" instruction — confirmed it then
  produces correctly-shaped concepts (all fields present, 0.95 confidence)
  from the real production OKF extraction prompt.
- **OpenRouter**: found and fixed a second real bug — free-model
  auto-resolution had no modality filter, so it picked
  `google/lyria-3-pro-preview` (Google's *music generation* model) as a
  "free chat model" and it correctly 502'd trying to do text chat.
  `ZenDiscoveryService` now checks OpenRouter's `architecture.output_modalities`
  and excludes anything that isn't text-out. Also hit a live rate-limit on
  the next auto-picked model (`qwen/qwen3-coder:free` — normal for shared
  free tiers); `OpenRouterProvider`/`OpenCodeProvider` now rotate through up
  to 5 free candidates on a 429 before giving up, instead of failing the
  whole platform because one model was busy. Confirmed working end-to-end
  after both fixes: real "pong", then 4/4 correctly-shaped concepts.
- **`MockProvider.generate()`** (flagged earlier, now fixed): was returning
  `'{}'` for array-shaped schemas (like OKF extraction), always failing
  `Array.isArray()` downstream. Now returns `'[]'` for array schemas.

**Separately, a serious pre-existing bug was found and fixed: the test suite
had no isolation from the real dev database.** `src/core/basevault/db.ts`
always pointed at the same `.data/neurosync.db` the live dev server uses, and
at least two test files (`coreexec/queue.test.ts`, `coreexec/engine.test.ts`)
run unconditional `DELETE FROM projects/tasks/workflow_runs` as cleanup —
`db.test.ts` even `fs.unlinkSync`'d the db file entirely in `afterAll`.
Running `npm test` (or any `vitest run`) while the dev server was up wiped
real registered providers, routing rules, and the project registry — this is
almost certainly what caused the original provider/routing-rule loss earlier
in this session, and it recurred once more before being tracked down.

**Fix**: `src/core/basevault/db.ts` now uses a private `:memory:` database
whenever `process.env.VITEST` is set (Vitest sets this automatically), so
tests never touch the real file. This also surfaced two smaller latent bugs
that had been silently papered over by the previously-shared file: CoreExec's
worker-thread pool (`worker.ts`, esbuild-bundled into `worker.generated.cjs`
by `worker-pool.ts` on every load — no separate build step needed) never
initialized its own schema, relying on the main thread having already done
so in the shared file; each worker thread's own `:memory:` db is private, so
it needs to call `initDB()` itself now (added). And `context-router.test.ts`
never called `initDB()` at all, relying on some other test file having
already created the schema in the shared file first — fixed by adding its
own `beforeAll(initDB)`. `db.test.ts`'s "should enforce WAL mode" test also
needed updating: SQLite doesn't support WAL for `:memory:` databases (falls
back to `'memory'` mode), so the test now asserts the mode appropriate to
which db path is active.

**Cleanup performed per your request:**
- The two live-test provider registrations (OpenCode Zen, OpenRouter) and
  their encrypted keys are gone — the entire `.data/neurosync.db`,
  `-wal`/`-shm` files, and the encryption master key were deleted outright
  and the server restarted fresh (not just row-deleted, so nothing
  key-derived survives either).
- Verified no plaintext copy of either key exists anywhere in the repo or in
  scratch/temp files — grepped both, zero matches, temp test scripts deleted.
- Confirmed via direct DB query and API calls: 0 providers, 0 routing rules,
  0 projects, 0 OKF nodes. Full test suite (427 tests) still green after the
  reset, and — now that isolation is fixed — running it no longer touches
  this fresh state.

## 1. What triggered this plan

While fixing the OKF conversion bug (commits touching `src/core/okf/indexer.ts`,
`src/core/routeswitch/adapters/openai-compatible.ts`, `src/server/index.ts`),
two things surfaced beyond that one bug — both are now addressed:

1. **`LlamaCppProvider` was a stub returning fake placeholder data.** Fixed —
   see §2.
2. **OpenCode and OpenRouter weren't first-class provider options** — you had
   to know FreeLLMAPI's proxy semantics to get to them indirectly. Fixed —
   see §3. ("OpenAI Compatible" stays as the generic/testing type for your
   own FreeLLMAPI proxy or any other custom endpoint; it is NOT assumed to be
   what most users will run.)

## 2. Phase 0 — LlamaCppProvider real inference (DONE)

`src/core/routeswitch/adapters/llama-cpp.ts` now does real `node-llama-cpp`
inference instead of returning canned strings:

- Model/context/session are loaded once and cached per instance (not
  reloaded per request).
- GBNF grammar is wired through `llama.createGrammar()` for schema-constrained
  calls (OKF concept extraction).
- `contextSize` / `gpuLayers` / `temperature` from `LlamaCppConfig` are
  respected.

**Two real bugs were found and fixed along the way, verified against your
actual Gemma model (`local_models/gemma-4-E2B_q4_0-it.gguf`):**

- The postinstall script for `node-llama-cpp` was blocked by npm 11's
  `allow-scripts` gate (a real supply-chain security feature, not a bug) —
  approved just that one package (`npm approve-scripts node-llama-cpp`), left
  `argon2`/`node-pty`'s pending scripts alone since they're unrelated to this
  task.
- **`OKF_CONCEPT_EXTRACTION_GBNF` (`src/core/okf/generator.ts`) had never
  actually been grammar-parsed until now** (the stub never called it for
  real). Its `concept` rule spanned multiple lines; node-llama-cpp's grammar
  parser terminates a rule at a newline when the preceding line looks
  "complete" rather than requiring an explicit continuation marker, so it
  failed with `expecting name at ...`. Fixed by collapsing that rule to one
  line. Confirmed via bisection against the parser directly, then end-to-end
  against the real model (valid JSON array returned).

**Important finding — CPU inference is slow on this hardware:** no
`gpuLayers` is configured for the current `local_models/gemma-4-E2B_q4_0-it.gguf`
provider row, so it's running on CPU only. Observed timings:
- Cold model load: ~130s.
- Warm short completion (a few tokens): ~9-12s.
- Grammar-constrained OKF-style extraction (~130 tokens out): ~7.6 minutes.

At the current OKF token budget (8000 tokens, set for the reasoning-model
fix on the remote path), a real local-fallback OKF conversion could take
**well over an hour** if it needs to generate a lot of concepts. This wasn't
something the old stub could ever surface since it faked instant responses.
Options to discuss when you're back:
- Set `gpuLayers` on the provider config if you have a GPU available (biggest
  win by far).
- Lower the token budget specifically for the llama-cpp path (separate from
  the remote-reasoning-model budget), since GBNF-constrained local generation
  doesn't need headroom for chain-of-thought the way a remote reasoning model
  does.
- Add a generation timeout/abort so a runaway local call doesn't block a
  request indefinitely.
- True token streaming end-to-end is a bigger, separate architecture change
  (the `LLMProvider` interface is request/response-only everywhere today, and
  no part of the system currently streams LLM tokens) — worth scoping
  separately if you want it, not bundled into this fix.

## 3. OpenCode Zen & OpenRouter — native provider types (DONE)

Per your correction: these are now first-class provider types (paste API
key, base URL and free-model selection handled internally), separate from
the generic "OpenAI Compatible" type (which stays as the escape hatch for
your own FreeLLMAPI proxy, LM Studio, vLLM, etc. — most NeuroSyncMega users
won't have FreeLLMAPI running, so nothing should depend on it).

New files:
- `src/core/routeswitch/adapters/opencode.ts` — `OpenCodeProvider`, base URL
  `https://opencode.ai/zen/v1`.
- `src/core/routeswitch/adapters/openrouter.ts` — `OpenRouterProvider`, base
  URL `https://openrouter.ai/api/v1` + attribution headers.
- `src/core/routeswitch/provider-factory.ts` — single `instantiateProvider()`
  function now used by all 8 places that used to duplicate a
  type-to-provider if/else chain across `src/server/index.ts` and
  `src/server/routes/llm.ts`.

**Free-model discovery, live-verified (2026-07-02):**
- OpenCode Zen's `/v1/models` is public (no key needed to list, a key is
  needed for actual completions) but carries **no pricing/free field at
  all** — confirmed by direct probe. Free promo models follow a `-free`
  suffix convention, with one documented exception (`big-pickle`) per
  `https://opencode.ai/docs/zen/`. `OpenCodeDiscoveryService` in
  `src/core/routeswitch/discovery.ts` fetches the live catalog and filters
  on that suffix + exception set — dynamic, not a frozen hardcoded list, so
  new `-free` models get picked up automatically. The exception set is the
  only part that can go stale if OpenCode adds another non-suffixed free
  model.
- OpenRouter's existing `ZenDiscoveryService` (already in the codebase,
  previously used only by an internal model-selector, not exposed as a
  provider type) already does real dynamic free-model discovery via
  `:free`-suffixed models and zero-priced entries from its public catalog —
  live-verified, returned 26 free models just now.
- When a provider's Model ID is left blank ("auto"), `OpenCodeProvider` /
  `OpenRouterProvider` resolve to the first live free model at request time
  — these platforms don't understand a literal `"auto"` string the way your
  FreeLLMAPI proxy's own smart routing does.

**UI**: `src/ui/views/RouteSwitchDashboard.tsx`'s "+ Add Provider" Type
dropdown now lists OpenCode Zen and OpenRouter first, defaults new providers
to OpenCode Zen, and hides the Base URL field for both (only Name + API Key
+ optional Model ID show).

**Live-tested with real keys as of 2026-07-03 — see §0 for the two bugs that
live testing found and fixed.** Database has since been reset to empty
specifically so you can redo Phase 1 below from a clean slate with your own
keys.

## 4. Phase 1 — Live test matrix (needs you + real keys)

Run each cell against the actual running dev server (`localhost:3743`), not
synthetic tests. For each: record ✅/❌, the `provider`/model actually used
(Cerebro chat returns this via `result.provider`), latency, and anomalies.

| Capability | Mock | OpenCode Zen | OpenRouter | OpenAI-Compatible (your FreeLLMAPI) | Llama-cpp (Gemma local) |
|---|:---:|:---:|:---:|:---:|:---:|
| Cerebro chat (simple prompt) | | | | | |
| Cerebro chat (long/complex prompt) | | | | | |
| OKF convert-document (short .md) | | | | | |
| OKF convert-document (large .md, 100KB+) | | | | | |
| CoreExec DAG generation (schema-constrained) | | | | | |
| Council Mode (2+ providers, high-risk prompt) | | | | | n/a |
| Fallback: primary down → secondary kicks in | | n/a | n/a | n/a | n/a |
| Rate-limit (429) → provider marked exhausted, chain continues | | | | | n/a |
| Blank Model ID → auto-resolves to a real free model (not a literal "auto" sent to the API) | n/a | | | n/a (proxy understands literal Auto) | n/a |

Known, not-yet-fixed item surfaced during this work (low priority, flag if
you want it fixed): `MockProvider.generate()` returns `JSON.stringify({})`
(an object) instead of `[]` when given an array-shaped schema — always fails
`Array.isArray()` downstream. Only affects the offline/dev Mock path, not
user-facing providers.

## 5. Phase 2 — Free-tier-only verification

- With real OpenCode/OpenRouter keys registered: confirm via the returned
  `provider`/model fields that requests land on free-tier models specifically
  (not a paid one that silently bills you) when Model ID is left blank.
- Check `FreeModeGovernor`'s 100,000-token/24h ceiling is enforced correctly
  across multiple real providers active at once, not just a global illusion.

## 6. Phase 3 — Resilience / chaos testing

- Kill your FreeLLMAPI proxy mid-session; confirm RouteSwitch falls through
  to the next chain member (llama-cpp or a registered OpenCode/OpenRouter
  key) cleanly.
- Feed a document large enough to test the 8000-token OKF budget's ceiling —
  does it still truncate on a big enough doc?
- Confirm a malformed-JSON response from any remote provider fails gracefully
  (clear error) rather than silently returning zero concepts with no
  explanation — this is what the original bug report was about.

## 7. Phase 4 — UI verification

- Confirm the exact "No OKF Folder Found" error from the original bug report
  no longer reproduces on the same project.
- Confirm Llama-cpp's per-concept confidence values reflect the model's real
  output, not a leftover hardcoded `0.85` from the old stub (should already
  be fixed — the model sets `confidence` itself now per the GBNF schema, but
  worth a real-conversation spot-check).
- Provider Registry cards, Add/Edit form, and fallback-chain editor all
  persist and take effect without a server restart for the two new types.

## 8. Resolved from the last round (for reference)

- ~~What does "OpenCode API option" mean?~~ Resolved: a first-class provider
  type in NeuroSyncMega itself, not a FreeLLMAPI routing detail. Done (§3).
- ~~Is streaming required for v1?~~ No system-wide LLM streaming exists today
  (SSE elsewhere is unrelated ScoutDaemon telemetry) — non-streaming local
  inference is consistent with the rest of the architecture. Real streaming
  is a separate, bigger future item if wanted (see CPU-performance note in
  §2 for why it'd matter for the local model specifically).
- Embedded Terminal panel's "Claude CLI, OpenCode, etc." copy
  (`docs/sovereign-os-reality-audit-2026-06-30.md` line 33) refers to
  CLI-hosting, which is unrelated to the LLM-provider OpenCode work here and
  is confirmed **not implemented** — still an open item if you want that UI
  copy corrected or the feature actually built, but out of scope for this
  round.
