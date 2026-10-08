# Comparative Analysis of Interleaved Cognitive Deliberation and Tool-Based Execution in Language Agents: Operational Mechanics, Benchmarks, and Architectural Successors

Comparative Analysis of Interleaved Cognitive Deliberation and Tool-Based Execution in Language Agents: Operational Mechanics, Benchmarks, and Architectural Successors

Autonomous systems have transitioned from static, single-turn text generators into dynamic agents capable of navigating complex, interactive environments [cite: 1, 2]. Traditionally, artificial intelligence architectures addressed conceptual thought tracing (such as CoT and step-by-step logic modeling) and action-oriented control (such as tool-use APIs and web navigation controllers) as separate operational paradigms [cite: 3, 4]. CoT prompting demonstrated that externalizing intermediate computational steps significantly improves performance on closed-world arithmetic and symbolic tasks [cite: 5, 6]. However, because it relies entirely on a model’s internal parametric weights, this method lacks grounding in the external world, leading to factual errors, planning drift, and an inability to incorporate real-time context [cite: 6, 7, 8]. Conversely, action-only platforms enable tool execution and API integration, yet they suffer from a lack of high-level planning, struggling to decompose complex targets or adapt to dynamic environmental feedback [cite: 6, 9, 10].

To reconcile these deficiencies, the interleaved paradigm—known as ReAct—was introduced to combine linguistic deliberation with external environment actions in an interactive loop [cite: 3, 4, 11]. In this framework, the model generates structured thought traces and discrete action selections in an interleaved manner [cite: 3, 11]. This closed-loop design establishes a dynamic feedback mechanism: logical deliberation traces guide the system in generating, tracking, and adjusting high-level plans, while environment observations update and correct the agent's internal state [cite: 6, 12, 13]. This synergy closely mirrors human cognitive processes, specifically the reliance on an internal monologue to self-regulate behavior and adapt to uncertain situations [cite: 8, 9]. Instead of a black-box, single-turn execution, this cycle provides a highly transparent, human-interpretable trajectory where each step is auditable and correctable by human operators [cite: 6, 7, 13].


--------------------------------------------------------------------------------

Mathematical Formalization of the Cognitive Loop

To analyze these interactive systems, the environment is modeled as a Partially Observable Markov Decision Process (POMDP) or an abstract State-Centric Decision Process (SDP) [cite: 12, 14, 15]. Let the environment be defined by the tuple:

\mathcal{E} = (\mathcal{T}, \mathcal{S}, \mathcal{A}, \mathcal{P}, \mathcal{R})

where \mathcal{T} represents the task space, \mathcal{S} represents the state space, \mathcal{A} represents the action space, \mathcal{P} represents the transition probability distribution, and \mathcal{R} represents the reward model [cite: 16].

Under a standard autoregressive setup, an agent parameterized by weights \theta predicts the next token based on a conditional distribution over a vocabulary \mathcal{V} [cite: 2, 17]:

p_\theta(x_t \mid x_{<t}) = \text{softmax}(f_\theta(x_{<t}))

Let us denote latent deliberation variables as \tau (the thought traces) and environmental actions as a [cite: 12, 17]. At any discrete time step t, given a compiled context history c_{t-1} consisting of all preceding actions, observations, and thoughts, the cognitive process unfolds as follows [cite: 12]:

\tau_t \sim \pi_\theta^{\text{thought}}(\cdot \mid c_{t-1})

a_t \sim \pi_\theta^{\text{action}}(\cdot \mid c_{t-1} \oplus \tau_t)

c_t = c_{t-1} \oplus \{\tau_t, a_t, o_t\}

where o_t \in \mathcal{O} represents the observation feedback retrieved by executing a_t within the environment, and \oplus represents string concatenation [cite: 10, 12]. This loop continues iteratively until a termination condition is met, typically denoted by a_t = \text{Finish}[y] [cite: 7, 10, 12].

In scenarios with high observational uncertainty, the agent can model structural dependencies using directed acyclic graphs [cite: 18]. The model discovers latent variables V_i and parent dependencies to formulate joint probability distributions [cite: 18]:

P(V_1, V_2, \dots, V_n) = \prod_{i=1}^n P(V_i \mid \text{Parents}(V_i))

The agent executes actions to resolve posterior distributions via numerical Bayesian updates, avoiding logic errors through explicit probabilistic constraints [cite: 18].

