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
| Human Operator | Workflows, DB, Configs | Read, Write, Execute, Delete | PortGrid cockpit approval click |
| AI Coding Agent | Draft Workspace | Read, Write (draft code/DAG proposals only) | ScopeLogic Boundary — never self-executes |
| CoreExec Service | Database queue | Read, Write (transactional claims) | SQLite `BEGIN IMMEDIATE` driver locks |
| External CLI/coding agent (via terminal) | Project directory only | Full shell, human-launched only | `bwrap` hardened sandbox (`--ro-bind`, single project `--bind`, `--unshare-net`, `--clearenv`) |
| General command execution path | Allowlisted commands only | Execute | `CommandSandbox` allowlist (`src/core/portgrid/sandbox.ts`) |
