# Comparative Architectures, State Dynamics, and Security Paradigms of Large Language Model Function Calling and Tool Integration

Comparative Architectures, State Dynamics, and Security Paradigms of Large Language Model Function Calling and Tool Integration

1. State Dynamics and Trajectory Vulnerability Surfaces

The transition of Large Language Models (LLMs) from static text-completion engines to stateful, tool-augmented agents has redefined the modern software integration landscape [cite: 1, 2, 3]. In traditional application architectures, execution logic is deterministic and bound by compilation-time parameters [cite: 4, 5]. In contrast, agentic environments utilize the LLM as a dynamic, runtime planner that continuously evaluates state updates, matches natural language goals to API signatures, and executes external tools through structured arguments [cite: 6, 7, 8].

This shift relies on the programmatic representation of conversation and execution trajectories [cite: 1, 2]. In a stateful function-calling environment, the application host aggregates developer-defined JSON schemas, structured argument values, real-world tool execution results, validation errors, and natural language dialogue within a single, stateful context window [cite: 1, 2]. This interaction history is structured as a sequence of turns, where the output of one step informs the execution context of the next [cite: 1, 2]. However, this stateful context accumulation creates a unique vulnerability surface [cite: 1, 2]. While traditional safety systems evaluate individual inputs or isolated outputs, they often overlook the risk of coordinated exploits embedded within the stateful trajectory [cite: 1].

A critical threat in this domain is the Stateful Manipulation of Trajectory (SMT) attack [cite: 1]. SMT exploits the model's automated correction and refinement loops by distributing adversarial control across multiple turns [cite: 1]. An attacker can craft a sequence where no single message violates safety guidelines, yet the combined trajectory systematically erodes the model’s internal safety boundaries [cite: 1]. This process moves the system from safety-oriented refusal to task-oriented compliance [cite: 1].

A prime example is the JailbreakFunction exploit, which leverages structured coding constraints, user coercion, and missing system-level filters to bypass alignment rules [cite: 1]. In these scenarios, the attacker inserts fabricated validation exceptions into prior interaction records, forcing the model’s self-correction loop to modify its parameters [cite: 1]. This mechanism is often paired with Odysseus attacks, which employ dual steganography to conceal malicious directives within seemingly benign API schemas and parameters [cite: 1].

This trajectory-centric exploitation paradigm demonstrates that prompt-centric defenses are fundamentally insufficient in multi-turn tool environments [cite: 1, 2]. Because the complete execution history is re-submitted with each subsequent API request, the model’s reasoning is continually guided by the accumulated state [cite: 1]. If an attacker successfully smuggles an instruction into a tool output, that instruction becomes part of the trusted context [cite: 2]. This enables the exploit to persist across multiple turns and subtly steer downstream tool selection and parameter generation [cite: 2].


--------------------------------------------------------------------------------

2. Cognitive Scaffolding, Uncertainty Quantification, and Asynchronous Execution

To improve parameter accuracy and system reliability in production environments, developers must address the limitations of open-loop generation [cite: 14, 15]. Standard tool-calling methods require the language model to generate complex parameters in a single pass without explicit reasoning steps [cite: 14, 16]. This lack of transparency can lead to parameter hallucinations and logical errors, particularly when handling interdependent parameters [cite: 14].

To address these challenges, the Think-Augmented Function Calling (TAFC) framework introduces a cognitive scaffolding mechanism at the tool-calling level [cite: 14]. TAFC uses a universal "think" parameter augmentation that prompts the model to articulate its reasoning before generating parameter values [cite: 14]. By dynamically optimizing parameter descriptions and applying complexity scoring, TAFC triggers granular, parameter-level reasoning only when the complexity of the schema demands it [cite: 14].

This localized reasoning preserves the model’s semantic accuracy and ensures that complex parameters are validated by an internal reasoning trace before execution [cite: 14]. This approach significantly outperforms generic, agent-level chain-of-thought methods by providing targeted, schema-specific guidance [cite: 14].

In parallel, Uncertainty Quantification (UQ) serves as a critical safety mechanism, particularly when function calls have irreversible real-world impacts, such as transferring financial assets or altering system configurations [cite: 17]. UQ methods evaluate the model's confidence in its proposed parameters before executing the action [cite: 17]. While multi-sample UQ methods—such as Semantic Entropy—perform well in natural language tasks, they behave differently in function-calling settings [cite: 17].

