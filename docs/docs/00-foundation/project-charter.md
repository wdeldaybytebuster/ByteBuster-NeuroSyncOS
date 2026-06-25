---
owner: ByteBuster Core Team
review_cadence: Quarterly
---

# **Project Charter: NeuroSync Sovereign OS**

**Inference Score:** 0.95

## **1\. Executive Summary**

NeuroSync Sovereign OS is a local-first, single-user, multi-project AI workflow cockpit designed to execute transactional AI workloads without cloud dependencies. Evolving from the ByteBuster Agent v1.0 Beta architecture, it enforces absolute data sovereignty, programmatic determinism, and a rigid "Human-in-the-Loop" approval boundary.

The system treats every AI interaction as a transactional unit of work, providing a secure, minimal-footprint alternative to heavy, cloud-native orchestration platforms.

## **2\. Mission and Core Values**

* **Absolute Sovereignty:** No user data, keys, or outputs leave the host machine without explicit human override.  
* **Verifiable Confidence:** Every single decision, synthesis, and workflow node has concrete, auditable validation paths.  
* **Adaptive Autonomy:** Automation occurs strictly inside user-approved bounds, relying on draft-only recommendations until human validation is provided.  
* Rejecting unnecessary machine syntax, bloated cloud architectures, and heavy vector databases in favor of lean, local-first computing (e.g., SQLite, Node.js).

## **3\. Project Objectives**

* Deploy a beta-stable, local-only workflow engine capable of running multi-node Directed Acyclic Graphs (DAGs) end-to-end.  
* Enforce a "Free Mode Governor" that intercepts, logs, and blocks outbound requests to paid LLM providers unless explicitly unlocked.  
* Achieve robust crash recovery via synchronous SQLite tracking, ensuring interrupted runs resume without duplicating completed task effects.

## **4\. Scope Boundaries**

**In-Scope (MVP Phase 1-7):**

* Single-user, multi-project isolation.  
* Transactional DAG execution (CoreExec) and local SQLite persistence (BaseVault).  
* AI proposal generation via "interview loops" that output draft-only DAGs (ScopeLogic).  
* Mock/Free-tier model routing and fallback cascades (RouteSwitch).  
* Cockpit UI with qualitative "Local Proof Badges" and approval flows (PortGrid).  
* Manual execution of file/URL source checks (Manual Scout).

**Out-of-Scope (Non-Goals for MVP):**

* Hardened multi-tenant cloud hosting.  
* Distributed service mesh / microservices split.  
* Autonomous background tracking/daemonization (ScoutDaemon recurring schedules deferred).  
* Guaranteed external model availability.  
* Heavy semantic vector databases (defaulting to local keyword search).

## **5\. Success Criteria & Quality Gates**

* **Reliability:** 398+ backend tests passing before Beta-Stable declaration.  
* **Security:** 40+ sandbox escape tests passed with zero successful exfiltrations.  
* **Supply Chain:** 0 npm audit critical/high vulnerabilities (CycloneDX v1.6 compliant).  
* **Structural Integrity:** Zero-tolerance linting (Vale, Markdownlint, Spectral) blocking deployments on error-level findings.  
* **Operational Validation:** Ensure no AI-generated proposal can self-persist or self-execute without explicit human approval (POST /api/workflows).