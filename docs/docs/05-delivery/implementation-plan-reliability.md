# Implementation Plan: NeuroSync Sovereign OS Enhanced Reliability and Security Protocols

Tab 1

## Implementation Plan: NeuroSync Sovereign OS Enhanced Reliability and Security Protocols

1. Architectural Foundation: Local-First Determinism and Modular Integration

1.1 System Topology and Module Ownership

The  NeuroSync Sovereign OS  architecture is built upon the  Sovereign Suite —a modular, single-repository system designed for local-first execution. To prevent architectural naming drift and "AI coding amnesia," all implementations shall strictly adhere to the following module boundaries and folder structures.| Module | Technical Responsibility | Primary Folder || ------ | ------ | ------ || CoreExec | Authoritative DAG orchestration, task state management, and atomic BEGIN IMMEDIATE transaction control. | /src/coreexec/ || BaseVault | SQLite schema management, migrations, data sanitization loops, and local backup/restore pipelines. | /src/basevault/ || Cerebro | Project-scoped memory interface, semantic indexing, and habituation-based memory evolution. | /src/cerebro/ || RouteSwitch | Universal traffic direction, model provider management, latency-based routing, and Free Mode Governor. | /src/routeswitch/ || ScopeLogic | Requirements review, reasoning-augmented multi-model consensus, and draft-only proposal compilation. | /src/scopelogic/ || PortGrid | Human dashboard, visual local-proof badges, approval interfaces, and tool control cockpit. | /src/portgrid/ || ScoutDaemon | Headless environmental monitoring, passive push-based ingestion, and quarantined asset staging. | /src/scoutdaemon/ || Heritage Tools | Maintenance of legacy ByteBuster Agent v1.0 core functions and compatibility layers. | /src/shared/tools/ |

1.2 Transactional Integrity Protocol

CoreExec enforces the "Grit, Not Grime" philosophy by treating every task as a transactional workload. To eliminate "worker collision" and ensure atomic task claiming in a single-process environment, the system shall implement SQLite’s BEGIN IMMEDIATE semantics.Architectural Commands:

Initialize Transaction:  Execute BEGIN IMMEDIATE at the start of any task-claiming operation. This locks the database for writing, preventing parallel workers from claiming the same node.

Atomic Write-Lock:  Utilize better-sqlite3's synchronous execution to ensure the task status update to "claimed" occurs before the transaction is committed.

Collision Recovery:  If a SQLITE_BUSY error occurs, the module shall implement a deterministic retry delay. BEGIN IMMEDIATE ensures that only one writer can proceed, maintaining the deterministic topology of the DAG.

1.3 The "Grit, Not Grime" Stack Selection

The technical stack is selected to prioritize resource efficiency and local-first data sovereignty on legacy hardware (targeting 6-year-old laptops).

Node.js 24 LTS:  The mandatory runtime for the Sovereign Suite, providing stable performance and long-term support for local-first execution.

better-sqlite3:  Chosen over DuckDB for zero-configuration, transactional row-level integrity and superior performance in point-read transactional workloads.

Pino:  Structured JSON logging with minimal overhead, ensuring observability without taxing CPU cycles.

Zod:  TypeScript-native type inference and declarative validation, ensuring synergy between schema and runtime logic.

Hono:  Lightweight, type-safe middleware for low-latency routing within the local API surface.

2. High-Fidelity Intelligence Layer: Grammar-Constrained Decoding

2.1 CRANE Methodology Integration

To prevent neural hallucinations from corrupting persistent state, the system shall implement "Reasoning-Augmented Constrained Decoding."

EBNF Grammar Enforcement:  Apply formal Extended Backus-Naur Form (EBNF) grammars to the LLM's logit sampling. This ensures 100% syntactic validity for JSON and Directed Acyclic Graph (DAG) outputs.

Reasoning Scratchpad:  Configure the decoding engine to permit an unconstrained "reasoning block" prior to the structured JSON block. This allows the model to process logic before committing to the deterministic structure, improving complex extraction accuracy.

2.2 Structured Extraction Guardrails

