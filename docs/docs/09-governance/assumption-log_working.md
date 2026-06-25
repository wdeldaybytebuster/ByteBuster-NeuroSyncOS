**Document Summary: Assumption Log**

- **AL-001: Free model availability:** Assumes OpenRouter free tier is reachable. Validation: Offline Mock fallback is implemented.
- **AL-002: Single-user concurrency limit:** Assumes no concurrent HTTP writes from multiple operators. Validation: Single SQLite file control plane is sufficient.

===

<!-- Append-only log of changes managed by BaseVault -->