Under a State-Centric Decision Process (SDP), the history is mapped to abstract predicates via an observation-to-state mapping \phi : \mathcal{H} \to \mathcal{S} [cite: 14]. The decision space is decomposed into planning over state sequences and choosing actions to satisfy target states [cite: 14]:

(\hat{s}_1, \dots, \hat{s}_n)^* = \arg\max \mathbb{P}(\text{plan reaches } g \mid s_0)

a_t^* = \arg\max \mathbb{P}(\text{Validate}(\hat{s}_{t+1}, \text{Env}(a)) \ge 1 \mid s_t, \hat{s}_{t+1})

This decoupling ensures that actions serve to validate a target predicate state rather than reacting to raw text outputs [cite: 14].


--------------------------------------------------------------------------------

Empirical Benchmarks and Quantitative Performance Synthesis

The empirical baseline of the interleaved loop was validated using the PaLM-540B model across several complex tasks [cite: 7, 8, 13]. These tasks evaluate performance on knowledge-intensive domains (HotpotQA and FEVER) and interactive physical/digital navigation environments (ALFWorld and WebShop) [cite: 7, 13, 19].

HotpotQA is a challenging multi-hop question-answering dataset requiring multi-step search and information synthesis [cite: 7, 20].

FEVER is a fact verification dataset where claims must be classified as supported, refuted, or containing insufficient information [cite: 21].

ALFWorld is a synthetic household text-based simulator requiring sequential physical task execution [cite: 7, 21].

WebShop is an online shopping simulator requiring agents to navigate product search and execute purchases based on detailed instructions [cite: 7, 21].

## Quantitative Evaluation on Knowledge-Intensive Tasks

The table below details the performance of different prompting configurations on HotpotQA and FEVER [cite: 8]:

## Quantitative Evaluation on Interactive Environments

The table below details the performance of the interleaved loop compared to imitation and reinforcement learning on interactive benchmarks [cite: 7, 13]:

These benchmarks demonstrate a clear performance trade-off [cite: 24]. On HotpotQA, CoT prompting outperforms standard ReAct by 2.0% in exact match accuracy [cite: 24]. This occurs because purely logical problems with static facts are easily resolved via a model's internal representations [cite: 23, 24]. When forced into the strict text formats of the ReAct API loop, the model loses flexibility, and retrieving non-informative search results can derail its internal thought progression [cite: 7, 23]. Conversely, on FEVER, where claims are often counter-intuitive and require verification, ReAct outperforms CoT by 4.6% [cite: 24]. This demonstrates that grounding thoughts in verifiable search results is critical for tasks requiring up-to-date information [cite: 7, 27, 28].


--------------------------------------------------------------------------------

Cognitive Failure Modes and Behavioral Deficiencies

A manual evaluation of incorrect predictions reveals stark differences in failure typologies between purely conceptual models and those employing interleaved loops [cite: 24].

## Purely Conceptual Deliberation Failures

CoT models rely entirely on parameters modified during training, making them vulnerable to factual drift [cite: 24]. Case studies on HotpotQA reveal that CoT-only agents fail due to factual hallucinations in approximately 56% of incorrect outcomes [cite: 24]. In these cases, the model generates logical chains that seem plausible but rely on hallucinated or obsolete premises, leading to incorrect final responses [cite: 4, 29].

## Interleaved Loop Vulnerabilities

By grounding updates in external data, the interleaved loop reduces factual hallucinations to 6% [cite: 7]. However, this structure introduces distinct physical and operational failure modes [cite: 7, 23]:

Rigidity and Structural Bottlenecks: Enforcing the Thought-Action-Observation sequence limits formatting flexibility [cite: 7, 23]. This occasionally causes spelling, formatting, or parsing errors, increasing logical mistakes compared to unconstrained verbal scratchpads [cite: 7, 23].

Cascading Observation Errors: The model is highly dependent on the quality of retrieved search results [cite: 7, 23]. If the initial action yields uninformative or incorrect observations, the agent struggles to recover, generating invalid plans that propagate errors throughout the rest of the execution [cite: 7, 23].

