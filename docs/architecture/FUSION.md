# Fusion — request contract

Scope: how NeuroSync's RouteSwitch module sends a Fusion request through a
FreeLLMAPI-compatible router, what it controls, and what it deliberately does
not. Written for a future engineer who needs the contract without reading the
adapters.

## 1. What Fusion is (and is not)

Fusion is a **server-side ensemble mode of the router**, selected by asking for
`model="fusion"` on a chat-completions request. The router fans the request out
across its upstream providers and returns a single completion.

NeuroSync does **not** run the ensemble itself. RouteSwitch's job here is
pass-through plus observability:

- it sends the requested model id (or an explicit per-request field set, see §2),
- it reports back what the router says it actually did (§5).

The ensemble itself, its panel selection, and its judging are outside this
repository. Where this document says "the router reports", it means a value the
process observes on the HTTP response — not a value NeuroSync computes.

Related: Council Mode (`src/core/routeswitch/council.ts`) is a *different*
multi-provider mechanism that NeuroSync does own. Fusion is not Council Mode.
The `council.ts` module is unmodified, and Council's trigger, provider filtering,
deadline and accounting are unchanged; the only Council-adjacent addition in this
change set is the single warning described in the next paragraph.

The two forms of `extraBody` behave differently here, and both differences are
deliberate. **A per-request `extraBody` is inert in Council Mode.** Council Mode
is chosen per request (a high-risk prompt with two or more eligible providers)
and fans the *same* prompt out to every leg before synthesizing a consensus, so
`RouteRequest.extraBody` is **not** propagated to those legs, and the engine
emits a single warning when a request carrying one fans out to consensus, so the
drop is observable rather than silent.

A provider's own **durable static** `extraBody` is a different case and is *not*
inert: that value belongs to the provider instance, and a council leg **is** such
an instance, built from its own row's config — so each leg sends its own static
field. Only the per-request value fails to reach a leg. The coverage section in
§2 states the reach of both forms provider type by provider type.

Per-request inertness is deliberate, for two reasons:

- **Fan-out multiplication.** The per-request `extraBody` is where a Fusion panel
  request lives. Handing it to N legs would ask every leg for its own panel set, multiplying the
  router-side fan-out by the leg count — the opposite of what the caller asked
  for, and a quiet way to blow through the free-tier budget.
- **Separate budget and accounting contracts.** Council Mode has its own per-leg
  budget and records `estimatedTokens × eligible provider count` (§6), because
  NeuroSync genuinely runs those legs. A Fusion request is one HTTP call and
  records 1×. Mixing the two would make the accounting meaningless.

If you need a **per-request** extra body field to reach a council leg, that is a
change to Council Mode itself and is explicitly out of scope here (§7).

## 2. The `extraBody` seam

Fusion accepts optional per-request fields that the generic request builder does
not model. Those are carried by an optional `extraBody`:

- **Per request** — `extraBody?: Record<string, unknown>` on `RouteRequest`
  (`src/core/routeswitch/engine.ts`). `RouteSwitchEngine._executeWithProvider()`
  threads it into the provider call.
- **Per provider (static)** — `extraBody?` on `OpenAICompatibleConfig`
  (`src/core/routeswitch/adapters/openai-compatible.ts`) for a provider that
  always needs the same extra fields. The two subclass configs declare it as
  well — `OpenRouterProviderConfig` (`adapters/openrouter.ts`) and
  `OpenCodeProviderConfig` (`adapters/opencode.ts`) — so every
  OpenAI-compatible-derived provider type can carry one (see the coverage
  section below for which types honour it).
- **On the provider interface** — `LLMProvider.generate()` takes the per-request
  value as an optional 5th parameter (`src/core/routeswitch/providers.ts`), typed
  as `ExtraBody = Record<string, unknown>`. The parameter is additive and
  optional, so existing call sites are unaffected.

Plumbing: `RouteRequest.extraBody` → `generate(…, extraBody)` →
`_generateWithConfig(…, extra?: { extraBody?: ExtraBody; meta?: GenerationMeta })`.
All `generate()` overrides that call `_generateWithConfig` (`freellmapi`,
`opencode`, `openrouter`) forward it.

### Coverage by provider type, and in Council Mode

The two forms have **different reach**, and conflating them is the easiest way to
misread this document.

- **The per-request form** (`RouteRequest.extraBody`) reaches the
  **single-provider execution path only**. It is **inert in Council Mode** by
  design (§1), because it belongs to the request rather than to any provider.
