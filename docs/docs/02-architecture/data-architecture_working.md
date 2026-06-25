**Document Summary: Data Architecture**

SQLite is the exclusive database of record. Configured in Write-Ahead Logging (WAL) mode, it handles concurrent read-write access smoothly within a single process.

===

<!-- Append-only log of changes managed by BaseVault -->