Cognitive Overload and Operational Drift: Long execution runs generate verbose history text, which clutters the model's working context [cite: 24]. At steps above 50, planning coherence often collapses, a phenomenon termed 'cognitive overload' [cite: 24]. At this stage, the agent's working context becomes filled with redundant reasoning traces, making it difficult to maintain a stable focus on the primary task [cite: 24].


--------------------------------------------------------------------------------

Parameter-Efficient Adaptations: Prompting versus Post-Training Bootstrapping

To overcome the limits of hand-crafted prompts and improve performance on smaller models, researchers use a bootstrapping approach to collect execution trajectories [cite: 4, 8].

This bootstrap training strategy proceeds through a multi-step pipeline:

Trajectory Generation: The agent is executed over a training set of approximately 3,000 tasks, generating complete trajectories of interleaved thoughts, actions, and observations [cite: 4, 8].

Filtering: Trajectories that yield incorrect final responses are discarded, retaining only successful examples of interleaved logical tracking and action execution [cite: 4, 8].

Fine-Tuning: The remaining successful trajectories are used to fine-tune smaller model parameters (such as PaLM-8B and PaLM-62B) via standard supervised objectives [cite: 4, 8]:

\mathcal{L}(\theta) = -\sum_{i=1}^M \log p_\theta(y_i \mid x_i)

This fine-tuning approach demonstrates that the interleaved ReAct format is the most robust training structure across model scales [cite: 4]. It enables smaller fine-tuned models to significantly outperform prompted larger models [cite: 4]. For example, an 8B model fine-tuned on ReAct trajectories outperforms a prompted 62B model, while a fine-tuned 64B model outperforms a prompted 540B model [cite: 21]. This confirms that post-training makes the model's cognitive planning much more parameter-efficient, reducing context overhead and improving model execution at smaller scales [cite: 4, 21].


--------------------------------------------------------------------------------

Architectural Successors and Multi-Paradigm Evolutions

To address the limitations of the sequential ReAct loop, several advanced architectures have been developed to improve execution speed, cost, and planning robustness [cite: 30, 31, 32, 33].

Modular Reasoning, Knowledge, and Language (MRKL): Features modular routing [cite: 34, 35]. The model acts as a router, directing inputs to hardcoded experts (such as calculators or SQL databases) [cite: 34, 36]. This avoids recursive context overhead and guarantees exact calculation outputs [cite: 34, 37].

Toolformer: Focuses on inline execution without explicit planning loops [cite: 30, 38]. The model calls tools natively during generation [cite: 30]. It is trained to generate API calls as normal text tokens, inserting them inline where they improve text prediction accuracy [cite: 30, 37].

Reflexion: Introduces dynamic verbal feedback across trials [cite: 31, 39]. Instead of updating parameters, a self-reflection engine analyzes failed executions and stores lessons in an episodic memory buffer [cite: 31, 39]. This buffer is added to the context of the next run, allowing the model to improve performance over time [cite: 31, 39].

Plan-and-Solve / Plan-and-Execute: Decouples global planning from execution [cite: 33, 40]. A high-level planner generates a complete roadmap, while a simpler executor runs each step [cite: 33, 41]. A re-planner model is called only if execution fails, saving token costs and reducing planning drift [cite: 41].

LLMCompiler: Orchestrates tool calls in parallel by compiling dependencies into a Directed Acyclic Graph (DAG) [cite: 32, 42]. It schedules independent calls concurrently and uses placeholder tokens to resolve dependencies dynamically [cite: 32, 42]. This parallel execution reduces wall-clock time and token costs over standard sequential loops [cite: 24, 42].

## Comparative Paradigm Synthesis

The table below provides an overview of these architectural paradigms [cite: 30, 31, 32, 41]:


--------------------------------------------------------------------------------

Engineering Implementations and Production Orchestration Models

Deploying interleaved deliberation-execution loops in production requires wrapping model calls in structured state management frameworks to handle latency, context limits, and execution safety [cite: 44, 46, 48].

## LangGraph State-Machine Architecture

LangGraph models interactions as a state graph [cite: 49, 50]. This architecture is built on three core components:

State: A central, persistent structure (using TypedDict or Pydantic models) that acts as the agent's memory [cite: 49, 50].

Nodes: Execution units (functions or runnables) that perform actions or call models, returning updates to the central state [cite: 49, 50].

Edges: Control links that decide the next node to run based on the current state [cite: 49, 50]. Conditional edges read the state and dynamically route execution, enabling conversational checkpointing, step-by-step validation, and robust error recovery [cite: 50, 51, 52].

