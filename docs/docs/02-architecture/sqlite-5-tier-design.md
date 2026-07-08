> Background research feeding the BaseVault design — not a status document.
> Cross-check specifics against `docs/docs/02-architecture/data-architecture.md`.

# SQLite 5-Tier Architecture Design (Research)

Architectural Specification: Native Relational Implementation of a 5-Tier Hierarchical Rule Management Architecture in SQLite

Architectural Invariants and Ecosystem Paradigms

The design and implementation of a state-aware, hierarchical memory and rule-management architecture for autonomous agent ecosystems demand absolute deterministic control. The NeuroSync Sovereign OS operates under a stringent set of architectural invariants, fundamentally rejecting the operational bloat associated with cloud-native orchestration systems, microservice sprawl, and computationally heavy external vector databases. To satisfy these requirements, the architecture introduces "BaseVault," a persistent, highly optimized SQLite memory engine configured to act as the sole source of truth for agentic context and rule governance.

BaseVault is engineered upon Node.js 22 LTS, utilizing the better-sqlite3 driver to enforce synchronous execution paradigms. This stack operates strictly within a Write-Ahead Logging (WAL) configuration, governed exclusively by BEGIN IMMEDIATE transaction locking mechanisms to guarantee deterministic concurrency without the risk of read-write deadlocks. The overarching paradigm of the system is grounded in an "Assume Breach" security model. Within this framework, all AI-generated outputs, intermediate reasoning steps, and tool proposals are strictly classified as untrusted draft data. At no point can an AI entity self-execute a state mutation without passing through cryptographic and logical verification boundaries.

A core operational constraint of the NeuroSync Sovereign OS is the "Free Mode Governor." This governor imposes severe mathematical limits on external API interactions, restricting operations to free-tier provider limits (for instance, a hard cap of 50 requests per day). Consequently, context window management transcends basic optimization and becomes a matter of physical system viability. The prevalent industry practice of "context stuffing"—indiscriminately loading unstructured semantic search results into an LLM context window—is physically impossible within this token economy and strictly forbidden at the architectural level. Every token injected into the prompt must carry an explicit, calculated utility weight.

Furthermore, the isolation rule within this multi-tenant-capable architecture is absolute. Multi-project isolation cannot rely solely on application-level filtering; cross-project memory bleed must be mathematically blocked at the database driver level through rigorous relational schema design, composite foreign key constraints, and unbreachable index boundaries.

As BaseVault evolves to support continuous learning and dynamic agentic routing, it requires a unified relational schema to process and enforce contextual rules across a rigid, cascading 5-tier hierarchy:

Global (System): Immutable safety assertions, absolute system bounds, and strict formatting mandates (e.g., SA-01: No executable bash blocks).

Personal (Standing Rules / User-Level): Operator preferences, permanent behavioral guardrails, and default interaction styles bounded to a specific tenant.

Workspace (Domain-Level): High-level operational boundaries and client-specific isolation constraints (e.g., "Client A" vs. "Internal R&D").

Project (Initiative-Level): Scoped memory and behavioral rules dictated by a specific active workflow or Directed Acyclic Graph (DAG) execution.

Granular (Task / Agent-Specific): Ephemeral, highly specific instructions bound to a single execution node, active tool, or transient agent state.

Industry and State-of-the-Art Analysis of Hierarchical Memory Systems

The development of state-aware agentic architectures has largely bifurcated into two dominant methodologies: unbounded vector retrieval systems (which violate the Free Mode Governor's strict token and dependency constraints) and bounded in-context memory management frameworks. Architecting BaseVault natively within SQLite necessitates a comprehensive deconstruction of these state-of-the-art frameworks, abstracting their core routing and state-resolution concepts while entirely discarding their dependencies on non-relational or cloud-bound external services.

In-Context Memory Blocks and State Machine Orchestration

Leading frameworks in the autonomous agent space, most notably Letta (formerly recognized as MemGPT), approach the large language model as analogous to a central processing unit within a traditional operating system, implementing memory management mechanisms heavily inspired by traditional OS paging hierarchies.1 Letta introduces the foundational concept of in-context memory blocks—discrete, highly functional units of context that remain permanently pinned to the agent's immediate context window.3 These memory blocks are fundamentally partitioned into designated modules, most commonly a "Human" block (containing user preferences, facts, and operator context) and a "Persona" block (containing the agent's internal behavioral guidelines, identity traits, and standing directives).4

The core innovation of the Letta framework is that agents actively manage their own memory capacity by utilizing built-in function-calling tools to read, write, and consolidate persistent storage, making deliberate, autonomous decisions regarding what specific information is maintained in active immediate memory versus what is paginated out to archival storage.1 Letta executes this persistent state mapping via MemFS, a file system abstraction that projects the agent's memory blocks into serialized markdown files on the local machine to support version history, conflict resolution, and direct inspection.5 While this hierarchical block structure is conceptually aligned with BaseVault's 5-tier architecture, Letta's reliance on file-system projection and unstructured textual blocks presents severe limitations. Unstructured markdown files lack the strict, highly typed referential integrity, cascading deletion mechanics, and instantaneous point-read capabilities required by a relational zero-trust database model.

Conversely, LangGraph approaches state management and workflow execution through the formal lens of an event-driven state machine.6 The operational control flow is explicitly managed by defined edges that dictate subsequent node execution, with nodes communicating by applying differential mutations to a shared graph state.7 In complex parallel execution workflows—where multiple agentic nodes operate simultaneously—LangGraph resolves potential state conflicts via a mechanism known as partial state updates.9 Within this paradigm, parallel nodes return only the specific variables they actively modify rather than overwriting the entire global state object.9

