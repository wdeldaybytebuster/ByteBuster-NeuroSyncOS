---
title: "Access Control Matrix"
status: draft
owner: "williamdeldaymarketing"
last_updated: "2026-06-25"
review_cadence: "weekly"
source_of_truth: true
---

# Access Control Matrix

## Access Controls

| Role | Target Resource | Allowed Actions | Enforcement Point |
| --- | --- | --- | --- |
| Human Operator | Workflows, DB, Configs | Read, Write, Execute, Delete | PortGrid cockpit validation |
| AI Coding Agent | Draft Workspace | Read, Write (draft code blocks only) | ScopeLogic Boundary |
| CoreExec Service | Database queue | Read, Write (transactional claims) | SQLite database driver |
