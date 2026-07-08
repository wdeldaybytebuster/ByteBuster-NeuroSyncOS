---
title: "Environment Config"
status: draft
owner: "williamdeldaymarketing"
last_updated: "2026-07-08"
review_cadence: "weekly"
source_of_truth: true
---

# Environment Config

## Local-First Environment Setup

Configuration lives in a `.env` file (copy from `.env.example` at the repo
root — never commit `.env`). Real variables, verified against
`.env.example`:

- **`NEUROSYNC_PORT`** — Hono backend port (default `3743`; the frontend
  expects this exact value).
- **`NEUROSYNC_LLM_BASE_URL`** — base URL of any OpenAI-compatible endpoint
  (OpenRouter, OpenCode Zen, a local Ollama-style proxy, etc).
- **`NEUROSYNC_LLM_API_KEY`** — optional, only required if the endpoint
  checks `Authorization`.
- **`NEUROSYNC_LLM_MODEL`** — model ID, or `auto` to let the endpoint choose.

Runtime data lives in `.data/` (gitignored): `.data/neurosync.db` (SQLite,
WAL mode) and `.data/.master.key`. There is no `config.toml` and no
`PORTGRID_PORT` — those were placeholder names from an earlier planning pass.