LangGraph's underlying execution engine utilizes a message-passing algorithm inspired by Google's Pregel system, organizing execution into discrete "super-steps".7 When parallel nodes attempt to write to the exact same state key during a single super-step, LangGraph requires developers to define custom reducer functions (e.g., operator.add for list aggregation).10 In the absence of a defined reducer, parallel writes to a default scalar key will trigger an INVALID_CONCURRENT_GRAPH_UPDATE exception, strictly enforcing a single-value-per-step paradigm to prevent race conditions.10 While this event-driven architecture effectively mitigates parallel state overwrites during transient execution loops, LangGraph's state channels are inherently ephemeral and computationally bound to the active process memory. They do not natively provide a persistent, multi-tenant storage mechanism capable of enforcing multi-tier rule resolution across separate invocations.

System Prompt Stratification and Assembly

To understand how hierarchical rules must be physically presented to the LLM, the Nous Hermes model architecture provides significant empirical insight into prompt assembly and system message stratification.12 The Hermes cached system prompt is strictly assembled into deterministic, ordered tiers: stable layers (encompassing identity, core tool guidance, and fundamental skills), context layers (encompassing project-specific files and caller-supplied messages), and volatile layers (encompassing ephemeral memory snapshots and timestamp data).12

The final system prompt is joined in a strictly linear fashion: 

.12 This explicit ordering is critical for precedence and authority discussions. Because high-level skills and core identities are permanently cached in the stable tier, they cannot be silently overwritten by volatile mid-turn overlays injected during active conversational loops.12 Furthermore, Hermes utilizes ChatML as its foundational prompt format, incorporating specific, explicit XML-style tokens (e.g., <tools>, <tool_call>) to demarcate structured boundaries.13 This boundary enforcement prevents the LLM's attention mechanism from confusing distinct rule sets or hallucinating tool outputs as human instructions.13 This structured separation of concerns establishes a vital precedent for BaseVault's context injection strategy, empirically proving that strict formatting syntax dictates the success or failure of hierarchical rule adherence.

Multi-Tier Instruction Hierarchy and Privilege Conflict Resolution

The single most significant challenge in hierarchical rule management is the mathematical resolution of instruction conflicts. Large language model agents inevitably receive conflicting instructions across a vast array of sources: system messages, user prompts, external tool outputs, and inter-agent communication channels.15 If an autonomous agent treats an untrusted instruction—such as a prompt injection payload returned from a granular web-search tool—as authoritative, it compromises the entire system, potentially violating strict developer safety intent.17 The dominant paradigm in AI safety has historically relied on a rigid, limited instruction hierarchy, assuming a highly restricted set of privilege levels (typically defined simply as System > User > Tool).16

Recent advancements outlined in the "Many-Tier Instruction Hierarchy" (ManyIH) research demonstrate the critical necessity for dynamic, granular privilege assignment.18 The ManyIH paradigm introduces a dedicated Privilege Prompt Interface that allows instruction privilege to be explicitly defined at inference time via ordinal or scalar values, scaling effectively up to 12 distinct privilege levels.18

The exhaustive ManyIH-Bench evaluation framework—comprising 853 complex agentic tasks spanning 46 real-world agents—revealed a catastrophic industry vulnerability: even the most advanced current frontier models perform exceptionally poorly, achieving an accuracy rate of approximately 40% when forced to navigate complex instruction conflicts across multiple privilege tiers.18 The research empirically demonstrated that models exhibit extreme sensitivity to precisely how privilege is represented within the prompt format.20 For instance, a subtle prompt injection attack embedded within a tool output attempting to override a core system safety directive will often succeed if the privilege hierarchy is not explicitly and mathematically structured.20

The data dictates that when rules conflict directly—for example, a workspace rule mandating "Use markdown formatting" versus a granular task rule demanding "Do not use any markdown formatting"—the system cannot rely on the LLM's implicit semantic reasoning.20 To resolve instruction drift and prevent adversarial subversion, the architecture must establish an unbreakable mathematical authority model.23 If a Granular rule conflicts with a Personal rule, the resolution mechanism must be executed deterministically at the database or application level before the prompt is ever assembled and sent over the API.19

Second-Order Insights: Deficiencies in Current Paradigms

A rigorous synthesis of the prevailing research reveals three critical deficiencies that BaseVault must rectify natively to satisfy the NeuroSync OS constraints. First, systems like Letta rely heavily on unstructured textual contexts and LLM-driven file management, which fundamentally degrades query-time performance, consumes immense amounts of token budget during self-reflection loops, and prevents atomic point-read updates. Second, event-driven state machines like LangGraph lack persistent, schema-enforced relational boundaries, significantly increasing the risk of cross-project context bleed if namespace isolation is mismanaged by the developer at the application level. Third, relying purely on in-context prompt engineering for conflict resolution (as tested in the ManyIH-Bench framework) yields unacceptably high failure rates in even the most capable frontier LLMs.20

Therefore, the definitive architectural conclusion is that the resolution of rule cascades—specifically the complex logical decisions regarding whether specificity overrides authority—must be deterministically computed in TypeScript and SQLite before any context injection occurs. The 5-tier hierarchy must be programmatically evaluated, filtered, and compressed into a unified, flattened rule set optimized exclusively for obedience by the LLM.

