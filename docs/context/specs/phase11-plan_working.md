# Phase 11: RouteSwitch Inference Engine

## Objectives
Implement a 100% free-to-build, zero-bloat Node.js LLM abstraction layer that auto-discovers models and seamlessly routes traffic based on real-time free-tier token limits to prevent system crashes.

## Background & Design Decision
This phase was driven by user research into LLM and API integration options. The key requirement was that:
- Users should NOT need to manually input exact model names or context window sizes.
- Model population must be **automatic** — dynamically pulled from provider endpoints on boot.
- Routing must be **intelligent** — transparently shifting between providers when free-tier token limits are depleted.
- Zero provider integration costs at setup time (no paid MCP intermediaries).

The solution uses OpenRouter's free `/v1/models` endpoint as the discovery source, combined with parsing provider-standard rate-limit response headers for live telemetry.

## Execution Strategy

### Task 1: Auto-Discovery Module
- **File:** `src/core/routeswitch/discovery.ts` ✅
- **Goal:** Implement logic to query provider endpoints (`GET /v1/models`) on boot to map available models and their context limits dynamically. Ensure we don't hardcode context sizes.
- **Details:** Cache the list in memory. Expose a unified list of models back to the UI.
- **Status:** COMPLETE — `ModelDiscovery` class queries OpenRouter's live `/v1/models` endpoint, caches the result in-process, and exposes the unified list via the backend API.

### Task 2: Telemetry Interceptor & State Manager
- **File:** `src/core/routeswitch/interceptor.ts` ✅
- **Goal:** Intercept responses to read ratelimit headers (e.g., `x-ratelimit-remaining-tokens`, `anthropic-ratelimit-tokens-remaining`).
- **Details:** Keep an in-memory dictionary tracking the "health" and remaining tokens of each provider. If a provider's remaining tokens drop below a safety threshold (e.g., `< 1000 tokens`), mark it as `temporarily_exhausted`. Use the `-reset` header to automatically flip it back to `available` after a cooldown.
- **Status:** COMPLETE — `ProviderHealthState` tracks per-provider remaining tokens. Safety threshold is 1,500 tokens. Auto-reset on cooldown via `-reset` header parsing.

### Task 3: Fallback Router Logic
- **File:** `src/core/routeswitch/router.ts` ✅
- **Goal:** Combine Discovery and Interceptor states to route requests.
- **Details:** Take an array of preferred models (e.g., `["groq:llama-3", "google:gemini-1.5"]`). Check the Interceptor state for the primary model. If it's exhausted, seamlessly transparently route the request to the secondary model. Wrap this in the standard `opossum` Circuit Breaker pattern.
- **Status:** COMPLETE — `FallbackRouter` implements `executeWithFallback()`. Walks the fallback chain in order; if a provider's `ProviderHealthState` is `temporarily_exhausted`, it skips to the next. Integration tests confirm transparent handoff.

### Task 4: UI Integration (Settings)
- **File:** `src/ui/components/RouteSwitchConfig.tsx` ✅
- **Goal:** Let the user define their fallback chains visually. The dropdowns should populate from the Discovery module automatically.
- **Status:** COMPLETE — `RouteSwitchConfig.tsx` integrated into `SettingsModal.tsx`. Dropdowns auto-populate from `GET /api/models` (backed by Discovery module). Users can define Primary, Fallback 1, and Fallback 2 chains visually without typing model names.

### Task 5: Integration Testing
- **File:** `src/core/routeswitch/router.test.ts` ✅
- **Goal:** Mock a provider returning low `x-ratelimit-remaining-tokens` and mathematically prove the Router transparently falls back to the secondary model on the next request.
- **Status:** COMPLETE — Test mocks Groq API returning `x-ratelimit-remaining-tokens: 500`. Verified that `ProviderHealthState` flags the model as `temporarily_exhausted` and the next request is instantly handed off to the fallback model.

## Checkpoint Logs

| Date | Task | Description | File Verified |
|------|------|-------------|---------------|
| 2026-06-25 | Task 1 | Created `ModelDiscovery` class. Queries OpenRouter's `/v1/models` endpoint on boot. Result cached in-process. Exposes unified list via `GET /api/models`. | `src/core/routeswitch/discovery.ts` ✅ |
| 2026-06-25 | Task 2 | Created `ProviderHealthState` telemetry interceptor. Parses `x-ratelimit-remaining-tokens` and `anthropic-ratelimit-tokens-remaining` headers. Auto-resets on cooldown. Safety threshold: 1,500 tokens. | `src/core/routeswitch/interceptor.ts` ✅ |
| 2026-06-25 | Task 3 | Created `FallbackRouter` with `executeWithFallback()`. Transparent provider failover with Circuit Breaker pattern. `src/server/routes/models.ts` created as companion API route. | `src/core/routeswitch/router.ts` ✅ |
| 2026-06-25 | Task 4 | Created `RouteSwitchConfig.tsx` with auto-populating dropdowns and fallback chain builder. Integrated into `SettingsModal.tsx`. Backend companion route: `src/server/routes/models.ts`. | `src/ui/components/RouteSwitchConfig.tsx` ✅ |
| 2026-06-25 | Task 5 | Created `router.test.ts`. Mocked provider exhaustion scenario. Mathematically proved transparent fallback handoff. All assertions pass. | `src/core/routeswitch/router.test.ts` ✅ |
| 2026-06-25 | ALL | **Phase 11 100% COMPLETE.** Zero-cost auto-discovering intelligent fallback router is fully operational. No manual model configuration required by the user. | All files ✅ |

---
*Last audited: 2026-06-25 by Documentation Auditor Subagent*
