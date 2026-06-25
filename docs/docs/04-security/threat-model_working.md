**Document Summary: Threat Model**

- **Asset 1: User Database (SQLite):** Contains runs and local memory. Threat: Unauthorized local read/write. Mitigation: Directory permissions and project isolation.
- **Asset 2: Provider Keys:** Placed in local environment config. Threat: Exfiltration in LLM prompts or logs. Mitigation: Redaction filters and strict RouteSwitch validation.
- **Asset 3: Execution Context:** Untrusted third-party code. Threat: Sandbox escape during code execution. Mitigation: Strict seccomp profiles, read-only root filesystems, and human approval gates.

===

<!-- Append-only log of changes managed by BaseVault -->
