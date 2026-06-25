**Document Summary: Incident Response Plan**

- **Severity 1 (Critical):** Data leak between workspaces, sandbox escape, or credential exposure. Action: Instantly kill background processes and disconnect network namespace.
- **Severity 2 (High):** Task concurrency deadlock or CoreExec queue failure. Action: Re-run introspective migrations and clear SQLite locks.
- **Severity 3 (Medium):** Local UI rendering error or mock routing fallback failure. Action: Log and fix in next patch release.

===

<!-- Append-only log of changes managed by BaseVault -->
