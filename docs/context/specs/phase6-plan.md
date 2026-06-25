# Implementation Plan: PortGrid Phase 6 — Zero-Trust Security & UI

## Overview

Phase 6 hardens the NeuroSync Sovereign OS to prevent "AI Brain Fry" and mitigate unauthorized execution. We implement a lightweight push-based ingestion system for the UI, dynamic UI approval tiers based on task risk, strict bash command sandboxing, and Argon2id credential hashing.

## Phase 6 Task List

### Unit 27: Push-Based Ingestion (SSE ScoutDaemon)
**Goal:** Transition the PortGrid UI from HTTP polling to Server-Sent Events (SSE) to preserve the single-threaded event loop on legacy hardware.
- Build the `ScoutDaemon` SSE route in the Hono API gateway (`/api/scout/events`).
- Stream real-time node execution status and reasoning directly to the React canvas.
- Remove high-frequency `setInterval` polling from `App.tsx` and replace it with an `EventSource` subscriber.

### Unit 28: Sensory Attenuation UI Approvals
**Goal:** Implement tiered approval UI components based on the Sensory Attenuation Model of Fatigue (SAF).
- Modify the existing DAG approval flow to categorize tasks into 3 tiers:
  - **Low Risk** (Read-only): Batch approvals permitted, visually quiet UI.
  - **Medium Risk** (Code changes): Requires Modal confirmation displaying a delta diff.
  - **High Risk** (Network/Filesystem destructive): Renders the "Executive Cockpit" alert requiring a mandatory explicit signature to execute.
- Implement Local Proof Badges (`Local Only`, `Human Approved`, `Redacted`).

### Unit 29: Zero-Trust Command Sandbox & Authentication
**Goal:** Apply "Assume Breach" mitigation for command execution and strict credential hashing.
- Build the `CommandSandbox` utility wrapping Node.js `child_process`.
- Enforce a strict 20-command allowlist (e.g., `ls`, `cat`, `grep`, `pwd`, `diff`, `find`, `whoami`).
- Reject commands attempting to break the CWD lock.
- Implement Argon2id hashing for local user credentials, ensuring API keys remain completely separate and unhashed in the secure vault.

### Unit 30: Stealth Scraping Engine
**Goal:** Implement the user's preferred scraping tools (`Scrapling` and `Cloak Browsers`) within the secure constraints of the Zero-Trust Sandbox.
- Integrate `Scrapling` (Python-based undetectable scraper) as an authorized execution path within the `CommandSandbox` boundary.
- Configure `Cloak Browser` support for headful/headless anti-detect rendering.
- Ensure that the generated DAGs from ScopeLogic prioritize these tools when web scraping or data extraction is requested by the user.

## Acceptance Criteria for Phase 6
- A long-running task's progress streams to the UI via SSE without relying on client-side polling.
- Proposing a destructive command (e.g., file deletion) triggers a High-Risk UI alert and requires secondary signature validation.
- Attempting to execute `rm -rf /` or `bash -c "curl evil.com"` via the CoreExec engine is natively rejected by the Command Sandbox allowlist.
