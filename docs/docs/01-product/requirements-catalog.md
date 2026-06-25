---
title: "Requirements Catalog"
status: draft
owner: "williamdeldaymarketing"
last_updated: "2026-06-25"
review_cadence: "weekly"
source_of_truth: true
---

# Requirements Catalog

## Functional Requirements

- **FR-001:** Single-user multi-project workspace isolation using `project_id`.
- **FR-002:** Asynchronous transactional Directed Acyclic Graph (DAG) execution engine (CoreExec).
- **FR-003:** Local SQLite persistence with WAL mode and `BEGIN IMMEDIATE` task locking (BaseVault).
- **FR-004:** Requirements-gathering interview loops producing draft-only DAG proposals.
- **FR-005:** Human-in-the-loop validation UI cockpits (PortGrid).
- **FR-006:** Free-tier model routing with a mock routing fallback cascade (RouteSwitch). Includes a Free Mode Governor Token & Call Forecasting module to pre-validate DAG quotas, and an Intelligent Rotation & Usage-Based Routing Engine for dynamic free-tier provider switching.

## Non-Functional Requirements

- **NFR-001:** 100% offline execution capability with zero default cloud dependencies.
- **NFR-002:** Minimal systemic footprint running on legacy 6-year-old consumer hardware.
- **NFR-003:** Strict compliance with Safety Boundary Assertions (SA-01 to SA-06).

## Data Requirements

- **DR-001:** Metadata and run states stored locally in a single SQLite file.
- **DR-002:** Memory nodes decaying over time with local keyword indexing.
- **DR-003:** Plaintext API keys must never be persisted in databases or logs.

## Implementation Log Rollup (2026-06-26)

- [2026-06-25] Implemented Functional Requirements FR-002 (CoreExec DAG), FR-003 (BaseVault WAL/claims), FR-004 (ScopeLogic Draft DAG), and FR-005 (PortGrid React UI).
