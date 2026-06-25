**Document Summary: Access Control Matrix**

| Role | Target Resource | Allowed Actions | Enforcement Point |
| --- | --- | --- | --- |
| Human Operator | Workflows, DB, Configs | Read, Write, Execute, Delete | PortGrid cockpit validation |
| AI Coding Agent | Draft Workspace | Read, Write (draft code blocks only) | ScopeLogic Boundary |
| CoreExec Service | Database queue | Read, Write (transactional claims) | SQLite database driver |

===

<!-- Append-only log of changes managed by BaseVault -->