- **The per-provider static form** is a **construction-time property of a
  provider instance**, so it travels with that instance wherever it is used:

  - It is honoured by all four OpenAI-compatible-derived provider types —
    `openai-compatible`, `freellmapi`, `opencode` and `openrouter` — because each
    of them extends `OpenAICompatibleProvider`, whose request builder reads and
    denylist-sanitizes a config-level `extraBody`.
  - `llama-cpp` and `mock` do **not** extend that class and build no chat body,
    so a persisted `extraBody` on such a row **cannot** be honoured. The provider
    factory ignores it and emits one warning naming the provider type and the
    **ignored** key **names** — never the values. (The refused-key warning is a
    different message: see the Denylist section below.)
  - Because the static form lives on the instance rather than on the request, it
    is **not** inert in Council Mode: a council leg is itself a provider instance
    built from its own row's config, so each leg sends its own static
    `extraBody`. Only the per-request `RouteRequest.extraBody` fails to reach a
    leg — §1 records why that one must not be forwarded.

### Merge order

Per-request values layer on top of the static per-provider value, and the result
is merged onto the generated body:

```
requestBody = { ...baseBody, ...staticExtraBody, ...safePerRequestExtra }
```

After the merge the **model is pinned**: when the configured model id is not
`auto`, `requestBody.model` is set to that id; when it is `auto`, any `model`
key is removed. A caller can never redirect a request to a different model
through `extraBody`.

This is deliberately **two guards, not one**, and they are layered on purpose:
the denylist strips `model` before the merge, and the pin re-applies the
configured model afterwards. If a future change relaxes the denylist, the pin
still holds; if the pin is ever removed, the denylist is the only thing left
between a caller's `model` field and the request body. Do not remove both, and
do not assume either one alone is the whole guarantee.

**Honest limitation, so the redundancy is not mistaken for verified behaviour:**
because the denylist removes `model` before the merge ever sees it, no black-box
test through the provider's public surface can isolate the pin — the pinned-model
tests still pass with the re-pin deleted. Treat the pin as redundant
defence-in-depth for the day the denylist is relaxed, *not* as behaviour that the
test suite independently proves.

### Denylist

`extraBody` may **not** carry `model`, `messages`, `response_format`,
`__proto__`, `constructor`, or `prototype` — six keys, held in
`EXTRA_BODY_DENYLIST` and exported as a constant from
`src/core/routeswitch/adapters/openai-compatible.ts`. The merge is sanitized by
`sanitizeExtraBody()`. The sanitizer returns the refused key **names**, and the
request path logs them, so a caller's mistake shows up in the log instead of
being dropped with no signal at all; only the names are logged, never the
values. In particular this protects:

- the prompt itself (`messages`),
- structured-output requests, including the existing 400-`response_format`
  rescue path,
- the model pin above.

The last three keys are there for a different reason than the first three, and
they are **not** a "tidy up the list to the three documented body keys"
opportunity: a `__proto__` (or `constructor`/`prototype`) key has to be refused
rather than written through, because assigning it would be served by an
inherited accessor instead of becoming data — it would retarget the object's
prototype rather than add a field, and it would vanish from `Object.keys`
without ever reaching the refused list. The sanitizer defends this twice over:
those keys are denied, *and* the surviving object is built with
`Object.create(null)`, so a key that somehow passed the list still could not
reach an inherited setter. A test asserts a refused `constructor` precisely
because it is on the list — so do not read this contract as covering only the
three body-contract keys.

**What this guard is and is not.** `extraBody` is a *trusted-caller* seam: it
arrives from in-process configuration or from a provider row in BaseVault, not
from a remote user. The denylist exists to stop accidents — a caller who
typo's a field name, or copies a whole request body in — and to keep the base
body's `model`, `messages` and `response_format` authoritative. It refuses the
prototype keys outright and refuses (rather than propagating) a key whose value
cannot be read — but it is **not** a security sandbox: the values themselves are
neither validated nor deep-sanitized, so a nested object passes through as it
was given, and nothing should rely on this seam as an untrusted-input boundary.
If a future change ever accepts `extraBody` from untrusted input, that input
needs its own validation before it reaches here.

It is also a **denylist, not an allowlist**, so any canonical body key that is not
on the list stays caller-overridable. Today that includes `max_tokens`,
`temperature` and `enable_thinking`, and every future canonical key inherits the
same gap. The phase plan explicitly permitted an allowlist (or destructuring)
here; migrating to one is the durable fix and is deliberately *not* part of this
change set — see the parked item in
`docs/implementation-plan-and-progress-tracker.md`.

