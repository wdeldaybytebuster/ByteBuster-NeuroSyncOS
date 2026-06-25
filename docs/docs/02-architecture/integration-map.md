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
- **Intelligent Rotation & Usage-Based Routing Engine:** RouteSwitch is engineered to support a dynamic, expansive registry of free API providers. It automatically cycles through available free models based on real-time quota tracking, latency, and capability matching to ensure high availability as free-tier limits are quickly exhausted. Continuous discovery and registration of new free models will populate the RouteSwitch backlog.

## Implementation Log Rollup (2026-06-26)

- [2026-06-25] Expanded LLM Integration Strategy: Documented local GGUF execution via `node-llama-cpp`, generic OpenAI-compatible custom endpoint support, OpenRouter/OpenCode Zen API gateways, and direct OAuth integrations for Gemini/Grok/Claude. Research document created at `docs/docs/08-research/llm-provider-integration-research_working.md` to feed NotebookLM.
