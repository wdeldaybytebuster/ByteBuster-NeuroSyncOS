**SUMMARY OF ORIGINAL DOCUMENT (ai-workflow-rules.md):**
Operating rules for AI agents working on NeuroSync Sovereign OS. Spec-driven, incremental workflow. Required behavior: read context files first, one unit at a time, existing patterns first, record gaps not invent behavior. Scoping rules: no combined UI+DB or security+feature changes. Missing requirement escalation to progress-tracker. Protected files list. Verification checklist before completion. Documentation sync triggers. Documentation immutability & _working copy protocol. GitNexus mandatory workflow (PHASE 1–5: index verify, reconnaissance, blast radius, execution, post-edit validation). System resource rules for Chromebook hardware.

===

<!-- Append-only log of changes — newest first -->

**Date:** 2026-06-26
**Agent:** Doc Agent (Documentation Audit)

- ADDED: DAG Execution Rules section with 5 rules:
  1. Draft-Only Proposals — ScopeLogicSession always produces status: 'draft'
  2. Validator Gate is Mandatory — both cron and interactive paths must call validateDAGTemplate/validateDAGProposal
  3. Reserved Labels Are Off-Limits — 7 labels, both server and client enforcement
  4. Escalation is FK-Safe — use escalateBlockedDAGToOsTodos() only, within db.transaction()
  5. Retry re-validates — POST /api/coreexec/retry/:runId runs validateDAGTemplate on dag_layout
- ADDED: GitNexus current index status (1358 symbols, 2205 relationships, commit df328cb, up-to-date 2026-06-26).
- ADDED: High-Risk Symbols list (executeRun, validateDAGProposal, partitionBySchema, FreeModeGovernor.recordUsage, scoutEmitter.emit, db.transaction in escalateBlockedDAGToOsTodos, WorkflowRunSchema/TaskSchema).
- UPDATED: Verification checklist now includes gitnexus_detect_changes as mandatory pre-commit step.
- NO CONFLICTS: All pre-existing GitNexus workflow rules (PHASE 1–5) confirmed accurate.
- Transitioning to Phase 13 (Free-tier testing).
