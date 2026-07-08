---
title: "Dependency Register"
status: draft
owner: "williamdeldaymarketing"
last_updated: "2026-07-08"
review_cadence: "weekly"
source_of_truth: true
---

# Dependency Register

## System Dependencies

- **Runtime:** Node.js 22 LTS or newer (per README/CONTRIBUTING). Node 24 is
  explicitly **not** required — an earlier planning doc claimed `>= v24.0.0`;
  that was wrong and has been corrected here.
- **Core modules:** Hono, `better-sqlite3` (+ `sqlite-vec` extension), Zod,
  Pino, `node-cron`, `node-llama-cpp` (local GGUF inference).
- **UI modules:** React 19, Vite, `@xyflow/react` (DAG visualization),
  Tailwind. **Not** Next.js — an earlier planning doc claimed Next.js; there
  is no Next.js anywhere in this project.
- **Sandbox/terminal:** `node-pty`, `@hono/node-ws`, `@xterm/xterm` (all
  pre-approved free/MIT-Apache packages for the embedded terminal feature).
- **Integrations:** OpenRouter, OpenCode Zen, and any generic
  OpenAI-compatible endpoint (see `.env.example`).
- **Policy:** no paid libraries, no external databases — see
  `docs/docs/03-engineering/dependency-policy.md`.
