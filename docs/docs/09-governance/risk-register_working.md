**Document Summary: Risk Register**

- **RR-001: Multi-project context leak.** Impact: Critical. Mitigation: Restrict memory retrieval using query isolation by `project_id`.
- **RR-002: SQLite transaction lock busy errors.** Impact: High. Mitigation: Enforce `BEGIN IMMEDIATE` on every CoreExec write lock request.
- **RR-003: Model key theft by rogue dependencies.** Impact: Critical. Mitigation: Automatic Console/Pino redaction layers.

===

<!-- Append-only log of changes managed by BaseVault -->