Deterministic verification of this contract is a **sanitizer plus unit tests**,
not an LLM check. Note for readers of the phase plan: the plan's "add a
`§VERIFY: extraBody` DAG node between body build and fetch" was **deliberately
not implemented**, and no such node exists. `§VERIFY:` is a CoreExec DAG-node
sentinel (`src/core/coreexec/dispatch.ts`, executed in `src/core/coreexec/worker.ts`)
whose payload names keys to assert on a *preceding task row*; it is not
representable inside a provider adapter's fetch path, and inserting a CoreExec
node there would cross the CoreExec/RouteSwitch module boundary. The substitution
is the deterministic `sanitizeExtraBody()` guard plus the focused unit tests
below, which assert the same thing a pre-fetch gate would: the captured fetch
body. The deviation is deliberate and is recorded in-code next to the sanitizer.

## 3. Time budgets

Two separate budgets exist today:

| Budget | Value | Location | Covers |
|---|---|---|---|
| `OPENAI_COMPAT_TIMEOUT_MS` | `30_000` ms default | `src/core/routeswitch/adapters/openai-compatible.ts` | one provider HTTP call |
| `LLM_TASK_BUDGET_MS` | `120_000` ms | `src/ui/lib/api.ts` | the whole user-facing flow |

`OPENAI_COMPAT_TIMEOUT_MS` is read from the environment
(`Number(process.env.OPENAI_COMPAT_TIMEOUT_MS) || 30_000`). The 30 s default is
kept for Fusion: a Fusion request is **one HTTP call**, not a council fan-out, so
it does not need the per-leg budget that Council Mode sums
(`src/core/routeswitch/council.ts`).

**Decision:** if live measurement shows Fusion p95 above roughly 25 s, set
`OPENAI_COMPAT_TIMEOUT_MS=60000` in the environment rather than changing the
default. The UI budget stays at 120 s, which already covers a 60 s provider call
plus handshake and retry headroom.

This environment knob is deliberately how a constrained-tier edge node and a
high-performance host differ. **No tier-specific value is hardcoded**, and
RouteSwitch does not read the hardware tier to choose a timeout.

Live p50/p95 numbers for this host are **not yet measured** — the live
verification step is still pending operator authorization for outbound provider
calls. Until then, treat the 30 s default as an unvalidated assumption rather
than a measured one.

## 4. Cancellation

The engine owns the `AbortController` for a generation
(`RouteSwitchEngine._executeWithProvider()`); the provider receives only the
signal. The adapter combines the engine signal with its own timeout signal
(`combineSignals()` over `AbortSignal.timeout(...)`), so aborting the parent
aborts the request.

Consequence for Fusion: an in-flight Fusion call is cancellable, and the
FreeLLMAPI adapter must **forward** the stream hooks it receives. It previously
accepted the hooks argument and dropped it, which meant a FreeLLMAPI call could
not be cancelled — that forwarding is part of this change set.

Hook delivery now holds for the **FreeLLMAPI adapter** and the
**OpenAI-compatible base adapter**. `OpenRouterProvider` deliberately passes no
hooks (pre-existing behaviour: it ignores them), so an OpenRouter call is not
cancellable mid-flight through this path. Read the A.5 acceptance criterion as
covering FreeLLMAPI and the base adapter, not every provider type.

A transport timeout is classified as retriable and does **not** mark a provider
exhausted (`isTimeoutError()`; see the fallback loop in `engine.ts`).

## 5. Observability — `X-Routed-Via`

The router returns an `X-Routed-Via` header identifying the upstream that served
the request (`<platform>/<model>`). The adapter captures it into
`GenerationMeta.routedVia`, it surfaces as `RouteResponse.routedVia`
(`src/core/routeswitch/engine.ts`), and the PortGrid provider self-test
(`POST /api/llm/providers/:id/test`, `src/server/routes/llm.ts`, rendered by
`handleTestProvider` in `src/ui/views/RouteSwitchDashboard.tsx`) displays it when
present.

Coverage is not uniform, and that is intentional:

- **Capture** (`X-Routed-Via` → `GenerationMeta.routedVia`) is implemented by the
  OpenAI-compatible base adapter and by the FreeLLMAPI adapter.
- `OpenCodeProvider` and `OpenRouterProvider` deliberately override the metadata
  method *without* capturing the header, because their `auto` model discovery and
  429 rotation must stay on the call path they already own.
- `LlamaCppProvider` and `MockProvider` do not implement the metadata method at
  all.

So `RouteResponse.routedVia` is populated for OpenAI-compatible and FreeLLMAPI
providers **only**. For every other provider type it is simply absent — which is
the normal case below, not a failure.

Rules:

- **Absence is normal.** A non-FreeLLM upstream may not send the header. A
  missing header is never an error and never throws.
- Capture is best-effort observability. It must not change the request path,
  the response content, or the accounting.