To quantify uncertainty in tool calls, multi-sample UQ methods cluster generated outputs by parsing them into an Abstract Syntax Tree (AST) [cite: 17]. This process groups syntactically distinct but functionally identical calls [cite: 17].

Let x be the user query, and \{y_1, y_2, \dots, y_N\} be a set of N sampled tool calls [cite: 17]. These calls are grouped into equivalence classes C based on AST equivalence:

y_i \equiv y_j \iff \text{AST}(y_i) = \text{AST}(y_j)

The probability of each class P(c) is calculated as:

P(c) = \sum_{y_i \in c} P(y_i \mid x)

The semantic entropy of the output distribution is then defined as:

H_{\text{sem}}(x) = -\sum_{c \in C} P(c) \log P(c)

In practice, single-sample UQ methods often match the performance of multi-sample frameworks [cite: 17]. These single-sample approaches calculate logit-based uncertainty scores over only the semantically meaningful tokens (such as parameter values and function names), bypassing structural JSON delimiters like quotes, commas, and curly braces [cite: 17].

Operational efficiency in function calling is also limited by synchronous execution [cite: 20, 21]. In standard systems, each tool call blocks the model's inference process, forcing it to wait for the external executor to return a result [cite: 20]. This synchronous turn-taking blocks concurrent execution and increases overall task latency [cite: 20].

The AsyncLM system resolves this bottleneck by decoupling the model's token generation from external execution, enabling asynchronous tool calling [cite: 20, 21]. In this architecture, the model can generate subsequent tool calls or natural language responses while prior tools execute in the background [cite: 20].

When a background tool finishes, the executor notifies the model by injecting an interrupt token directly into the model's active token decoding stream [cite: 20, 21]. This interrupt signals the model to process the returned data, dynamically updating its execution plan [cite: 20, 21].

By enabling concurrent token generation and tool execution, AsyncLM reduces end-to-end latency by 1.6x to 5.4x on benchmarks like the Berkeley Function Calling Leaderboard (BFCL) [cite: 20, 21].


--------------------------------------------------------------------------------

3. Dynamic Constrained Decoding and Logit Masking Mechanics

When integration environments require strict schema adherence, relying on prompting alone often leads to parsing failures [cite: 15, 22, 23]. To enforce structural correctness, inference engines use constrained decoding, which dynamically restricts the token generation process at each step [cite: 15, 22, 24]. During sampling, the engine masks invalid tokens in the model's vocabulary, ensuring that the output strictly conforms to a specified schema or formal grammar [cite: 15, 22, 24].

The mathematical formulation of constrained decoding relies on a token-level mask calculated from the current state of a formal parser [cite: 15, 24, 25]. Let \mathcal{V} represent the model's vocabulary [cite: 24, 25]. At step k+1, given the generated prefix t_{1:k}, the engine evaluates which tokens in \mathcal{V} are syntactically valid [cite: 24, 25]. This evaluation produces a logit mask \mathbf{m}_{k+1} \in \{0, -\infty\}^{|\mathcal{V}|}, where:

m_{k+1, i} = \begin{cases} 0 & \text{if } t_{1:k} \cdot t_i \text{ is a valid prefix under the grammar} \\ -\infty & \text{otherwise} \end{cases}

This mask is added to the model's raw logits \mathbf{z}_{k+1} before computing the softmax distribution [cite: 15, 24, 25]:

P(t_{k+1} = t_i \mid t_{1:k}, x) = \frac{\exp(z_{k+1, i} + m_{k+1, i})}{\sum_{j \in \mathcal{V}} \exp(z_{k+1, j} + m_{k+1, j})}

This ensures that tokens violating the grammar are assigned a probability of zero, preventing their selection during sampling [cite: 15, 24, 25].

Historically, frameworks like Outlines have implemented this using Finite-State Machines (FSMs) derived from regular expressions or context-free grammars (CFGs) [cite: 15, 24, 26, 27]. While effective, FSMs transition token-by-token, which introduces significant latency and blocks parallel execution in batched environments [cite: 15, 26].