## LlamaIndex Workflows

LlamaIndex Workflows utilizes an async-first, event-driven pattern to orchestrate agents without the rigidity of strict DAGs [cite: 50]. This architecture relies on two key components:

Events: Custom Pydantic models that carry payload data and trigger execution steps [cite: 50].

Steps: Asynchronous python functions decorated with @step that listen for specific event types and emit new events to trigger downstream operations [cite: 50, 53]. Step outputs are automatically routed to downstream steps based on type hints, enabling parallel flows and dynamic agent handoffs [cite: 50].

## Production Optimization Strategies

For engineering teams deploying these agent loops at scale, several optimizations are critical:

Context Management: Implement context engineering to summarize long interaction histories and manage context limits [cite: 44, 46]. This prevents context bloat, reduces token consumption, and maintains planning focus [cite: 44, 46].

Parallel Tool Execution: Use frameworks like LLMCompiler to execute independent tool calls concurrently, capping latency at the speed of the slowest single call [cite: 32, 42, 54].

Execution Guardrails: Implement execution controls, such as rate limits on API calls, structured tool schemas, and strict fallback rules [cite: 44, 46, 48]. If a high-tier model fails to generate a valid action format, the workflow should route to a fallback parser or human-in-the-loop validation to prevent infinite loops [cite: 44, 46, 48].

Credential Isolation: Ensure strict security boundary separation, preventing models from accessing raw API secrets and protecting against prompt injection risks [cite: 44, 48].


--------------------------------------------------------------------------------

Emerging Research Vectors and the Path to Latent-Space Deliberation

The traditional reliance on text interfaces means that modern models still serialize historical context, retrieved evidence, and intermediate thoughts into text sequences [cite: 55]. This sequential constraint acts as a bottleneck, causing linguistic redundancy, slow inference, and execution fragility [cite: 56]. To address these limitations, emerging research is exploring several key paradigms:

## Latent-Space Processing (e.g., MIRAGE)

Rather than generating long, human-readable text traces, models compress explicit plans into compact hidden vectors [cite: 56, 57]. The model trains its internal representations to act as a world model, predicting how the environment will respond before executing an action [cite: 57]. This allows the agent to reason internally within its latent space, eliminating text-generation latency and enabling real-time execution in fast environments [cite: 56, 57].

## Structured Diagnostic Architectures (e.g., EoG)

Frameworks like Explanations over Graphs (EoG) guide models to mine evidence over dynamic dependency graphs, ensuring non-monotonic updates [cite: 58]. This structured environment isolation improves diagnostic precision and run-to-run consistency over standard sequential loops [cite: 58].

## Real-Time Parallel Decoding (e.g., RealtimeTool)

Uses multi-head decoding to compress structured formatting and generate function arguments in parallel [cite: 59]. This reduces low-entropy token generation, achieving a 3-6x end-to-end speedup for tool-calling pipelines [cite: 59].

Combined, these developments represent a major shift in language agent design [cite: 30, 31, 32]. By combining explicit deliberation loops with parallel compilation, multi-episode self-reflection, and latent-space planning, developers can build agents that are fast, robust, and capable of solving complex tasks in dynamic real-world environments [cite: 31, 42, 57].


--------------------------------------------------------------------------------

From Actions to Understanding: Conformal Interpretability of Temporal Concepts in LLM Agents - arXiv, https://arxiv.org/html/2604.19775v2

NeurIPS Poster Group-in-Group Policy Optimization for LLM Agent Training, https://neurips.cc/virtual/2025/poster/118123

ReAct: Synergizing Reasoning and Acting in Language Models, https://par.nsf.gov/biblio/10451467-react-synergizing-reasoning-acting-language-models

ReAct: Synergizing Reasoning and Acting in Language Models, https://react-lm.github.io/

[PDF] ReAct: Synergizing Reasoning and Acting in Language Models - Semantic Scholar, https://www.semanticscholar.org/paper/LANGUAGE-MODELS-Yao-Zhao/99832586d55f540f603637e458a292406a0ed75d

ReAct: Synergizing Reasoning and Acting in Language Models - GitHub Pages, https://astrocvijo.github.io/react_reproduction/react_reproduction.pdf