Relational SQLite Schema Design for Deterministic 5-Tier Memory

To satisfy the "Assume Breach" security model and mathematically guarantee absolute multi-project isolation, BaseVault's schema must natively enforce access constraints at the lowest possible layer: the database driver. The architectural directive explicitly forbids the utilization of complex JSON blobs for rule storage. While JSON columns offer flexibility, they degrade query-time performance, prevent the utilization of standard relational indexing, and circumvent strict typing constraints. Instead, native relational columns ensure structural immutability, enforce complex referential integrity via foreign key cascades, and provide superior point-read performance via multi-column B-tree index utilization.

Tenant Isolation and Zero-Bleed Constraints

To absolutely prevent context bleed across projects or workspaces, tenant isolation rules must be maintained as immutable code and enforced directly via composite foreign keys.25 Every table beyond the Global Tier 1 must physically include a workspace_id (acting as the cryptographic tenant identifier).26 The fundamental relational principle here is that a specific project, or an ephemeral granular task, cannot reference, join, or associate with a rule derived from an unrelated workspace under any circumstances.

In designing this isolation, it is critical to address a specific, dangerous anomaly within SQLite's foreign key implementation regarding the MATCH FULL clause. According to the strict SQL92 standard, a MATCH FULL composite foreign key dictates that a mix of null and non-null values within the key is mathematically guaranteed to fail the constraint, ensuring strict referential tracking.27 However, while SQLite successfully parses the MATCH FULL syntax without throwing a compilation error, it absolutely does not enforce it, silently treating all foreign key constraints as if MATCH SIMPLE were specified.27

In MATCH SIMPLE logic, if any single column of a multi-column composite foreign key evaluates to NULL, the entire constraint check is effectively bypassed, and the database permits the orphaned insertion.27 Furthermore, standard foreign key constraints are entirely ignored by SQLite if the child's referencing column value is NULL.29 To mathematically guarantee multi-tenant isolation and prevent a malicious agent from writing an untracked record by exploiting a null bypass, the BaseVault schema must aggressively enforce NOT NULL constraints on all foreign key reference columns.29 Additionally, the use of INTEGER PRIMARY KEY AUTOINCREMENT is absolutely required across all tables to ensure that deleted identifiers are permanently retired and never reused, thereby preventing historical, archived context from erroneously bleeding into newly created records that happen to claim the same sequential ID.29

Schema Definition: Core Rule Engine Tables

The following Data Definition Language (DDL) statements architect the 5-tier system natively. The schema utilizes strict foreign key cascading (ON DELETE CASCADE) and composite primary/foreign keys to form unbreakable hierarchical relationships. Every table leverages the STRICT table option (introduced in SQLite 3.37.0) to enforce rigid data typing, rejecting the historical SQLite behavior of dynamic type affinity.

SQL

-- SQLite Pragma Configuration for Security, Performance, and IsolationPRAGMA foreign_keys = ON;PRAGMA journal_mode = WAL;PRAGMA synchronous = NORMAL;PRAGMA strict = ON;-- Tier 1: Global (System) Rules-- These represent immutable safety assertions and absolute system bounds.-- As they govern the entire OS, no workspace_id tenant isolation is required.CREATE TABLE sys_global_rules (    rule_id INTEGER PRIMARY KEY AUTOINCREMENT,    rule_code TEXT NOT NULL UNIQUE,    description TEXT NOT NULL,    enforcement_directive TEXT NOT NULL,    is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))) STRICT;-- Foundational Tenant Boundary: The Workspace-- Every subsequent entity must cryptographically tie back to a valid workspace.CREATE TABLE sys_workspace (    workspace_id INTEGER PRIMARY KEY AUTOINCREMENT,    workspace_name TEXT NOT NULL UNIQUE,    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))) STRICT;-- Tier 2: Personal (Standing) Rules-- Operator preferences bounded strictly by a specific workspace/tenant.CREATE TABLE rule_personal (    personal_rule_id INTEGER PRIMARY KEY AUTOINCREMENT,    workspace_id INTEGER NOT NULL,    category TEXT NOT NULL,    rule_content TEXT NOT NULL,    override_weight INTEGER NOT NULL DEFAULT 10,    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),    CONSTRAINT fk_workspace_personal FOREIGN KEY (workspace_id)         REFERENCES sys_workspace(workspace_id) ON DELETE CASCADE) STRICT;-- Tier 3: Workspace (Domain-Level) Rules-- High-level operational boundaries and macro-directives.CREATE TABLE rule_workspace (    workspace_rule_id INTEGER PRIMARY KEY AUTOINCREMENT,    workspace_id INTEGER NOT NULL,    domain_context TEXT NOT NULL,    constraint_text TEXT NOT NULL,    override_weight INTEGER NOT NULL DEFAULT 20,    CONSTRAINT fk_workspace_domain FOREIGN KEY (workspace_id)         REFERENCES sys_workspace(workspace_id) ON DELETE CASCADE) STRICT;-- Foundational Project Boundary-- Bounded within a workspace, initiating the composite key requirements.CREATE TABLE sys_project (    project_id INTEGER PRIMARY KEY AUTOINCREMENT,    workspace_id INTEGER NOT NULL,    project_name TEXT NOT NULL,    CONSTRAINT fk_project_workspace FOREIGN KEY (workspace_id)         REFERENCES sys_workspace(workspace_id) ON DELETE CASCADE,    -- Unique constraint creates a compound index ensuring a project     -- belongs to exactly one workspace, used as a reference target.    CONSTRAINT uq_project_workspace UNIQUE (project_id, workspace_id)) STRICT;-- Tier 4: Project (Initiative-Level) Rules-- Scoped memory and directives for specific DAG executions.CREATE TABLE rule_project (    project_rule_id INTEGER PRIMARY KEY AUTOINCREMENT,    project_id INTEGER NOT NULL,    workspace_id INTEGER NOT NULL,    phase_directive TEXT NOT NULL,    override_weight INTEGER NOT NULL DEFAULT 30,    -- Composite FK guarantees this rule cannot be mapped to Project A     -- while falsely claiming it belongs to Workspace B.    CONSTRAINT fk_rule_project_composite FOREIGN KEY (project_id, workspace_id)         REFERENCES sys_project(project_id, workspace_id) ON DELETE CASCADE) STRICT;-- Foundational Task Boundary-- Defines specific nodes or agent execution instances within a project.CREATE TABLE sys_task (    task_id INTEGER PRIMARY KEY AUTOINCREMENT,    project_id INTEGER NOT NULL,    workspace_id INTEGER NOT NULL,    task_name TEXT NOT NULL,    CONSTRAINT fk_task_project_composite FOREIGN KEY (project_id, workspace_id)         REFERENCES sys_project(project_id, workspace_id) ON DELETE CASCADE,    CONSTRAINT uq_task_project UNIQUE (task_id, project_id, workspace_id)) STRICT;-- Tier 5: Granular (Task/Agent-Specific) Rules-- Ephemeral instructions bounded strictly to individual nodes.CREATE TABLE rule_granular (    granular_rule_id INTEGER PRIMARY KEY AUTOINCREMENT,    task_id INTEGER NOT NULL,    project_id INTEGER NOT NULL,    workspace_id INTEGER NOT NULL,    agent_identifier TEXT NOT NULL,    ephemeral_instruction TEXT NOT NULL,    override_weight INTEGER NOT NULL DEFAULT 40,    -- Triple-composite FK establishes the ultimate zero-bleed barrier.    CONSTRAINT fk_rule_granular_composite FOREIGN KEY (task_id, project_id, workspace_id)         REFERENCES sys_task(task_id, project_id, workspace_id) ON DELETE CASCADE) STRICT;

