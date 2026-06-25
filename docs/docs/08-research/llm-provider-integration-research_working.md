**Document Summary: LLM Provider & Local Integration Research**

Deep research covering RouteSwitch integration strategy for local GGUF models (node-llama-cpp), OpenRouter, OpenCode Zen, custom OpenAI-compatible endpoints (including FreeLLMAPI Auto routing), and OAuth flows for Gemini, Claude, Grok, and Meta. Source of truth for all provider decisions.

- Owner: `williamdeldaymarketing`
- Status: `draft`
- Last Updated: `2026-06-25`

===

<!-- Append-only log of changes managed by BaseVault -->
- [2026-06-25] Created. Full deep research on all LLM provider integrations. FreeLLMAPI Auto routing added as primary proxy strategy.

---

# Deep Research: LLM Provider Integrations & Local Execution

This document outlines the architecture and integration strategy for RouteSwitch, detailing how NeuroSync Sovereign OS will connect to local models, API gateways, custom OpenAI endpoints, and major provider OAuth flows.

## 1. Local LLM Execution via GGUF (node-llama-cpp)

To run models 100% locally on the user's hardware without internet access, we will use **node-llama-cpp**.
- **Format:** Supports HuggingFace GGUF models (e.g., Llama-3, Mistral, Qwen).
- **Setup:**
  - Users place `.gguf` files in a designated local directory (e.g., `~/.neurosync/models/`).
  - The system loads the model using `getLlama().loadModel({ modelPath: "..." })`.
  - **Hardware Acceleration:** Automatically handles Metal (Mac) and CUDA/Vulkan (Windows/Linux) if C++ build tools are present.
- **Options Exposed to User:**
  - `context_size`: Set memory limits (e.g., 4096, 8192).
  - `gpu_layers`: Number of layers to offload to GPU vs CPU.
  - `temperature` / `top_p` for generation parameters.
- **JSON Schema:** Crucial for CoreExec DAG execution, `node-llama-cpp` can natively enforce strict JSON schemas on the output, ensuring the pipeline never breaks.

## 2. API Gateways (OpenRouter & OpenCode Zen)

API Gateways provide single-key access to hundreds of models, simplifying billing.
- **OpenRouter:**
  - **Setup:** User inputs their `sk-or-...` key. Base URL is `https://openrouter.ai/api/v1`.
  - **OAuth PKCE Flow:** For seamless login, we can implement "Login with OpenRouter". Redirect users to `https://openrouter.ai/auth?callback_url=...` to fetch API keys automatically without manual copy-pasting.
- **OpenCode Zen:**
  - **Setup:** Acts as a curated AI gateway. The Base URL is `https://opencode.ai/zen/v1`.
  - It uses standard OpenAI-compatible SDK calls. The user simply provides their OpenCode Zen API key.

## 3. OpenAI-Compatible Custom Endpoints

To future-proof the system, RouteSwitch will include a **"Custom OpenAI Compatible"** generic provider.
- Any provider that mimics the OpenAI API format (e.g., FreeLLMAPI, LM Studio, Ollama, Together.ai, vLLM, Groq) can be added here.
- **Fields required:**
  - `Base URL` (e.g., `http://localhost:1234/v1` for LM Studio, or your local/remote FreeLLMAPI endpoint)
  - `API Key` (optional for local, required for remote)
  - `Model ID` (String name of the model. **Crucially, this supports an 'Auto' setting**).
- **FreeLLMAPI Integration:** 
  - FreeLLMAPI acts as a local proxy aggregating the free tiers of multiple providers (Groq, Gemini, NVIDIA, etc.) behind a single `/v1` endpoint. 
  - By setting the `Model ID` to `Auto` in NeuroSync, the routing payload delegates model selection to FreeLLMAPI's internal smart routing and failover logic, ensuring maximum uptime across the ~1.7B monthly free tokens available without requiring the user to manually switch models when one rate-limits.

## 4. Direct OAuth Integrations (Gemini, Claude, Grok, Meta)

For users who want to use native provider accounts (free tiers or direct paid subscriptions), we will implement direct OAuth 2.0 flows.

### Google Gemini (Google Cloud / AI Studio)
- **OAuth Scope:** `https://www.googleapis.com/auth/generative-language.retriever`
- **Setup:** Standard Google OAuth login. Exchanges code for refresh tokens. Free tier is generous (15 RPM for Flash models).

### Anthropic Claude
- Anthropic currently primarily uses API keys. However, via Google Cloud Vertex AI or AWS Bedrock, enterprise OAuth/IAM can be used. For consumer apps, we will prompt for the `ANTHROPIC_API_KEY` directly until a consumer OAuth scope is stabilized.

### xAI Grok
- Grok API is accessed via X.com Developer Platform. OAuth 2.0 PKCE flow is supported via Twitter/X login.
- **Scopes:** `tweet.read`, `users.read` (standard), plus custom API access tokens. 

### Meta Llama (via Providers)
- Meta does not host its own retail API for Llama 3. Access must be routed through:
  1. Local GGUF execution.
  2. OpenRouter / OpenCode Zen.
  3. Cloud providers (AWS, Groq, Together.ai).

## Conclusion & Integration Plan

RouteSwitch will present users with a UI matrix:
1. **Local Mode:** Select a `.gguf` file. (100% private, free).
2. **Aggregator Mode:** "Login with OpenRouter" or input OpenCode Zen key. (Pay-as-you-go).
3. **Custom Provider:** Input generic Base URL + Key. Extremely useful for proxies like **FreeLLMAPI** (using the `Auto` Model ID for smart failover) or local servers like LM Studio.
4. **Direct Provider:** "Sign in with Google" for Gemini Free Tier access.