Paper Notes: Synergizing Reasoning and Acting in Language Models｜h*, https://note.com/neco_s/n/nf1d416b75dcd?hl=en

ReAct: Synergizing Reasoning and Acting in Language Models - arXiv, https://arxiv.org/pdf/2210.03629

ReAct: Combining Reasoning and Acting in Language Models for Smarter AI - Medium, https://medium.com/@LawrencewleKnight/react-combining-reasoning-and-acting-in-language-models-for-smarter-ai-66d844c1b499

Demystifying ReAct: Why Reasoning and Acting is the Standard for LLM Agents, https://dev.to/4484ho/demystifying-react-why-reasoning-and-acting-is-the-standard-for-llm-agents-1ii6

The ReAct Pattern for Voice Agents and How AI Agents Think, Act, and Respond | LiveKit, https://livekit.com/blog/react-pattern-voice-agents

ReAct Architecture: Reason, Act, Reflect - Emergent Mind, https://www.emergentmind.com/topics/reason-act-reflect-react-architecture

ReAct: Synergizing Reasoning and Acting in Language Models - Google Research, https://research.google/blog/react-synergizing-reasoning-and-acting-in-language-models/

State-Centric Decision Process - arXiv, https://arxiv.org/html/2605.12755v1

PGGA: A Plan-Grounded GUI Agent for Automated Device Support - ACL Anthology, https://aclanthology.org/2026.alvr-main.9.pdf

Self-Evolution Trajectory Optimization in Multi-Step Reasoning with LLM-Based Agents, https://arxiv.org/html/2508.02085v6

Primers • Reasoning in LLMs - aman.ai, https://aman.ai/primers/ai/reasoning-in-LLMs/

BayesAgent: Bayesian Agentic Reasoning Under Uncertainty via Verbalized Probabilistic Graphical Modeling, https://ojs.aaai.org/index.php/AAAI/article/view/39347/43308

REACT: SYNERGIZING REASONING AND ACTING IN LANGUAGE MODELS - Shunyu Yao, https://ysymyth.github.io/papers/react_llm.pdf

ReAct: Synergizing Reasoning and Acting in Language Models - OpenReview, https://openreview.net/forum?id=WE_vluYUL-X

E26 : ReAct — Synergizing Reasoning and Acting in Language Models - Medium, https://medium.com/papers-i-found/e26-react-synergizing-reasoning-and-acting-in-language-models-14a08f46c33d

ReAct Prompting - Leveraging Reasoning With AI - Silicon Dales, https://silicondales.com/ai/react-prompting/

ReAct - Prompt Engineering Guide, https://www.promptingguide.ai/techniques/react

The ReAct Loop Unpacked: Reasoning + Acting in Practice - AgentEngineering, https://www.agentengineering.io/topics/articles/react-loop-unpacked

ReAct: Significance and Limitations | by Taehoon Kim | Medium, https://medium.com/@xogns.k98/react-significance-and-limitations-44f782e3c31e

ReAct Framework: Synergizing Reasoning & Action - Emergent Mind, https://www.emergentmind.com/topics/react-framework

Fusing Reasoning and Action in LLM Agents with ReAct - Engineering Notes, https://notes.muthu.co/2025/10/fusing-reasoning-and-action-in-llm-agents-with-react/

ReAct: Synergising Reasoning and Acting in Language Models | cbarkinozer | Medium, https://cbarkinozer.medium.com/react-synergising-reasoning-and-acting-in-language-models-79e09526ffbe

How AI Agents Actually Work: ReAct, Chain-of-Thought, and Tool Use - Medium, https://medium.com/@devishwas5/how-ai-agents-actually-work-react-chain-of-thought-and-tool-use-fa84cb6eaa7f

LLM Agents → ReAct, Toolformer, AutoGPT family & Autonomous Agent Frameworks | by Akanksha Sinha | Medium, https://medium.com/@akankshasinha247/react-toolformer-autogpt-family-autonomous-agent-frameworks-2c4f780654b8

MAR: Multi-Agent Reflexion Improves Reasoning Abilities in LLMs - arXiv, https://arxiv.org/html/2512.20845v2

LLM Compiler Agent Pattern, https://agent-patterns.readthedocs.io/en/stable/patterns/llm-compiler.html

