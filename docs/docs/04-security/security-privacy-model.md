---
title: "Security Privacy Model"
status: draft
owner: "williamdeldaymarketing"
last_updated: "2026-06-25"
review_cadence: "weekly"
source_of_truth: true
---

# Security Privacy Model

## Security Posture

NeuroSync Sovereign OS adopts an **"Assume Breach"** security stance:
- **Local-First Control Plane:** All workflows, runs, memory, and database configurations live locally on the operator's disk. No external databases, no paid libraries.
- **Human approval boundary:** AI engines function strictly as draft-only recommenders; they cannot write to the database or trigger task runs autonomously.
- **Token Redaction:** Pino logs and database records automatically redact sensitive variables, credentials, and API keys before writing to disk (`SensitiveDataRedactor`, three tiers: Public, Internal, Confidential).

## Sandbox Assertions (SA-01–SA-06)

Enforced on any DAG proposal or tool call before it can be presented for
human approval:

- **SA-01/SA-02:** no unauthorized SQL (`INSERT`/`UPDATE`) or raw executable
  code blocks in a proposal.
- **SA-03:** `validationPassed` must come from an independent validator
  check, never a self-reported AI claim.
- **SA-04/SA-05:** no unauthorized node types (`shell`, `exec`) and no
  unresolved agent IDs.
- **SA-06:** the general command-execution path must go through the
  `CommandSandbox` allowlist (`src/core/portgrid/sandbox.ts`) — no shell
  escape hatches. Current allowlist (22 commands): `ls`, `cat`, `grep`,
  `pwd`, `diff`, `find`, `head`, `tail`, `wc`, `sort`, `uniq`, `stat`, `file`,
  `du`, `df`, `lsblk`, `lscpu`, `uname`, `whoami`, `date`, `python`,
  `python3` (the last two authorized explicitly for Scrapling/Cloak
  support). Commands run inside `bwrap --unshare-net`, locked to the
  project's resolved working directory (CWD lock, path-traversal
  protection).

**One deliberate, informed exception:** PortGrid's embedded terminal
(`src/core/portgrid/terminal-session.ts`) is a full unrestricted interactive
shell, explicitly approved by the project owner, sandboxed instead by
directory+network containment via a hardened `bwrap` recipe. It is
human-only-launched — never auto-opened by an agent — and does not license
dropping the allowlist anywhere else.
