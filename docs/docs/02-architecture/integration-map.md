---
title: "Integration Map"
status: draft
owner: "williamdeldaymarketing"
last_updated: "2026-06-25"
review_cadence: "weekly"
source_of_truth: true
---

# Integration Map

## Outbound Integrations

| Target Service | Protocol | Auth | Purpose | Fallback |
| --- | --- | --- | --- | --- |
| OpenRouter / OpenCode Zen | HTTPS JSON | API Key (User) | Outbound LLM reasoning calls | Local Mock Offline Provider |
| MCP Servers | stdio / HTTP | Token / local | Custom tool execution (e.g. SQLite, Git) | Terminate task with mock error |

## Error Normalization and Quota Gates

- **Free Mode Governor:** The `quota_ledger` tracks token consumption. It includes a **Token & Call Forecasting module**. Before CoreExec fires a DAG, it mathematically forecasts the worst-case scenario for the workflow (e.g., maximum possible nodes * retries). If the forecast breaches the remaining daily quota, the system strictly blocks execution before node 1 starts to prevent halfway-completed, corrupted workflows.
- **Provider Error Normalizer:** Translates multi-provider codes (429 Rate Limit, 402 Insufficient Funds) into unified local exception classes (`NLMRateLimitError`, `NLMBillingError`).
- **Intelligent Rotation & Usage-Based Routing Engine:** RouteSwitch supports a dynamic registry of free API providers (OpenRouter, OpenCode Zen, and generic OpenAI-compatible endpoints), plus local inference via `node-llama-cpp` for GGUF models. It cycles through available free models based on real-time quota tracking, latency, and capability matching.

## Status

Provider adapters for OpenCode Zen and OpenRouter, and real `node-llama-cpp`
inference (previously a stub), landed as part of the 2026-07-01 sprint. The
live-test matrix validating each provider end-to-end with real API keys is
still in progress — see `docs/llm-provider-testing-plan-2026-07-01.md` §4 and
`docs/docs/09-governance/open-questions.md`.