Agent Series (3): Plan-and-Solve — Think First, Then Act - DEV Community, https://dev.to/wonderlab/agent-series-3-plan-and-solve-think-first-then-act-1e14

LLM agents: The ultimate guide 2026 | SuperAnnotate, https://www.superannotate.com/blog/llm-agents

Adaptive Tool Generation with Models as Tools and Reinforcement Learning - arXiv, https://arxiv.org/html/2510.06825v2

What Are LLM Agents and How To Implement Them in 2025 - Turing, https://www.turing.com/resources/what-are-llm-agents-and-how-to-implement

Paper Readings on LLM Task Performing | Kevin Hu's Blog, https://blog.kevinhu.me/2023/06/12/Paper-Readings-on-LLM-Task-Performing/

Building ReAct Agents: Practical Techniques for Tracing, Acting & Observing in LLM Workflows - GoCodeo, https://www.gocodeo.com/post/building-react-agents-practical-techniques-for-tracing-acting-observing-in-llm-workflows

Reflexion: Language Agents with Verbal Reinforcement Learning - arXiv, https://arxiv.org/pdf/2303.11366

What Is Plan-and-Solve Prompting? | by Deepak kumar sahoo | The Synaptic Stack, https://medium.com/the-synaptic-stack/what-is-plan-and-solve-prompting-59293b8b41b1

Plan-and-Execute - Encyclopedia of Agentic Coding Patterns, https://aipatternbook.com/plan-and-execute

An LLM Compiler for Parallel Function Calling - GitHub, https://raw.githubusercontent.com/mlresearch/v235/main/assets/kim24y/kim24y.pdf

LLM Agents - Prompt Engineering Guide, https://www.promptingguide.ai/research/llm-agents

AI Agent Architecture Patterns: Pick the Right Topology - n8n Blog, https://blog.n8n.io/ai-agent-architecture-patterns/

ReAct Agent Pattern: How Reasoning + Acting Powers AI Agents - Alice Labs, https://alicelabs.ai/en/insights/react-agent-pattern

Scaling AI Agents: Best Practices for Multi-Bot Deployment | MindStudio, https://www.mindstudio.ai/blog/scaling-ai-agents-best-practices-multi-bot-deployment

How Policy-Driven AI Agents Differ from ReAct Agents - MightyBot, https://mightybot.ai/blog/policy-driven-agents-vs-react-agents/

LangChain ReAct Agent: Complete Implementation Guide + Working Examples 2025, https://latenode.com/blog/ai-frameworks-technical-infrastructure/langchain-setup-tools-agents-memory/langchain-react-agent-complete-implementation-guide-working-examples-2025

ReAct agent from scratch with Gemini and LangGraph - Google AI for Developers, https://ai.google.dev/gemini-api/docs/langgraph-example

LlamaIndex vs LangChain: Which Framework Is Best for Agentic AI Workflows? - ZenML, https://www.zenml.io/blog/llamaindex-vs-langchain

Open Source AI Agent Framework | Build Agents Faster - LangChain, https://www.langchain.com/langchain

react | @langchain/langgraph-sdk, https://reference.langchain.com/javascript/langchain-langgraph-sdk/react

Building a Tool-calling Agent with LlamaIndex Workflow and MLflow, https://mlflow.org/docs/latest/genai/flavors/llama-index/notebooks/llama_index_workflow_tutorial/

Tool-Augmented LLM Agents: Production Architecture Patterns for Reliable Tool Calling | Zylos Research, https://zylos.ai/research/2026-04-16-tool-augmented-llm-agents-production-architecture/

Towards Direct Latent-Space Synthesis for Parallel Branches in LLM-Agent Workflows, https://arxiv.org/html/2606.14672v1

The Latent Space: Foundation, Evolution, Mechanism, Ability, and Outlook - arXiv, https://arxiv.org/html/2604.02029v2

MIRAGE: Mobile Agents with Implicit Reasoning and Generative World Models - arXiv, https://arxiv.org/html/2606.04627v1

1 Introduction - arXiv, https://arxiv.org/html/2601.17915v2

RealtimeTool: Parallel Decoding for Real-Time LLM Function Calling | OpenReview, https://openreview.net/forum?id=f0IWycligk&referrer=%5Bthe%20profile%20of%20Zengfeng%20Huang%5D(%2Fprofile%3Fid%3D~Zengfeng_Huang1)