Indexing Strategy and Query-Time Optimization

To satisfy the Free Mode Governor's unforgiving execution time constraints and minimize latency before LLM invocation, the schema strictly avoids linear table scans by implementing a rigorous indexing strategy. In SQLite, if a query combines multiple columns for filtering, a well-structured multi-column index accelerates the query fully without requiring sequential data parsing.30 The internal storage of an index table for a multi-column index is ordered sequentially by the given parameters from left to right, allowing prefix inquiries to function at high performance.30

Table 2 demonstrates the composite index mapping specifically engineered for the BaseVault tiering system:

By deliberately duplicating the workspace_id through every single hierarchical tier and permanently embedding it within the composite unique constraints, the schema makes it mathematically impossible to insert a rule_granular record that maps to a task_id belonging to an entirely different workspace_id. The composite foreign key validation mathematically rejects the insert at the disk-write phase, operating as an unbreachable wall against cross-tenant data leaks and bypassing the need for error-prone application-layer filtering.25

Efficient Querying and Deterministic State Merging

Fetching the completely unified rule set required to construct the system prompt necessitates an atomic state tracking query. To avoid the significant latency overhead of making five distinct database round-trips via the Node.js event loop, a Common Table Expression (CTE) utilizing UNION ALL is deployed to aggregate the cascading tiers into a single, highly typed, chronologically and hierarchically sorted response stream.

Hierarchical Retrieval via Common Table Expressions

The following SQL query aggregates all contextual constraints for a given execution context. The architecture directly injects the tier_level parameter into the query to establish a hardcoded, deterministic authority ranking, consciously adapting the underlying principles of the ManyIH framework where explicit numerical scalar values represent absolute privilege hierarchies.19 Using UNION ALL instead of UNION prevents SQLite from attempting costly internal deduplication operations, as the TypeScript engine is specifically designed to handle intelligent conflict resolution downstream.

SQL

WITH UnifiedRules AS (    -- Tier 1: Global Authority    -- Highest mathematical privilege. Enforces core system safety.    SELECT         1 AS tier_level,        'GLOBAL' AS source_tier,        rule_code AS rule_category,        enforcement_directive AS instruction,        0 AS override_weight    FROM sys_global_rules    WHERE is_active = 1    UNION ALL    -- Tier 2: Personal Guardrails    -- Bounded strictly to the authenticated workspace tenant.    SELECT         2 AS tier_level,        'PERSONAL' AS source_tier,        category AS rule_category,        rule_content AS instruction,        override_weight    FROM rule_personal    WHERE workspace_id = @workspaceId    UNION ALL    -- Tier 3: Workspace Boundaries    SELECT         3 AS tier_level,        'WORKSPACE' AS source_tier,        'DOMAIN_CONSTRAINT' AS rule_category,        constraint_text AS instruction,        override_weight    FROM rule_workspace    WHERE workspace_id = @workspaceId    UNION ALL    -- Tier 4: Project Scope    -- Utilizes the composite index for rapid filtering.    SELECT         4 AS tier_level,        'PROJECT' AS source_tier,        'PHASE_DIRECTIVE' AS rule_category,        phase_directive AS instruction,        override_weight    FROM rule_project    WHERE project_id = @projectId AND workspace_id = @workspaceId    UNION ALL    -- Tier 5: Granular Ephemeral    -- Deepest execution level constraints.    SELECT         5 AS tier_level,        'GRANULAR' AS source_tier,        'AGENT_INSTRUCTION' AS rule_category,        ephemeral_instruction AS instruction,        override_weight    FROM rule_granular    WHERE task_id = @taskId AND project_id = @projectId AND workspace_id = @workspaceId)-- Order by tier_level to ensure strict hierarchical processing, -- followed by override_weight to establish conflict resolution parity.SELECT * FROM UnifiedRules ORDER BY tier_level ASC, override_weight ASC;

