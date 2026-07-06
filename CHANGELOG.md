# Changelog

All notable changes to this project are documented here. Format loosely
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning
follows [Semantic Versioning](https://semver.org/) with alpha/beta pre-release
suffixes while the project stabilizes toward a 1.0 release.

## [1.0.0-alpha.1] — Unreleased

First public Alpha. NeuroSync Sovereign OS is a local-first, privacy-first AI
project orchestrator — one Node.js server (Hono + `better-sqlite3` WAL) + one
React/Vite dashboard, six modules:

- **PortGrid** — capability/tool governance, Zero-Trust HITL approval queue,
  plus a real embedded terminal (hardened `bwrap` sandbox) for external coding
  agents.
- **ScopeLogic** — guided interview engine (the "Bounded Interview Pipeline")
  turning a request into a DAG workflow proposal.
- **RouteSwitch** — LLM provider registry, fallback chains, Council/consensus
  mode, model selector. Supports Mock (offline), OpenCode Zen, OpenRouter,
  generic OpenAI-compatible endpoints, and local `llama-cpp` (GGUF) inference.
- **BaseVault** — SQLite data layer, backups, redaction/data-tier settings.
- **CoreExec** — DAG workflow engine, scheduler, cron jobs, autonomy dials.
- **ScoutDaemon** — idle-time background research, hardware monitoring, OKF
  scanning.

Notable fixes rolled into this first release:

- Numeric-confidence "Deference UI" (auto-approve above 0.70, manual review
  below), replacing an earlier High/Medium/Low enum.
- A real tri-modal Context Router (OKF curated-knowledge graph + GitNexus code
  structure + Cerebro conversational memory), scoped per active project end to
  end — including a fix for a bug where ScopeLogic's interview and Cerebro
  chat could receive no project context at all, and a fix for cross-project
  memory isolation in the Cerebro vector store.
- Real `node-llama-cpp` local inference (previously a stub), OpenCode Zen and
  OpenRouter promoted to first-class provider types with live dynamic
  free-model discovery.
- CoreExec/PortGrid backend split into separate directories while keeping
  their dashboards permanently separate per project convention.

**Known limitations for this Alpha:**

- The live-provider test matrix (Cerebro chat, OKF conversion, DAG generation,
  Council Mode, fallback/rate-limit handling across all provider types) is not
  yet fully exercised with real API keys — see
  `docs/llm-provider-testing-plan-2026-07-01.md` for the open test plan.
- No token streaming anywhere in the system yet (all LLM calls are
  request/response).
- CPU-only local `llama-cpp` inference is slow (multi-minute for
  grammar-constrained generation) without a configured GPU.
