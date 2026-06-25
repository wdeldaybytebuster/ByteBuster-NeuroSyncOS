**Document Summary: Security Privacy Model**

NeuroSync Sovereign OS adopts an **"Assume Breach"** security stance:
- **Local-First Control Plane:** All workflows, runs, memory, and database configurations live locally on the operator's disk.
- **Human approval boundary:** AI engines function strictly as draft-only recommenders; they cannot write to the database or trigger task runs autonomously.
- **Token Redaction:** Pino logs and database records automatically redact sensitive variables, credentials, and API keys before writing to disk.

===

<!-- Append-only log of changes managed by BaseVault -->