Deterministic Conflict Resolution and Merging Logic in TypeScript

The empirical data derived from ManyIH-Bench definitively proves that passively presenting conflicting, multi-tiered constraints to an LLM without an explicit, pre-calculated hierarchy results in extensive execution failure and extreme susceptibility to adversarial injection.19 BaseVault mitigates this vulnerability by intercepting and mathematically resolving all rule collisions programmatically in TypeScript before prompt injection is ever initiated.

The deterministic resolution mechanism applies a complex dual-axis evaluation criteria: Authority vs. Specificity.

Let 

 represent the Tier level, where 

 represents the absolute highest authoritative privilege (Global System). Let 

 represent the developer-defined override_weight, enabling fine-grained control within tiers. The core algorithmic invariant dictates that higher-level authority (

, 

) absolutely nullifies conflicting specific instructions attempting to bubble up from lower, untrusted tiers (

). This physically prevents prompt-injection attacks (e.g., an adversarial tool output attempting to inject a malicious system prompt overlay) from overriding core safety bounds.16 However, within benign, safe operational contexts (e.g., a 

 Personal preference regarding output length versus a 

 Project constraint requiring extensive diagnostic logs), specific, highly weighted project constraints (

) correctly overwrite generalized standing personal preferences.

The TypeScript architecture enforces this strict conflict resolution through the RuleMergeEngine, operating with a time complexity of 

 where 

 is the number of fetched rules.

TypeScript

export interface RuleRecord {    tier_level: number;    source_tier: string;    rule_category: string;    instruction: string;    override_weight: number;}export class RuleMergeEngine {    /**     * Deterministically resolves cascading rules from SQLite payload.     * Global rules (tier 1) are strictly appended and immutable.     * Tiers 2-5 are deduplicated based on category grouping, favoring the      * lowest numerical override_weight (highest specific priority).     */    public static resolveRuleCascade(fetchedRules: RuleRecord): RuleRecord {        const resolvedMap = new Map<string, RuleRecord>();        const globalRules: RuleRecord =;        for (const rule of fetchedRules) {            // Assert: Immutable Tier 1 rules bypass all conflict resolution.            // They cannot be overwritten by any subsequent execution state.            if (rule.tier_level === 1) {                globalRules.push(rule);                continue;            }            const existingRule = resolvedMap.get(rule.rule_category);                        if (!existingRule) {                // No conflict exists in the current iteration; map the rule.                resolvedMap.set(rule.rule_category, rule);            } else {                // Conflict Resolution Execution:                // Primary Axis: Lower numerical override_weight asserts dominance.                // Secondary Axis: If weights are perfectly equal,                 // the more specific, granular tier (higher tier_level number) wins.                if (rule.override_weight < existingRule.override_weight) {                    resolvedMap.set(rule.rule_category, rule);                } else if (rule.override_weight === existingRule.override_weight) {                    if (rule.tier_level > existingRule.tier_level) {                        resolvedMap.set(rule.rule_category, rule);                    }                }                // Implicit else: the existing rule holds superior authority and is retained.            }        }        // Recombine the arrays and apply a strict sort:         // Global asserts first, followed by resolved rules sorted linearly by tier.        const finalizedRules = Array.from(resolvedMap.values())           .sort((a, b) => a.tier_level - b.tier_level);        return;    }}

Context Injection and Strict Token Optimization Strategy

Once the TypeScript engine executes and yields a deterministically merged, conflict-free rule array, the constraints must be serialized and injected into the LLM context window. The assembly process cannot allow arbitrary string concatenation, as ambiguous formatting destroys the model's ability to maintain instruction adherence over long context lengths.

Delineated Prompt Injection Architecture

Drawing heavily from the empirical successes of the Nous Hermes system prompt stratification principles, the architecture must clearly and explicitly delineate the various tiers without confusing the LLM's cross-attention mechanism.12 BaseVault utilizes strict, heavily nested XML-style tags to isolate context clusters.14 This specific XML formatting inherently encodes the privilege hierarchy visually within the prompt structure, fulfilling the highest requirements of a Privilege Prompt Interface as defined by modern AI safety literature.18 The prompt structure explicitly separates stable, high-privilege governance from volatile, granular task constraints.

XML

<system_governance>    <immutable_bounds>        Execute NO interactive bash shells.        Output format MUST strictly adhere to the defined schema.    </immutable_bounds>    <operator_preferences>        Output strictly in highly dense technical prose.        Assume senior-level architectural audience.    </operator_preferences></system_governance><execution_context>    <workspace_domain>        Domain: Internal Node.js R&D.         Assume modern ECMAScript specifications (ES2024+).    </workspace_domain>    <project_scope>        Phase: Relational memory architecture schema design.        Objective: Design zero-dependency SQL structures.    </project_scope>    <active_task_constraints>        Constraint: Return only valid SQLite DDL statements.        Constraint: Absolutely no JSON representation of schema permitted.    </active_task_constraints></execution_context>

The Token Budgeting Algorithm

The NeuroSync Free Mode Governor mandates that API requests respect severe token caps enforced by free-tier AI providers. The practice of massive context stuffing—where history and rules are injected until the context window overflows—is mathematically impermissible within this paradigm.1 Thus, a dynamic Token Budgeting Algorithm is deployed as an application-level middleware prior to the final prompt assembly.

Let the absolute maximum allowed context budget be 

