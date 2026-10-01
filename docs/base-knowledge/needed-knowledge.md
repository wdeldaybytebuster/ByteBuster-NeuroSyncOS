# Needed Knowledge

## Needed Knowledge

Here are the 20 core Knowledge Bases to develop, organized by functional area.

## I. Core Reasoning & Execution Patterns

These KBs teach the agent how to think, break down problems, and act.

The ReAct (Reason + Act) Loop: * Core Concept: Interleaving thought processes with tool use.

When to use: General problem-solving requiring external data.

Plan-and-Solve (Plan-and-Execute):

Core Concept: Decoupling high-level task planning from step-by-step execution.

When to use: Complex, multi-step user requests where diving straight into execution would cause the agent to lose the plot.

Advanced Thought Topologies (CoT / ToT / GoT):

Core Concept: Chain of Thought, Tree of Thoughts, and Graph of Thoughts for structured deliberation.

When to use: Math, logic puzzles, or strategic planning requiring multiple parallel hypotheses.

Reflexion & Self-Correction:

Core Concept: Evaluating past actions, recognizing errors, and dynamically adjusting the next attempt.

When to use: Code generation loops, failed API calls, or parsing errors.

Prompt Chaining & DAG (Directed Acyclic Graph) Workflows:

Core Concept: Passing the structured output of one prompt directly as the input to the next.

When to use: Predictable, sequential tasks like drafting an interview, extracting metadata, and saving to a database.

## II. Memory & Context Management

These KBs instruct the agent on how to store, retrieve, and distill information over time.

Episodic vs. Semantic Memory:

Core Concept: Distinguishing between event history (what happened) and factual knowledge (what is true).

When to use: Building user profiles or recalling the history of a specific project.

Working Memory & Context Window Pruning:

Core Concept: Summarizing, compressing, and dropping old context to stay within token limits.

When to use: Long-running chat sessions or analyzing massive codebases.

Retrieval-Augmented Generation (RAG) Mechanics:

Core Concept: Chunking, embedding, and retrieving external data to ground the LLM's response.

When to use: Querying large static documents or personal Markdown vaults.

Knowledge Graph & Temporal State:

Core Concept: Mapping entities, their relationships, and how those relationships change over time.

When to use: Cross-referencing complex data, like linking a code commit to a specific architectural decision.

## III. Tooling & Integration

These KBs define how the agent interacts with the outside world safely and effectively.

Model Context Protocol (MCP) Standard:

Core Concept: Standardized communication architecture for connecting AI to external tools and data sources.

When to use: Exposing local SQLite databases, file systems, or external APIs to the agent.

Function Calling & Tool Binding:

Core Concept: The strict mechanics of mapping natural language to API parameters and JSON schemas.

When to use: Executing scripts, querying databases, or triggering webhooks.

Semantic Routing:

Core Concept: Directing user intents to the appropriate specialized tool or LLM based on meaning rather than keywords.

When to use: Deciding whether a prompt needs a lightweight local model or a heavy cloud model.

Structured Output Parsing & Validation:

Core Concept: Forcing the LLM to output strict data shapes (e.g., Zod schemas) and handling validation failures gracefully.

When to use: Whenever the LLM's output is being fed directly into executable code or a database.

## IV. Multi-Agent & Orchestration

These KBs dictate how multiple AI personas work together.

Hierarchical Task Orchestration (The Supervisor):

Core Concept: A primary router agent that delegates sub-tasks to specialized worker agents and compiles their results.

When to use: Broad, multi-domain requests (e.g., "Research this company and draft a financial report").

Multi-Agent Debate & Adversarial Verification:

Core Concept: Using competing agent personas to argue points and a moderator to synthesize the truth.

When to use: High-stakes decision making requiring fact-checking and fallacy reduction.

Context Drift Detection:

Core Concept: Identifying when an agent's current state, or the system's underlying data, diverges from the original goal.

When to use: Long-term project maintenance to ensure code matches the documented specifications.

## V. Safety, Reliability & Operations

These KBs represent the guardrails required for an autonomous system.

Human-in-the-Loop (HITL) & Deference:

Core Concept: Recognizing ambiguity or high-risk actions and pausing to request human approval.

When to use: File deletion, external communications, or modifying critical database records.

Idempotent Execution & Crash Recovery:

Core Concept: Designing agent actions so they can be repeated safely without causing duplicate effects.

When to use: Database writes, workflow queues, and recovering from power loss or system reboots.

Sandboxing & Secure Execution Environments:

Core Concept: Principles of running untrusted, AI-generated code in isolated, permissionless containers.

When to use: Running arbitrary Python or shell scripts generated by the LLM.

Token Budgeting & Fallback Routing:

Core Concept: Dynamically selecting models based on complexity, enforcing request limits, and falling back to secondary providers on failure.

When to use: Managing free-tier API quotas and ensuring system uptime during provider outages.

Which of these five categories do you want to tackle first to start fleshing out the detailed instructions, examples, and rules for the knowledge base?
