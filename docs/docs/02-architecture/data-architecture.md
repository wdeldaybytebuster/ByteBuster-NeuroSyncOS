---
title: "Data Architecture"
status: draft
owner: "williamdeldaymarketing"
last_updated: "2026-06-25"
review_cadence: "weekly"
source_of_truth: true
---

# Data Architecture

## Persistence Layer

SQLite is the exclusive database of record. Configured in Write-Ahead Logging (WAL) mode, it handles concurrent read-write access smoothly within a single process.

## Schema Definitions

### Table: `projects`
- `id` (TEXT, PK): Unique project identifier.
- `name` (TEXT): Project display name.
- `created_at` (INTEGER): Epoch timestamp.

### Table: `workflow_runs`
- `id` (TEXT, PK): Run identifier.
- `project_id` (TEXT, FK): Scoped project reference.
- `dag_layout` (TEXT): JSON dump of the DAG template snapshot.
- `status` (TEXT): `pending`, `running`, `completed`, `failed`.
- `created_at` (INTEGER): Timestamp.

### Table: `tasks`
- `id` (TEXT, PK): Task identifier.
- `run_id` (TEXT, FK): Associated run.
- `status` (TEXT): `unclaimed`, `claimed`, `completed`, `failed`.
- `claim_lease` (INTEGER): Lease expiration timestamp.
- `output_data` (TEXT): Redacted JSON payload.

## Deep Dive Research

- [SQLite 5-Tier Architecture Design](sqlite-5-tier-design.md)
- [Methodologies for Optimizing Local SQLite Vector Retrieval](sqlite-vector-retrieval.md)