To overcome these bottlenecks, frameworks like XGrammar introduce dynamic Pushdown Automata (PDAs) [cite: 15, 24, 28]. Because PDAs are recursive, they can evaluate complex CFGs and nested JSON structures across multiple tokens simultaneously [cite: 15, 24, 28].

XGrammar optimizes this process using several key techniques [cite: 25]:

TagDispatch: A dynamic dispatching semantics that routes tokens based on grammar state [cite: 25].

JIT Compilation of Adaptive Token Mask Cache: Pre-computes and caches valid token transitions at runtime, bypassing repetitive checks [cite: 25].

Cross-Grammar Caching: Shares compiled grammar states across concurrent requests with similar schemas [cite: 25].

Adaptive Token Mask Cache with Earley Parser: Integrates an Earley parser to handle highly dynamic and context-dependent syntax rules [cite: 25].

Constrained decoding must also handle the boundary mismatch between character-level grammars and the model's subword tokenizer [cite: 19, 26]. Tokenizers merge characters into subword tokens based on frequency, without regard for syntactic boundaries [cite: 19, 26].

For example, when generating JSON, the tokenizer might combine a semantic string with a structural comma or quote into a single token [cite: 26]. If the constrained decoding engine does not account for this, it may incorrectly mask valid tokens [cite: 19, 26].

Furthermore, subword regularization techniques—which introduce stochastic variation during training—can bias the model’s decoding process toward a narrow set of tokenizations [cite: 19].

To mitigate these boundary issues, engines like SGLang compress the transition paths of the FSM [cite: 26]. When the grammar requires static, non-branching sequences (such as key names like "name":), the engine bypasses token-by-token generation [cite: 26]. Instead, it jumps forward, prefilling the static string directly into the context before executing a re-tokenization pass [cite: 26]. This re-tokenization aligns the generated string with the model's canonical subword boundaries, ensuring compatibility and maintaining high throughput [cite: 26].

While constrained decoding guarantees syntax compliance, it can introduce semantic distortion [cite: 29, 30]. Constrained decoding is not a passive formatting filter [cite: 29, 30]. By zeroing out invalid tokens and renormalizing the probability distribution, the engine can force the model into locally valid but globally incorrect trajectories [cite: 29, 30].

When the grammar forces low-entropy syntactic choices (such as quotes or brackets), the model may place very little probability mass on the valid options [cite: 29, 30]. Repeating this renormalization across hundreds of tokens induces a trajectory bias, leading to degraded reasoning performance [cite: 29, 30].

Mathematically, this perturbation can be evaluated as a "projection tax" using the Kullback-Leibler (KL) divergence between the constrained and unconstrained distributions [cite: 29, 30]. Let p_\theta(\cdot \mid h) be the base model's unconstrained probability, and let \mathcal{C} represent the set of grammar-valid tokens at history h [cite: 29, 30]. The constrained distribution p_{\mathcal{C}} is:

p_{\mathcal{C}}(t \mid h) = \begin{cases} \frac{p_\theta(t \mid h)}{\sum_{t' \in \mathcal{C}} p_\theta(t' \mid h)} & \text{if } t \in \mathcal{C} \\ 0 & \text{otherwise} \end{cases}

The KL divergence is formulated as:

D_{\text{KL}}(p_{\mathcal{C}} \parallel p_\theta) = \sum_{t \in \mathcal{C}} p_{\mathcal{C}}(t \mid h) \log \left( \frac{p_{\mathcal{C}}(t \mid h)}{p_\theta(t \mid h)} \right) = -\log \left( \sum_{t' \in \mathcal{C}} p_\theta(t' \mid h) \right)

As the probability mass of the valid set \sum_{t' \in \mathcal{C}} p_\theta(t' \mid h) approaches zero, the KL divergence increases, representing severe semantic distortion [cite: 29, 30].

To address this distortion, Draft-Conditioned Constrained Decoding (DCCD) decouples semantic planning from structural enforcement [cite: 29, 30]. DCCD runs in a two-step process: first, the model generates an unconstrained draft that captures its reasoning and semantic plan; second, constrained decoding is executed, conditioned on this draft [cite: 29, 30]. This conditioning shifts the model's probability mass toward schema-conforming paths, minimizing the projection tax and preserving reasoning accuracy [cite: 29, 30].


--------------------------------------------------------------------------------

