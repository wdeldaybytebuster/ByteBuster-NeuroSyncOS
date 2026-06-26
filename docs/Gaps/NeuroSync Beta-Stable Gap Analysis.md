# **NeuroSync Sovereign OS: Beta-Stable Gap Analysis & Task Report**

**Date:** June 26, 2026

**Target State:** Phase 1-7 MVP (Beta-Stable)

**Status:** Actionable Backlog

## **Executive Summary**

This report identifies all missing functionality required to bring the ByteBuster NeuroSync Sovereign OS to its designated "Beta-Stable" state (Phases 1-7). Based on the recent knowledge base audits, risk mitigation reports, and audio architectural critiques, several critical operational gaps exist between the planned architecture and the current implementation backlog.

In accordance with project directives, all Phase 8+ expansions (Autonomous ScoutDaemon, CRDT sync, Rust/Tauri rewrites, and distributed mesh features) have been strictly excluded from this report.

## **1\. RouteSwitch & Free Mode Governor (Phase 4 Gaps)**

The system currently relies too heavily on static fallbacks, which poses a critical fragility risk given the aggressive rate limits (e.g., 20 requests/minute) of free-tier providers like OpenRouter.

* **Task 1.1: Token & Call Forecasting Engine**  
  * *Details:* The Free Mode Governor cannot function merely as a retroactive ledger. RouteSwitch must pre-calculate and forecast the estimated token burn of a Directed Acyclic Graph (DAG) *before* CoreExec begins execution. If a 3-node workflow is mathematically guaranteed to hit a 429 Rate Limit mid-execution, RouteSwitch must block the run at the PortGrid UI level.  
* **Task 1.2: Intelligent Rotation & Usage-Based Routing**  
  * *Details:* Replace the static fallback list with a dynamic rotation engine. RouteSwitch must cycle through available free-tier models based on real-time latency, capability matching, and active quota thresholds.  
* **Task 1.3: Local Offline Mock Provider Integration**  
  * *Details:* Finalize and integrate a fully offline mock provider. This must be the default fallback for local development and testing to prevent API lockouts during CI/CD.

## **2\. ScopeLogic Proposal Engine & PortGrid Visualization UI (Phase 2 & 5 Gaps)**

The ScopeLogic proposal generation and its visual interface (PortGrid) currently suffer from rigid "assume breach" modals that risk user fatigue, alongside syntax-generation inefficiencies.

* **Task 2.1: Grammar-Constrained Decoding Integration**  
  * *Details:* Implement grammar-constrained decoding (utilizing llama.cpp GBNF or pygbnf structural validation patterns locally). This forces the model to output valid JSON DAGs at the token level without requiring the model to "think" about syntax, thereby preserving its logic and reasoning budget.  
* **Task 2.2: "Deference UI" Implementation**  
  * *Details:* Implement tiered UI approvals in the PortGrid visualization layer to prevent "AI Brain Fry" (Sensory Attenuation of Fatigue) during the interview/build process. High-confidence (95%+), low-risk tasks should bypass massive modals and instead route to visually quiet, ambient "pill row" containers allowing for 1-click bulk approvals.  
* **Task 2.3: Comprehensive Accessibility (a11y) Pass**  
  * *Details:* The PortGrid visual editor currently lacks mandatory compliance. Implement ARIA labels across all ScopeLogic workflow editor tools and ensure keyboard-only navigation is fully functional for the entire DAG approval flow.  
* **Task 2.4: Visual "Autonomy Dials"**  
  * *Details:* Build UI toggles allowing the user to dictate execution iteration limits (Budget & Rigour Dial) and Sandbox permissions (Strict Quarantine vs. Read-Only Execution) before a DAG proposal is finalized.

## **3\. BaseVault Memory & Persistence (Phase 3 Gaps)**

The single-threaded Node.js event loop is highly vulnerable to being blocked by heavy memory processing tasks.

* **Task 3.1: Background Reflection Loop (Worker Threads)**  
  * *Details:* Offload memory consolidation and "habituation scoring" (pruning stale facts, updating access counts) to isolated Node.js worker\_threads. This "sweeping the runway at night" approach ensures the main Hono HTTP routing event loop is never starved during large database writes.  
* **Task 3.2: Redaction-Before-Persistence Pipelines**  
  * *Details:* Finalize the SensitiveDataRedactor logic across the three required tiers (Public, Internal, Confidential). Ensure automated tests prove that PII and API keys are completely stripped before being written to SQLite or Pino logs.

## **4\. Security & Hardening (Phase 7 Gaps)**

The current security model contains documented flaws regarding credential storage and execution isolation that critically block a Beta-Stable release. Under the project's strict "Assume Breach" and Zero-Trust mandates, these vulnerabilities pose unacceptable risks to our promise of absolute data sovereignty. Specifically, the existing credential management approach mistakenly relies on one-way hashing for API keys; while this obscures the keys on disk, it renders them mechanically useless for authenticating legitimate outbound external routing. Furthermore, the lack of robust execution isolation—such as true network namespaces and restrictive system call filtering—leaves the local host environment highly vulnerable to lateral movement or unauthorized network exfiltration from compromised workflows or hallucinated payloads. Until these foundational security primitives are completely overhauled to guarantee environmental integrity, the orchestration engine cannot be certified for public beta deployment.

* **Task 4.1: Credential Storage Correction**  
  * *Details:* The current plan to "hash" API keys is fundamentally flawed, as hashed keys cannot be reused for external calls. Transition the credential manager to reversible local encryption or session-only memory loading.  
* **Task 4.2: Network Namespace & Sandbox Hardening**  
  * *Details:* Finalize the P0 sandbox environment for the run\_command tool. Implement network namespace isolation (using unshare \--net) and restrictive seccomp profiles to prevent lateral movement or data exfiltration during script execution.  
* **Task 4.3: Core Acceptance Gates (Pre-Flight)**  
  * *Details:* Pass the documented benchmark of 40+ sandbox escape tests with zero exfiltrations, and achieve a 100% pass rate on cross-project data leakage regression tests.