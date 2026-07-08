---
title: "Architecture Blueprint"
status: draft
owner: "williamdeldaymarketing"
last_updated: "2026-07-08"
review_cadence: "weekly"
source_of_truth: true
---

# Architecture Blueprint

## System Overview

NeuroSync Sovereign OS is a single-repository, single-process system: one
Vite + React 19 frontend (`src/ui`, entry `src/ui/main.tsx`) talks to one Hono
Node.js server (`src/server/index.ts`, port `3743`), which fans commands out
to the six modules sharing one SQLite database (`better-sqlite3`, WAL mode,
`sqlite-vec` loaded for vector search) at `.data/neurosync.db`. Requires
Node.js 22 LTS or newer (see `docs/docs/09-governance/dependency-register.md`
— there is no Next.js frontend anywhere in this project, and no Node 24
requirement).

## Architectural Subsystems

1. **PortGrid** (`src/core/portgrid/`, `src/ui/views/PortGridDashboard.tsx`):
   capability/tool governance, Zero-Trust HITL approval queue, and a real
   embedded terminal (hardened `bwrap` sandbox) for external coding agents.
   Permanently a separate dashboard from CoreExec.
2. **CoreExec** (`src/core/coreexec/`): asynchronous, durable DAG task
   executor using `BEGIN IMMEDIATE` SQLite transaction locks, `node-cron`
   scheduling, and `resumeInProgressRuns()` crash recovery on boot.
3. **BaseVault** (`src/core/basevault/`): SQLite schema, migrations
   (idempotent `ALTER TABLE ... ADD COLUMN`), backups, and the
   `SensitiveDataRedactor` three-tier redaction pipeline.
4. **RouteSwitch** (`src/core/routeswitch/`): multi-provider LLM routing,
   fallback cascades, council/consensus mode, model selector, and the Free
   Mode Governor (paid-provider lock, per-provider `is_paid_tier` +
   global unlock).
5. **ScopeLogic** (`src/core/scopelogic/`): bounded interview loop producing
   draft-only DAG proposals with numeric confidence scores.
6. **ScoutDaemon** (`src/core/scoutdaemon/`): idle-time background research
   and OKF (concept graph) scanning, gated by a real idle detector and pushed
   to the UI over SSE (`scoutEmitter`).
7. **Memory / Cerebro** (`src/core/memory/`): tri-modal memory (OKF semantic
   graph + GitNexus AST + knowledge graph) behind a Context Router that picks
   the right store per query; habituation scoring for decay.

`sqlite-vec` and other heavy semantic-search work run off the main HTTP
event loop where practical, so the control plane stays responsive.