4. Tool Learning Data Syntheses and Dynamic Parameter Mapping

The reliability of tool integration depends heavily on the quality of the model's training data [cite: 31]. While early benchmarks used static data, modern systems require models that can generalize to updated APIs and handle complex, multi-step tasks [cite: 31, 32, 33].

The ToolACE framework addresses this by using a Tool Self-Evolution Synthesis (TSS) pipeline to automate the generation of diverse tool-learning data [cite: 31]. TSS uses a speciation-adaptation-evolution process to generate realistic APIs across multiple domains [cite: 31]. It dynamically scales complexity using the model itself as a complexity evaluator, curating a highly diverse training pool of over 26,000 APIs [cite: 31].

This is paired with benchmarks like NESTful, which evaluate models on nested sequencing [cite: 32, 33]. NESTful focuses on tasks where the output of one API call is passed as an input argument to a subsequent tool [cite: 32, 33]. To track these dependencies without collisions, NESTful assigns unique variable references to intermediate outputs, testing the model's ability to plan and execute complex, multi-step workflows [cite: 33].

Historically, projects like Gorilla and APIBench mapped natural language directly to complex machine learning APIs from hubs like TorchHub, TensorHub, and HuggingFace [cite: 34, 35, 36]. These models were evaluated using an AST matching metric to verify functional correctness [cite: 34, 36].

To keep pace with rapidly changing APIs, Gorilla integrated with external document retrievers [cite: 34, 35]. This approach was formalized as Retrieval-Aware Fine-Tuning (RAFT), which trains models to adapt to document changes at test time [cite: 36].

This is supported by ToolGT, which uses template-based structured reasoning to guide models through five key stages of function calling [cite: 37]:

Identification of target functions [cite: 37].

Evaluation of function relevance [cite: 37].

Verification against API documentation [cite: 37].

Extraction and validation of parameter values [cite: 37].

Conversion of parameter types to match the target schema [cite: 37].

When executing tool calls, systems must map natural language inputs to dynamic endpoints [cite: 8, 38]. In environments like ElevenLabs Webhook Tools, path, body, and query parameters are extracted dynamically from user dialogue [cite: 38].

If an API requires path parameters, they are mapped using dynamic placeholders within the target URL (such as /api/resource/{id}) [cite: 38]. This mapping must handle varying data inputs across diverse schemas [cite: 39].