- Providers that cannot return metadata keep working:
  `LLMProvider.generateWithMeta?()` is optional, and the self-test route falls
  back to `generate()` when a provider does not implement it.

## 6. Usage accounting rule

**Decision:** the governor counts a Fusion request as **1×**.

Rationale: the only per-request signal the router exposes is `X-Routed-Via`,
which carries `<platform>/<model>` and does **not** expose a panel count. With no
reported panel count there is nothing to multiply by, so the documented rule is:
*governor usage is 1× unless `X-Routed-Via` exposes a panel count.*

Do **not** add a parser for an unspecified panel-count format. If the router
later reports a machine-readable panel count, that becomes a follow-up ticket
with its own format specification.

Council Mode accounting is unchanged: it records
`estimatedTokens × eligible provider count` because NeuroSync runs those legs
itself and therefore knows the number.

## 7. Not in scope

- `/v1/responses` and `/v1/messages` support (chat completions only).
- Any change to Council Mode, its trigger, or its provider filtering.
- Propagating a **per-request** `extraBody` into Council Mode legs. It is inert
  there by design (§1); making it reach a leg is a Council Mode change, not a
  Fusion one. A provider's own durable static `extraBody` already travels with
  its instance — see the coverage section in §2.
- Redesigning the embeddings path, including the separate
  `baseUrl`/`/v1`/`embeddings` URL-building follow-up.
- Selecting or pricing Fusion panels inside NeuroSync.
- Hardware-tier detection feeding these timeouts.

## 8. Verification

Run from the repository root:

```bash
npx tsc --noEmit                 # static types; expect exit code 0
npm run audit:ground-rules       # expect 8/8 checks (includes the raw-egress
                                 # and child-process allowlists)
```

Focused test files covering this contract:

```bash
npx vitest run \
  src/core/routeswitch/adapters/extra-body.test.ts \
  src/core/routeswitch/adapters/streamhooks-regression.test.ts \
  src/core/routeswitch/adapters/opencode-reasoning.test.ts \
  src/core/routeswitch/provider-factory.test.ts \
  src/core/routeswitch/routeswitch.test.ts \
  src/server/routes/llm.test.ts
```

Assertions these must carry: merged body contains the extra field; `model` is
pinned (and absent for `auto`); `messages`/`response_format` survive a hostile
`extraBody`; the sanitizer returns the rejected key names and the request path
logs them.

For the **durable per-provider** path, coverage is per arm, and each arm is
asserted in the file that can actually reach it:

- `src/core/routeswitch/provider-factory.test.ts` — the `openai-compatible`,
  `freellmapi` and `openrouter` arms, each driven end-to-end through
  `instantiateProvider` with a persisted `extraBody` (per-call keys win;
  a persisted `model`/`messages` cannot smuggle past the guard).
- `src/core/routeswitch/adapters/opencode-reasoning.test.ts` — the `opencode`
  arm, also driven end-to-end through `instantiateProvider`. This one lives here
  because the arm throws unless the `opencode_zen_enabled` flag is seeded, and
  this file is the one that calls `initDB()` and seeds it.
- The same `provider-factory.test.ts` also carries a direct-construction check of
  the `opencode` adapter, which asserts the adapter independently of the factory.

A type that cannot carry a persisted value (`llama-cpp`, `mock`) warns by
provider type and by key names, and ignores the value.

Remaining assertions: FreeLLMAPI forwards hooks and abort; `routedVia` is set
when the header is present and absent (no throw) when it is not; usage is 1×
with `extraBody` present; and a Council-Mode-triggered request carrying a
**per-request** `extraBody` puts no extra key on any leg's outgoing request while
still returning a consensus (§1).

The figures above are the **expected** results of those commands, not recorded
run output.

Graph change analysis before any commit (per `AGENTS.md`):

```bash
node .gitnexus/run.cjs detect-changes --scope all --repo .
```

In the current checkout the system `gitnexus` (1.6.3) is older than the index
format, so `impact`/`context`/`detect-changes` fail with a storage-version error
through that path. The working invocation is:

```bash
pnpm --allow-build=@ladybugdb/core --allow-build=gitnexus --allow-build=tree-sitter \
  dlx gitnexus@1.6.12 detect-changes --scope all --repo .
```

Known blast radius for this contract (GitNexus 1.6.12, indexed commit
`7b2a7d9`; these numbers are **read from that prior index run and were not
re-measured for this change set** — treat them as expected, like the figures
above): `_generateWithConfig` upstream impact is **HIGH** (18 symbols,
4 direct callers, 4 processes); `LLMProvider` is **CRITICAL** (58 symbols,
interface-dispatch callers may not be traced, so the real figure may be higher).
