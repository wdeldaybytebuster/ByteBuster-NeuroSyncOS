**Document Summary: Architecture Blueprint**

NeuroSync Sovereign OS is designed around a single-repository, single-process architectural layout to prevent dependency bloat and microservice drift. It runs entirely on the operator's local machine, utilizing pure Node.js 22 LTS for backend services, Hono for API routing, and SQLite in WAL mode for transactional persistence. Any Rust, Tauri, or alternative runtime (e.g. Node v24.16.0) is strictly prohibited in Phase 1 and relegated to a future V2 phase.

===

<!-- Append-only log of changes managed by BaseVault -->