For example, workflow automation tools like n8n use wildcard paths (such as /api/gateway/*) to capture dynamic parameters [cite: 40]. These paths are parsed into arrays for downstream execution [cite: 40]:

Similarly, Make.com dynamically extracts query parameters into key-value collections while filtering out static system values [cite: 39].

To secure these integrations, Webhook frameworks automate authentication using OAuth 2.0 client credentials or JSON Web Tokens (JWT) [cite: 11, 38]. The host application handles the authentication handshake, ensuring that sensitive credentials are kept secure and separate from the model's context [cite: 38, 41].

At the compilation level, chat templates format these stateful, multi-turn interactions into a single tokenizable string [cite: 42, 43]. Jinja2 templates process conversation structures containing distinct system, user, assistant, and tool roles [cite: 42, 43].

These templates enforce role boundaries by injecting control tokens, such as <|im_start|> and <|im_end|> in ChatML, or [INST] and [/INST] in Mistral [cite: 43, 44, 45]. This formatting maintains structural integrity, preventing the model from misinterpreting parameter values or validation feedback as system-level commands [cite: 44].


--------------------------------------------------------------------------------

5. Structured Data Extraction Paradigms: BAML vs. Instructor vs. Pydantic

To enforce structured data extraction, developers must evaluate the trade-offs between prompting-based libraries and compilation-based approaches [cite: 46, 47]. The choice of framework determines how the system handles schema serialization, validation, and parsing errors [cite: 46, 47].

Instructor and Pydantic-AI use standard Python Pydantic models to define target schemas [cite: 46, 47]. They serialize these schemas into verbose JSON Schema strings that are appended to the system prompt [cite: 18, 47, 48]. If the model generates malformed JSON, the library parses the exception and executes a retry loop, querying the model with the validation error until it complies or hits a retry limit [cite: 18, 46, 47, 49].

While simple, this prompting-and-retry approach increases latency and token consumption [cite: 18, 47, 49]. It also limits portability, as it relies on specific, highly capable models that support tool calling [cite: 47, 49].

In contrast, native schema-enforced APIs (such as OpenAI's Strict Mode) enforce compliance at the inference engine level using constrained decoding [cite: 22, 48, 50]. This approach guarantees 100% schema compliance [cite: 48, 50, 51].

However, native enforcement is tied to specific cloud providers and supports only a subset of the JSON Schema standard [cite: 47, 50, 52]. OpenAI's implementation, for instance, requires all fields to be marked as required [cite: 48, 52, 53]. Optional fields must be emulated using union types with null, such as type: ["string", "null"] [cite: 48, 52, 53].

Furthermore, these APIs enforce structural limitations [cite: 52]:

Schemas must set additionalProperties: false on all objects [cite: 48, 50, 52].

Nesting depth is limited to 5 levels [cite: 52].

The total number of properties cannot exceed 100 [cite: 52].

Unsupported keywords include minLength, maxLength, pattern, format, and uniqueItems [cite: 52].

BAML (Boundary AI Markup Language) addresses these limitations by introducing a declarative, domain-specific programming language for structured text extraction [cite: 18, 46, 47]. BAML decouples schema definitions from both the model and the target application code [cite: 47, 49].

BAML compiles its TypeScript-like DSL schemas into highly optimized, native client bindings for languages like Python, TypeScript, and Go [cite: 46, 47, 49].

BAML replaces verbose JSON Schema strings with a compressed schema format, reducing prompt token overhead by up to 4x [cite: 18, 47].

Instead of using constrained decoding to force the model's token generation, BAML allows the model to reason freely before parsing the output with its Rust-based Schema-Aligned Parsing (SAP) engine [cite: 18, 47, 49].

SAP extracts structured data from loose, malformed, or partially generated text [cite: 18, 46]. It resolves common formatting issues without requiring API retry loops [cite: 18, 47, 49]:

Strips inline comments and markdown code fences [cite: 47, 49].

Corrects missing quotes and unescaped newlines [cite: 49].

Coerces data types and handles trailing commas [cite: 47, 49].

Resolves mathematical expressions and fractions [cite: 49].

Enables type-safe streaming of partial responses [cite: 47].


--------------------------------------------------------------------------------

6. Security Architectures for Executable Sandboxes and Database Layers

Integrating autonomous agents with transactional database layers introduces severe security risks [cite: 4, 54]. A common vulnerability is the direct interpolation of model-generated parameters into raw SQL queries [cite: 54].

For example, exploits in frameworks like Anything-LLM have shown that inserting unsanitized parameters into JavaScript template literals allows SQL injection [cite: 54]:

An attacker can exploit this via direct prompt injection or indirect prompt injection in retrieved documents, executing destructive SQL commands like UNION injections or table deletions [cite: 4, 54].

To secure these systems, architectures must prevent models from generating raw, executable SQL [cite: 4]. Instead, the system should restrict the model's output to structured JSON schemas representing specific, validated intents [cite: 4].

This intent-driven paradigm ensures that query structures are defined at compilation time [cite: 4]. At runtime, parameters are passed separately to the database driver, preventing injection attacks [cite: 4, 55].

Additionally, systems should execute an EXPLAIN plan to estimate query costs before execution, rejecting resource-intensive requests that could cause denial-of-service [cite: 4].

When agents must execute arbitrary, model-generated code (such as Python data analysis or bash scripts), isolating the execution environment is critical [cite: 41, 56, 57]. Two primary patterns govern sandbox integration:

Pattern 1 (Agent inside Sandbox): The agent runs entirely within the isolated environment and communicates with the host over virtual networks [cite: 41]. This mirrors local development but exposes conversation states, memory, and sensitive credentials to the untrusted sandbox [cite: 41].

Pattern 2 (Sandbox as Tool): The agent runs on a secure host server and calls the sandbox remotely as an execution utility [cite: 41]. This maintains a clean separation of concerns: sensitive API keys and conversation states are kept secure on the host, while code execution is isolated [cite: 41].

Production-grade sandboxes utilize technologies like Firecracker microVMs (such as E2B) or gVisor-based containers (such as Modal) [cite: 57, 58, 59]. Firecracker uses a minimalist virtual machine monitor to run lightweight Linux kernels in isolated microVMs, emulating only essential virtual devices to minimize the attack surface [cite: 58, 59].

These environments are optimized using pre-warmed memory snapshots to achieve cold-start times of approximately 150 milliseconds [cite: 56, 59].

Alternatively, ZeroBoot uses Copy-on-Write (CoW) memory virtualization to eliminate memory-copy overhead [cite: 59]. However, write-intensive workloads can trigger memory amplification, causing physical memory footprints to expand to the full size of the VM [cite: 59].

To secure these execution runtimes, systems enforce strict access controls [cite: 56]:

Enforce cgroups v2 resource limits, such as cpu.max, memory.max, and pids.max, to prevent fork bombs and memory exhaustion [cite: 56].

Apply read-only root filesystems, scoping writable directories to /tmp with noexec and nosuid flags [cite: 56].

Block external network access by default, restricting outbound connections to verified, allowlisted domains [cite: 56].

Enforce execution timeouts at the orchestration layer to prevent runaway processes [cite: 56].

In financial and blockchain integrations, sandboxes are secured using Non-Human Identity (NHI) scoping [cite: 60]. This assigns a unique cryptographic identity to each agent, ensuring that transactions must be verified by a multisig wallet (such as Squads V4) before execution [cite: 60].

These transaction flows are validated using AgentSentry to defend against multi-turn Indirect Prompt Injection [cite: 2, 13].

AgentSentry monitors interactions at tool-return boundaries, running counterfactual re-executions of the prompt trajectory to evaluate the causal driver of the proposed action [cite: 2, 13].

If the diagnostics indicate that the action is driven by injected context rather than the user's primary goal, the system triggers context purification [cite: 2, 13]. This process strips the adversarial instructions from the state while preserving the necessary semantic data, allowing the safe continuation of the workflow without terminating the agent session [cite: 2, 13].


--------------------------------------------------------------------------------

7. Conclusions and System Design Recommendations

Based on the evaluation of stateful trajectories, constrained decoding, and security architectures, developers should adopt the following design patterns for production-grade agentic systems:

De-couple Syntax and Semantics via BAML: Standardize on Schema-Aligned Parsing (SAP) to bypass the latency and reasoning degradation of constrained decoding [cite: 47, 49]. Use concise DSL schemas to minimize token consumption and reduce costs [cite: 18, 47].

Enforce Dynamic Logit Masking using PDAs: When absolute schema compliance is required, use PDA-based engines like XGrammar rather than standard FSM engines to maintain high throughput in batched environments [cite: 15, 24, 28].

Implement Intent-Driven Database Access: Prevent models from generating raw SQL [cite: 4]. Restrict outputs to intent schemas, translating parameters into pre-defined, parameterized templates executed with scoped database permissions [cite: 4].

Isolate Execution in Ephemeral microVMs: Run all model-generated code in isolated sandboxes like Firecracker microVMs [cite: 57, 58]. Enforce resource limits using cgroups v2, and keep sensitive credentials isolated on the secure host [cite: 41, 56].

Deploy Stateful Trajectory Auditing: Implement boundary-level causal diagnostics (such as AgentSentry) to detect and mitigate multi-turn prompt injections, ensuring safe continuation in long-running workflows [cite: 2, 13].


--------------------------------------------------------------------------------

Beyond the Prompt: Jailbreaking Function-Calling LLMs via Simulated Moderation Traces Disclaimer. This paper contains examples of harmful language. Reader discretion is recommended. - arXiv, https://arxiv.org/html/2607.00481

AgentSentry: Mitigating Indirect Prompt Injection in LLM Agents via Temporal Causal Diagnostics and Context Purification - arXiv, https://arxiv.org/html/2602.22724v1

What is the Model Context Protocol (MCP)? - Databricks, https://www.databricks.com/blog/what-is-model-context-protocol

Why You Shouldn't Use LLMs To Generate SQL (Security Risks) - Protecto AI, https://www.protecto.ai/blog/llm-generated-sql-risks/

How Do LLMs Handle Function Calls with External Libraries/APIs? : r/AI_Agents - Reddit, https://www.reddit.com/r/AI_Agents/comments/1ic8lo5/how_do_llms_handle_function_calls_with_external/

Model Context Protocol (MCP) explained: A practical technical overview for developers and architects - CodiLime, https://codilime.com/blog/model-context-protocol-explained/

Model Context Protocol Explained in 3 Levels of Difficulty - Machine Learning Mastery, https://machinelearningmastery.com/model-context-protocol-explained-in-3-levels-of-difficulty/

User-Aligned Functions to Improve LLM-to-API Function-Calling Accuracy - Medium, https://medium.com/@patc888/user-aligned-functions-to-improve-llm-function-calling-accuracy-to-apis-2192fde6ce67

Defending AI Systems Against Prompt Injection Attacks - Wiz, https://www.wiz.io/academy/ai-security/prompt-injection-attack

Protecting against indirect prompt injection attacks in MCP - Microsoft for Developers, https://developer.microsoft.com/blog/protecting-against-indirect-injection-attacks-mcp

Model Context Protocol (MCP) - Black Hills Information Security, Inc., https://www.blackhillsinfosec.com/model-context-protocol/

What is Indirect Prompt Injection? Risks & Prevention - SentinelOne, https://www.sentinelone.com/cybersecurity-101/cybersecurity/indirect-prompt-injection-attacks/

AgentSentry: Mitigating Indirect Prompt Injection in LLM Agents via Temporal Causal Diagnostics and Context Purification - arXiv, https://arxiv.org/pdf/2602.22724

[2601.18282] Think-Augmented Function Calling: Improving LLM Parameter Accuracy Through Embedded Reasoning - arXiv, https://arxiv.org/abs/2601.18282

Structured Decoding in vLLM: a gentle introduction, https://vllm.ai/blog/2025-01-14-struct-decode-intro

Text-to-SQL LLM : A Practical Guide - PuppyGraph, https://www.puppygraph.com/blog/text-to-sql-llm

[2604.22985] Uncertainty Quantification for LLM Function-Calling - arXiv, https://arxiv.org/abs/2604.22985

The Prompting Language Every AI Engineer Should Know: A BAML Deep Dive - Towards AI, https://pub.towardsai.net/the-prompting-language-every-ai-engineer-should-know-a-baml-deep-dive-6a4cd19a62db

Marco Cognetta's research while affiliated with Institute of Science Tokyo and other places, https://www.researchgate.net/scientific-contributions/Marco-Cognetta-2144370498

Asynchronous LLM Function Calling - arXiv, https://arxiv.org/html/2412.07017v1

[2412.07017] Asynchronous LLM Function Calling - arXiv, https://arxiv.org/abs/2412.07017

LLM Structured Outputs: Schema Validation for Real Pipelines (2026) - Collin Wilkins, https://collinwilkins.com/articles/structured-output

Structured outputs - Claude Platform Docs, https://platform.claude.com/docs/en/build-with-claude/structured-outputs

When Grammar Guides the Attack: Uncovering Control-Plane Vulnerabilities in LLMs with Structured Output - arXiv, https://arxiv.org/html/2503.24191v3

1 Introduction - arXiv, https://arxiv.org/html/2601.04426v1

Fast JSON Decoding for Local LLMs with Compressed Finite State Machine - LMSYS Org, https://www.lmsys.org/blog/2024-02-05-compressed-fsm/

Thinking Before Constraining: A Unified Decoding Framework for Large Language Models, https://arxiv.org/html/2601.07525v2

Structured Output Guide — vllm-ascend, https://docs.vllm.ai/projects/ascend/zh-cn/v0.9.2rc1/user_guide/feature_guide/structured_output.html

Appendix - arXiv, https://arxiv.org/html/2603.03305v2

The Hidden Cost of Structured Generation in LLMs: Draft-Conditioned Constrained Decoding - arXiv, https://arxiv.org/pdf/2603.03305

ToolACE: Winning the Points of LLM Function Calling - arXiv, https://arxiv.org/html/2409.00920v2

NESTful: A Benchmark for Evaluating LLMs on Nested Sequences of API Calls - arXiv, https://arxiv.org/html/2409.03797v2

A Benchmark for Evaluating LLMs on Nested Sequences of API Calls - arXiv, https://arxiv.org/html/2409.03797v3

Gorilla: Large Language Model Connected with Massive APIs - arXiv, https://arxiv.org/pdf/2305.15334

[2305.15334] Gorilla: Large Language Model Connected with Massive APIs - arXiv, https://arxiv.org/abs/2305.15334

BoundaryML/berkeley-gorilla: Gorilla: An API store for LLMs - GitHub, https://github.com/BoundaryML/berkeley-gorilla

Improving Large Language Models Function Calling and Interpretability via Guided-Structured Templates - arXiv, https://arxiv.org/html/2509.18076v1

Webhook tools | ElevenLabs Documentation, https://elevenlabs.io/docs/eleven-agents/customization/tools/webhook-tools

How to dynamically process URL parameters from webhook when field names vary?, https://community.make.com/t/how-to-dynamically-process-url-parameters-from-webhook-when-field-names-vary/87306

How to Create an n8n Webhook to Handle Dynamic URL Parameters?, https://community.n8n.io/t/how-to-create-an-n8n-webhook-to-handle-dynamic-url-parameters/86508/6

The two patterns by which agents connect sandboxes - LangChain, https://www.langchain.com/blog/the-two-patterns-by-which-agents-connect-sandboxes

Conversation - Axolotl Docs, https://docs.axolotl.ai/docs/dataset-formats/conversation.html

Chat Templates - Hugging Face, https://huggingface.co/docs/transformers/v4.45.1/chat_templating

Chapter 7: Rendering with Templates - The ChatML (Chat Markup Language) Handbook, https://the-chatml-handbook.ranjankumar.in/chapters/chapter7.html

jndiogo/LLM-chat-templates: Jinja2 chat templates for popular LLM models - GitHub, https://github.com/jndiogo/LLM-chat-templates

Pydantic vs Instructor vs BAML: Which One Actually Solves LLM Output Parsing in Production? | by Raj Kundalia | Medium, https://medium.com/@rajkundalia/how-baml-brings-engineering-discipline-to-llm-powered-systems-983c06d31bf8

BAML: The Structured-Output Power Tool Your LLM Workflow Has Been Missing - Medium, https://medium.com/@manavisrani07/baml-the-structured-output-power-tool-your-llm-workflow-has-been-missing-f326046d019b

OpenAI Structured Outputs: Complete Developer Guide - Digital Applied, https://www.digitalapplied.com/blog/openai-structured-outputs-complete-guide

Prompting vs JSON Mode vs Function Calling vs Constrained Generation vs SAP - BAML, https://boundaryml.com/blog/schema-aligned-parsing

Beyond JSON Mode: Getting Reliable Structured Outputs from LLMs in Production, https://tianpan.co/blog/2025-10-29-structured-outputs-llm-production

Why structured outputs / strict JSON schema became non-negotiable in production agents, https://www.reddit.com/r/AI_Agents/comments/1qeetme/why_structured_outputs_strict_json_schema_became/

How to use structured outputs with Azure OpenAI in Microsoft Foundry Models, https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/structured-outputs

Strict=True and Required Fields! - Feedback - OpenAI Developer Community, https://community.openai.com/t/strict-true-and-required-fields/1131075

SQL Injection in Built-in SQL Agent Plugin via Unsanitized table_name Parameter - GitHub, https://github.com/Mintplex-Labs/anything-llm/security/advisories/GHSA-jwjx-mw2p-5wc7

Secure Text-to-SQL Generation with Private LLMs: A Complete Guide to Data-Driven Insights - C4Scale, https://c4scale.com/blog/secure-text-to-sql-generation-with-private-llms-a-complete-guide-to-data-driven-insights/

What Is an Agent Execution Sandbox? - Augment Code, https://www.augmentcode.com/guides/agent-execution-sandbox

Best Code Execution Sandboxes for AI Agents in 2026 | Modal Blog, https://modal.com/resources/best-code-execution-sandboxes-ai-agents

E2B vs Modal: comparing AI code execution sandboxes in 2026 | Blog - Northflank, https://northflank.com/blog/e2b-vs-modal

AI Agent Code Execution Sandboxes: Isolation from Containers to MicroVMs - Addo Zhang, https://addozhang.medium.com/ai-agent-code-execution-sandboxes-isolation-from-containers-to-microvms-e80848effea5

Glossary of Agentic Security | AgentSentry, https://agentsentry.net/glossary
