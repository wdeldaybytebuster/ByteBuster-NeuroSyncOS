**Document Summary: Runbook**

- **Manual Database Backup:** Export database using SQLite command:
  ```bash
  sqlite3 basevault.db ".backup backup.db"
  ```
- **Clear Stale Leases:** In event of hard crash, run CLI command:
  ```bash
  nlm queue reset-leases
  ```
- **Introspective Migrations:** Run migrations command to upgrade/verify tables safely:
  ```bash
  nlm migrate up
  ```

===

<!-- Append-only log of changes managed by BaseVault -->