ScopeLogic shall validate all model-generated proposals against the "Category A" Safety Boundary Assertions before they enter the PortGrid quarantine.Category A Specification Checklist:

SA-01:  Proposal must contain zero INSERT or UPDATE SQL commands in explanation fields.

SA-02:  Proposal must not contain executable code blocks (e.g., bash, python, sh).

SA-03:  validationPassed flag must be verified by an independent validateWorkflowDag call.

SA-04:  DAGs are strictly prohibited from containing "shell" or "exec" node types.

SA-05:  All agent references must resolve to pre-existing, authorized Agent IDs.

SA-06:  No truncated node definitions; structural integrity checks must confirm all required fields are present.

2.3 Consensus and Triage Pipeline (Council Mode)

High-stakes queries are routed through a heterogeneous "Council Mode" pipeline. Replacing reasoning-based synthesis with simple majority voting increases hallucinations by 32.7%; therefore, an analytical synthesis phase is mandatory.Council Mode Workflow:  Input Query -> Triage Classifier -> N Parallel Expert Models -> Consensus Synthesis -> Output

Triage:  Classify complexity. Queries involving CoreExec leases, BaseVault persistence, or credential handling are automatically routed to the Council.

Parallel Expert Generation:  Dispatch queries to architecturally distinct models (e.g., Llama, Claude, GPT) to collect diverse reasoning chains.

Consensus Synthesis:  A primary model performs a comparative analysis of the parallel outputs to identify consensus points.

Disagreement Scoring:  If the "disagreement score" exceeds a 0.25 threshold, PortGrid shall render a "Low Confidence" badge and halt autonomous execution.

3. Persistent Memory and Learning: SQLite VSS and Async Reflection

3.1 Local Vector Search with sqlite-vec

BaseVault utilizes sqlite-vec for embedded vector search, maintaining a zero-dependency posture.

Native Precision:  Use Float32Array operations for cosine similarity math to avoid heavy external C++ dependencies and precision drift.

Keyword Fallback Engine:  If the embedding provider fails or returns dummy vectors, the system shall fail over to a keyword matching algorithm.

Token Filter:  Fallback similarity is only calculated for tokens exceeding  3 characters .

Fallback Formula:   $Similarity = 0.7 + (matchCount \times 0.05)$

3.2 Asynchronous Memory Reflection

The ReflectionExecutor manages long-term memory evolution to prevent "semantic drift."

Pre-Consolidation Validation:  Before updating the semantic memory layer, the system checks new facts for consistency against existing records.

Debouncing:  Reflection triggers only after a session has remained idle for 30–60 minutes, ensuring the Node.js event loop remains available for active tasks.

3.3 Habituation and Decay Logic

Cerebro implements a "Habituation Scoring" mechanism to maintain signal-to-noise ratios. Idle memories are dampened by a factor of  0.3x , while active memories are boosted by  1.5x .Mathematical Formula:  The final ranking score ( $R_{final}$ ) is a function of semantic relevance ( $R_{semantic}$ ), time since last access ( $\Delta t$ ), and access frequency ( $f_{access}$ ):$$R_{final} = R_{semantic} \cdot (f_{access} \cdot 1.5) \cdot e^{-(\Delta t \cdot 0.3)}$$

4. Proactive Ingestion and State-Aware UX

4.1 SSE and Push-Based Ingestion

ScoutDaemon shall transition from polling to a "push-based" model to respect legacy hardware constraints.

Server-Sent Events (SSE):  Implement SSE for real-time visualization of agent reasoning in PortGrid. This reduces latency compared to polling and preserves the Node.js single-threaded event loop.

WebSockets:  Reserved for browser-automation streams requiring full-duplex communication.

4.2 RouteSwitch: Free Mode Governor & Burn Rate

The Governor acts as a "Fuel Gauge" for API consumption. It shall simulate the "Burn Rate" of a workflow before execution to prevent silent penalty lockouts.

Burn Rate Simulation:  An empirical baseline confirms that a standard 3-node DAG (Node 1 fetch + Node 2 synthesis + Node 3 evaluation) consumes ~14 requests and ~8,000 tokens.

