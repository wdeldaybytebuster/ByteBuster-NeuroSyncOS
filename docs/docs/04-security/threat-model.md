---
title: "Threat Model"
status: draft
owner: "williamdeldaymarketing"
last_updated: "2026-06-25"
review_cadence: "weekly"
source_of_truth: true
---

# Threat Model

## Asset Boundaries and Threats

- **Asset 1: User Database (SQLite):** Contains runs and local memory. Threat: Unauthorized local read/write. Mitigation: Directory permissions and project isolation.
- **Asset 2: Provider Keys:** Placed in local environment config. Threat: Exfiltration in LLM prompts or logs. Mitigation: Redaction filters and strict RouteSwitch validation.
- **Asset 3: Execution Context:** Untrusted third-party code/tool calls. Threat: Sandbox escape. Mitigation: `CommandSandbox` allowlist for the general path, plus human approval gates before any DAG proposal can run.
- **Asset 4: Embedded terminal (PortGrid only):** A deliberately unrestricted shell for external coding agents. Threat: filesystem/network escape from a full shell. Mitigation: hardened `bwrap` sandbox (`--ro-bind`, single project `--bind`, `--unshare-net`, `--clearenv`), human-only-launched, never auto-opened by an agent.
