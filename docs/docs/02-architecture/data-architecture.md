---
title: "Data Architecture"
status: draft
owner: "williamdeldaymarketing"
last_updated: "2026-07-08"
review_cadence: "weekly"
source_of_truth: true
---

# Data Architecture

## Persistence Layer

SQLite is the exclusive database of record (`better-sqlite3`, WAL mode,
`sqlite-vec` extension for vector search). Single file at
`.data/neurosync.db`. Schema migrations are handled in-script with idempotent
`ALTER TABLE ... ADD COLUMN` retries in `src/core/basevault/db.ts`. Tests
never touch this file — a private `:memory:` DB is used when
`process.env.VITEST` is set (see `docs/docs/06-quality/test-strategy.md`).

## Tables (as of 2026-07-08, `src/core/basevault/db.ts`)

| Table | Purpose |
| --- | --- |
| `projects` | `id`, `name`, `workspace_path`, `created_at` — the project isolation boundary. |
| `workflows` | Saved DAG templates + optional `cron_schedule`. |
| `workflow_runs` | One row per execution: `dag_layout` (JSON snapshot), `status`. |
| `tasks` | Individual DAG nodes: `run_id`, `status`, `claim_lease`, `output_data`. |
| `os_todos` | Todo/proposal items, including `confidence` (numeric, drives the Deference UI). |
| `cerebro_memories_meta` / `cerebro_memories_vec` | Memory metadata + vector embeddings for semantic recall. |
| `cerebro_learning_approvals` | Human approvals for learned facts. |
| `cerebro_prune_log` | Record of memory decay/pruning actions. |
| `system_settings` | Global config, including Developer Mode toggle. |
| `dag_proposals` | Draft-only ScopeLogic output pending human approval. |
| `model_benchmarks` / `discovered_models` | RouteSwitch model performance and discovery data. |
| `llm_providers` / `llm_routing_rules` | Provider registry and routing policy, including `is_paid_tier`. |
| `okf_nodes` / `okf_edges` | OKF semantic concept graph. |
| `scout_okf_nodes` | ScoutDaemon's OKF scan results. |

## Deep Dive Research

- [SQLite 5-Tier Architecture Design](sqlite-5-tier-design.md)
- [Methodologies for Optimizing Local SQLite Vector Retrieval](sqlite-vector-retrieval.md)