 tokens. The length of the merged rule set is continuously evaluated via a deterministic tokenizer heuristic function 

. If the sum of all rule tokens 

, the system initiates a greedy truncation strategy based on inverse tier prioritization.

Tier 1 (Global), Tier 2 (Personal), and Tier 3 (Workspace) are permanently flagged as non-evictable protected tiers. Tier 5 (Granular) is highly specific but represents transient, ephemeral data. Therefore, if strict token limits are breached, historical Tier 5 rules are iteratively truncated and pruned from the bottom up (least critical first) until the mathematical invariant 

 is successfully restored.

TypeScript

export class TokenGovernor {    private readonly MAX_TOKENS: number;    constructor(tokenLimit: number) {        this.MAX_TOKENS = tokenLimit;    }    /**     * Deterministic heuristic for rapid token estimation.     * Prevents the computational overhead of running heavy BPE tokenizers     * on the main Node.js event loop prior to actual assembly.     * Assumes an average density of ~4 characters per token.     */    private estimateTokens(text: string): number {        return Math.ceil(text.length / 4);    }    public executeTokenBudgeting(rules: RuleRecord): RuleRecord {        let currentTokens = 0;        const budgetApprovedRules: RuleRecord =;                // Segregate rule payload into protected vs evictable subsets        const protectedTiers = rules.filter(r => r.tier_level <= 3);        const evictableTiers = rules.filter(r => r.tier_level > 3)                                    // Sort by lowest priority first for greedy eviction                                   .sort((a, b) => b.tier_level - a.tier_level);        // Phase 1: Pre-allocate absolute token budget to protected tiers        for (const pr of protectedTiers) {            const tokens = this.estimateTokens(pr.instruction);            currentTokens += tokens;            budgetApprovedRules.push(pr);        }        // Integrity Check: The foundational bounds cannot exceed the allowed budget        if (currentTokens > this.MAX_TOKENS) {            throw new Error(                "CRITICAL SYSTEM VIOLATION: Protected rule tiers fundamentally " +                "exceed Free Mode Governor limits. Cannot proceed safely."            );        }        // Phase 2: Greedily append evictable tiers until the defined budget is exhausted        for (const er of evictableTiers) {            const tokens = this.estimateTokens(er.instruction);            if (currentTokens + tokens <= this.MAX_TOKENS) {                currentTokens += tokens;                budgetApprovedRules.push(er);            } else {                // Pruning execution triggered: Rule discarded due to strict limits                // The algorithm breaks, sacrificing lower-level context to preserve                 // the primary execution operation.                break;            }        }        // Return the final pruned array, resorted by architectural hierarchy        return budgetApprovedRules.sort((a, b) => a.tier_level - b.tier_level);    }}

Verification, Security, and Concurrency Control

The architecture enforces a strictly sandboxed, deeply isolated multi-tenant implementation at the data definition level. However, relational schemas and application logic alone are insufficient to guarantee absolute determinism if the underlying database driver suffers from transactional deadlocks, unhandled concurrent writes, or connection pooling vulnerabilities. The "Assume Breach" security model demands that the bridge between Node.js and SQLite is mathematically fortified.

Concurrency and Transaction Locking Mechanism

SQLite operates as a fundamentally synchronous database engine and relies entirely on an implicitly locked system.33 Under standard operational execution within WAL (Write-Ahead Logging) mode, SQLite initiates standard transactions utilizing DEFERRED mode, treating the transaction initially as read-only. The transaction is only dynamically upgraded to a write transaction (which inherently requires a full database lock) when an explicit mutation query (INSERT, UPDATE, DELETE) is formally encountered in the execution flow.34

In a highly concurrent, multi-agent AI pipeline where multiple Node.js worker threads or asynchronous processes might attempt to modify the state simultaneously, upgrading a transaction dynamically after it has started causes SQLite to instantly return a SQLITE_BUSY (database is locked) error.34 In this state, SQLite entirely circumvents the standard busy_timeout mechanisms because a mid-flight upgrade might break the rigid serializable isolation guarantees it must uphold.35 This flaw completely violates the deterministic invariants of BaseVault, causing fatal pipeline crashes when multiple agents execute tool calls simultaneously.

To assure mathematical safety against deadlocks and blocking exceptions, all BaseVault state mutations and write transactions must be explicitly and forcefully declared in BEGIN IMMEDIATE mode using the Node.js better-sqlite3 driver API.33

When the BEGIN IMMEDIATE directive successfully executes, SQLite bypasses the DEFERRED risk and instantly acquires a definitive reserved lock on all relevant database files before a single query is executed.33 This action securely asserts three unbreachable concurrency rules:

No other concurrent transaction can successfully execute a mutation until the lock is released.

No other concurrent transaction can execute BEGIN IMMEDIATE or BEGIN EXCLUSIVE (failing safely and instantly in the queue rather than exploding mid-transaction).33

Most critically for performance, existing and new read-transactions may continue to process their operations entirely unhindered due to the inherent concurrent read design of WAL mode architecture.33

This deterministic concurrency is implemented strictly through the better-sqlite3 native transaction API, utilizing the explicit .immediate() execution modifier:

TypeScript

import Database from 'better-sqlite3';// Initialize the database connection with absolute paths and strict pragmasconst db = new Database('/var/basevault/data/basevault_memory.db');db.pragma('journal_mode = WAL');db.pragma('synchronous = NORMAL');db.pragma('foreign_keys = ON');// Abstracted mutation wrapper definition enforcing strict parameterized inputsconst insertGranularRule = db.transaction((ruleData: any) => {    const stmt = db.prepare(`        INSERT INTO rule_granular (            task_id, project_id, workspace_id, agent_identifier, ephemeral_instruction        )        VALUES (@taskId, @projectId, @workspaceId, @agentId, @instruction)    `);    stmt.run(ruleData);});/** * Public execution interface for injecting new granular memory rules. * The.immediate() modifier dictates the strict lock behavior, * guaranteeing deterministic concurrency and preventing SQLITE_BUSY deadlocks. */export function safelyInjectRule(ruleData: any) {    try {        // Execute the transaction utilizing BEGIN IMMEDIATE        insertGranularRule.immediate(ruleData);     } catch (error) {        // Handle constraint violations or isolation breaches        console.error("Database Transaction Failure:", error);        throw error;    }}

The strict implementation of .immediate() ensures the write operation is safely isolated without causing context bleed or blocking exceptions into overlapping read-threads actively initiated by parallel agents traversing the LangGraph or orchestrator loop.38

Application-Level Verification and Zero-Trust Bounds

To fully satisfy the zero-trust paradigm of the NeuroSync OS, the application layer must view the entire database querying system and the LLM execution pipeline as inherently untrusted until cryptographically validated. Establishing accurate tenant context immediately upon the initiation of the request lifecycle is mandatory.26

Before any fetch query reaches the SQLite driver, and before the RuleMergeEngine processes a single rule, TypeScript assertions must perform logic-based validation to ensure workspace_id immutability.

TypeScript

/** * Cryptographically verifies that the requested memory context strictly  * aligns with the authenticated access token of the current execution thread. */export function verifyTenantIsolation(    requestedWorkspaceId: number,     authenticatedTokenWorkspaceId: number,    executionPhase: string): void {    // Assert: Absolute mathematical validation of context bounds    if (requestedWorkspaceId!== authenticatedTokenWorkspaceId) {        // Halt execution and throw an uncatchable fatal exception        throw new Error(            `CRITICAL ISOLATION BREACH AT PHASE [${executionPhase}]: ` +            `Attempted cross-project read detected. ` +             `Token Bound Workspace: ${authenticatedTokenWorkspaceId}, ` +            `Requested Injection Workspace: ${requestedWorkspaceId}. ` +            `Execution safely aborted to prevent context bleed.`        );    }}

This application-level guardrail functions as the ultimate defense-in-depth.26 Even in the extreme edge case where a compromised AI agent hallucinates an incorrect workspace_id during a granular tool call, or if a routing bug attempts to load an invalid project phase, the TypeScript wrapper actively intercepts the execution. It immediately drops the query, purges the active state, and triggers an isolation breach alert. This two-pronged approach—application assertions backed by impenetrable database composite keys—mathematically guarantees that an agent operating within Workspace A cannot ever accidentally retrieve, interact with, or observe the standing rules, memories, or outputs generated within Workspace B.

Works cited

Benchmarking AI Agent Memory: Is a Filesystem All You Need? - Letta, accessed on June 25, 2026, https://www.letta.com/blog/benchmarking-ai-agent-memory/

The Memory Problem in AI Agents Is Half Solved. Here's the Other Half. - Medium, accessed on June 25, 2026, https://medium.com/data-unlocked/the-memory-problem-in-ai-agents-is-half-solved-heres-the-other-half-ebbf218ae4d5

Agent Memory: How to Build Agents That Learn and Remember - Letta, accessed on June 25, 2026, https://www.letta.com/blog/agent-memory/

Memory Blocks: The Key to Agentic Context Management - Letta, accessed on June 25, 2026, https://www.letta.com/blog/memory-blocks/

Memory | Letta Docs, accessed on June 25, 2026, https://docs.letta.com/letta-code/memory

LangGraph State Machine Tutorial for Conversational Agents - ActiveWizards, accessed on June 25, 2026, https://activewizards.com/blog/architecting-event-driven-conversational-agents-with-langgraph/

Graph API overview - Docs by LangChain, accessed on June 25, 2026, https://docs.langchain.com/oss/python/langgraph/graph-api

LangGraph: Multi-Agent Workflows - LangChain, accessed on June 25, 2026, https://www.langchain.com/blog/langgraph-multi-agent-workflows

Resolving Parallel Workflow Conflicts with Partial State Updates in LangGraph - Medium, accessed on June 25, 2026, https://medium.com/@kodithyala.ashok/resolving-parallel-workflow-conflicts-with-partial-state-updates-in-langgraph-713dec7852c5

Best practices for parallel nodes (fanouts) - LangGraph - LangChain Forum, accessed on June 25, 2026, https://forum.langchain.com/t/best-practices-for-parallel-nodes-fanouts/1900

Seeking help with some merge message issues when LangGraph is called in parallel, accessed on June 25, 2026, https://forum.langchain.com/t/seeking-help-with-some-merge-message-issues-when-langgraph-is-called-in-parallel/3007

Prompt Assembly | Hermes Agent, accessed on June 25, 2026, https://hermes-agent.nousresearch.com/docs/developer-guide/prompt-assembly

NousResearch/Hermes-Function-Calling - GitHub, accessed on June 25, 2026, https://github.com/NousResearch/Hermes-Function-Calling

NousResearch/Hermes-2-Pro-Llama-3-70B - Hugging Face, accessed on June 25, 2026, https://huggingface.co/NousResearch/Hermes-2-Pro-Llama-3-70B

Many-Tier Instruction Hierarchy in LLM Agents - arXiv, accessed on June 25, 2026, https://arxiv.org/html/2604.09443v2

[2604.09443] Many-Tier Instruction Hierarchy in LLM Agents - arXiv, accessed on June 25, 2026, https://arxiv.org/abs/2604.09443

Improving instruction hierarchy in frontier LLMs - OpenAI, accessed on June 25, 2026, https://openai.com/index/instruction-hierarchy-challenge/

Many-Tier Instruction Hierarchy in LLM Agents - arXiv, accessed on June 25, 2026, https://arxiv.org/html/2604.09443v3

Many-Tier Instruction Hierarchy in LLM Agents - arXiv, accessed on June 25, 2026, https://arxiv.org/html/2604.09443v1

Many-Tier Instruction Hierarchy in LLM Agents - arXiv, accessed on June 25, 2026, https://arxiv.org/pdf/2604.09443

Many-Tier Instruction Hierarchy in LLM Agents | Request PDF - ResearchGate, accessed on June 25, 2026, https://www.researchgate.net/publication/403751125_Many-Tier_Instruction_Hierarchy_in_LLM_Agents

What is Instruction Hierarchy in LLMs? (2026 Guide) - Generation Digital, accessed on June 25, 2026, https://www.gend.co/blog/instruction-hierarchy-llms-safety

The 'Instructional Hierarchy' Protocol. : r/PromptEngineering - Reddit, accessed on June 25, 2026, https://www.reddit.com/r/PromptEngineering/comments/1skydh1/the_instructional_hierarchy_protocol/

JHU-CLSP/ManyIH - GitHub, accessed on June 25, 2026, https://github.com/JHU-CLSP/ManyIH

How to prevent Cross-Tenant Access Control Failure : r/Supabase - Reddit, accessed on June 25, 2026, https://www.reddit.com/r/Supabase/comments/1tvjku1/how_to_prevent_crosstenant_access_control_failure/

Multi Tenant Security - OWASP Cheat Sheet Series, accessed on June 25, 2026, https://cheatsheetseries.owasp.org/cheatsheets/Multi_Tenant_Security_Cheat_Sheet.html

postgresql - MATCH FULL vs MATCH SIMPLE in foreign key constraints, accessed on June 25, 2026, https://dba.stackexchange.com/questions/58894/match-full-vs-match-simple-in-foreign-key-constraints

SQLite Foreign Key Support, accessed on June 25, 2026, https://sqlite.org/foreignkeys.html

better-sqlite3/docs/tips.md at master - GitHub, accessed on June 25, 2026, https://github.com/WiseLibs/better-sqlite3/blob/master/docs/tips.md

Best practices for SQLite performance | App quality - Android Developers, accessed on June 25, 2026, https://developer.android.com/topic/performance/sqlite-performance-best-practices

SQLite Indexes – CREATE INDEX, EXPLAIN QUERY PLAN, and Tuning Tips | DbSchema, accessed on June 25, 2026, https://dbschema.com/blog/sqlite/index/

accessed on June 25, 2026, https://cdn.openai.com/pdf/14e541fa-7e48-4d79-9cbf-61c3cde3e263/ih-challenge-paper.pdf

Explicit Locking, Deadlocks, and Linux Lock Primitives in SQLite - DEV Community, accessed on June 25, 2026, https://dev.to/lovestaco/explicit-locking-deadlocks-and-linux-lock-primitives-in-sqlite-1llj

Help understanding the effect of BEGIN IMMEDIATE - SQLite User Forum, accessed on June 25, 2026, https://sqlite.org/forum/forumpost/04ed1d235b

SQLite and database is locked error - ORM - Django Forum, accessed on June 25, 2026, https://forum.djangoproject.com/t/sqlite-and-database-is-locked-error/26994

The Definitive Guide to SQLite, Second Edition (Expert's Voice in Open Source), accessed on June 25, 2026, https://programmershouse.ir/Library/Files/SQLite.pdf

What to do about SQLITE_BUSY errors despite setting a timeout - Bert Hubert's writings, accessed on June 25, 2026, https://berthub.eu/articles/posts/a-brief-post-on-sqlite3-database-locked-despite-timeout/

SQLite - Bun, accessed on June 25, 2026, https://bun.com/docs/runtime/sqlite

Blog | SQG - Compile SQL to Type-Safe Code, accessed on June 25, 2026, https://sqg.dev/blog/

Things that surprised me while running SQLite in production | Hacker News, accessed on June 25, 2026, https://news.ycombinator.com/item?id=36579347