Predictive Halting:  If the simulated cost exceeds the remaining quota in the quota_ledger, RouteSwitch shall halt the workflow and trigger a UI warning.

4.3 Tiered UI Approvals (Sensory Attenuation Model)

To prevent "AI Brain Fry," PortGrid adjusts visual prominence based on the "Sensory Attenuation Model of Fatigue" (SAF).| Risk Tier | Criteria | UI Strategy || ------ | ------ | ------ || Low Risk | Read-only, local-only tasks. | Visually quiet notifications; batch approval permitted. || Medium Risk | Code changes or memory persistence. | Modal confirmation required; highlight delta changes. || High Risk | Credentials, network, or file deletion. | Persistent "Executive Cockpit" alert; mandatory manual signature. |

Local Proof Badge Rendering Logic:  PortGrid shall dynamically render badges based on execution metadata:

if (external_call === null && provider_type === 'local') -> Render  "Local Only"

if (redaction_triggered === true) -> Render  "Redacted Before Inference"

if (operator_signature_present === true) -> Render  "Human Approved"

5. Security Hardening: Authentication and Sandbox Protocols

5.1 Mandatory Authentication Bifurcation

The system shall enforce a strict separation between local credentials and external session keys.

Credential Hashing:  Local user credentials must be hashed using  Argon2id . SHA-256 is restricted to bearer token verification only.

API Key Management:  Provider API keys shall never be hashed (as they become unusable). They must be stored in the OS-level keychain or loaded as session-only keys in-memory.

5.2 Zero-Trust Redaction Pipeline

The SensitiveDataRedactor scrubs information  before  it reaches any LLM or persistent storage.

Tiers:  Public (Aggressive), Internal (Moderate), Confidential (Minimal).

In-Memory Restoration:  Unredacted tokens are restored in-memory for UI display only and are never written to local disk.

5.3 Command Sandbox and CWD Lock

The system enforces an "Assume Breach" mitigation for tool execution via a 20-command read-only allowlist and a cwd (Current Working Directory) lock.| Command | Command | Command | Command | Command || ------ | ------ | ------ | ------ | ------ || ls | cat | grep | pwd | diff || find | head | tail | wc | sort || uniq | stat | file | du | df || lsblk | lscpu | uname | whoami | date |

6. Implementation Roadmap and Acceptance Gates

6.1 Phased Execution Plan (Units 01-10)

Unit 01: Repo Scaffold:  Node.js 24 LTS setup, linting, and folder boundaries.

Unit 02: BaseVault Bootstrap:  SQLite open/close and migration runner.

Unit 03: CoreExec Task Schema:  Runs, tasks, leases, and event tables.

Unit 04: Atomic Task Claim:  BEGIN IMMEDIATE implementation.

Unit 05: DAG Validator:  Cycle detection and node dependency validation.

Unit 06: 3-Node Workflow Runner:  Deterministic execution of simple DAGs.

Unit 07: Retry + Cancellation:  Terminal state handling and retry policies.

Unit 08: Crash Recovery:  Snapshot restoration logic.

Unit 09: Event Log:  Append-only audit trail for all system actions.

Unit 10: Phase 1 Harness:  CLI-only validation; no external model calls.

6.2 Beta-Stable Acceptance Gates

The system achieves "Beta-Stable" status only upon clearing the following gates:| Gate | Metric | Beta-Stable Benchmark || ------ | ------ | ------ || Execution | DAG Recovery | 3-node DAG resumes correctly after process crash. || Security | Isolation | Redaction test suite passes for all three tiers (Public/Internal/Confidential). || Control | Quota Ledger | Free Mode Governor successfully halts calls when burn rate > quota. || Integrity | Determinism | 100% of JSON outputs pass EBNF grammar validation. |

6.3 Environment-Specific Hardening

The "Host Capability Probe" shall run on startup to detect kernel-level isolation support.

Probe Mechanism:  Attempt to execute unshare --net.

Error Handling:  Catch EPERM (Operation not permitted) or CAP_SYS_ADMIN missing.

Graceful Fallback:  If the kernel blocks isolation, the system shall fallback to application-level routing restrictions and display a "Reduced Isolation" warning in the PortGrid Security Center.
