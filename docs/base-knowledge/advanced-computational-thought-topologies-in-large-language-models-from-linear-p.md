# Advanced Computational Thought Topologies in Large Language Models: From Linear Paths to Recursive Graph Architectures

Advanced Computational Thought Topologies in Large Language Models: From Linear Paths to Recursive Graph Architectures

The Paradigm Shift in Test-Time Compute and Thought Topologies

Autoregressive large language models perform token-level generation sequentially from left to right, representing a straightforward execution of associative next-token prediction [cite: 1, 2, 3]. Under standard prompting configurations (commonly termed Input-Output, or IO), a language model is prompted to map an input sequence x directly to an output y [cite: 4]. This process forces the model to compute the direct posterior probability of the target solution in a single pass:

P(y \mid x)

For highly complex tasks, such as multi-step mathematical calculations, symbolic manipulation, or complex planning, this direct mapping represents an extremely large and often intractable probabilistic leap [cite: 5, 6].

The introduction of CoT prompting (represented as sequential intermediate deliberation) fundamentally altered this paradigm [cite: 5, 6]. Instead of forcing a direct transition from input to output, CoT prompting guides the language model to generate a sequence of intermediate thought states (s_1, s_2, \dots, s_n) prior to producing the final answer [cite: 6]. This re-contextualizes the final output generation as:

P(y \mid x, s_1, s_2, \dots, s_n)

By inserting these intermediate steps, the model decomposes complex problems into manageable subtasks, allocating more computation time to difficult challenges and tracking intermediate states dynamically [cite: 5, 7]. This approach has yielded substantial performance improvements across arithmetic, commonsense, and symbolic manipulation benchmarks [cite: 5, 7].

However, linear sequential thought topologies possess inherent operational vulnerabilities:

Error Cascading and Snowballing: Because generation is strictly sequential and unidirectional, a single logical, arithmetic, or factual error in an early intermediate thought step cascades downstream [cite: 6, 8]. The model lacks an intrinsic mechanism to identify, halt, and correct errors, leading to the irreversible corruption of the final output [cite: 6, 8].

Logical Unfaithfulness: The generated intermediate steps can function as post-hoc rationalizations rather than representing the actual path to the final answer [cite: 6]. Models frequently produce flawless logical chains that culminate in incorrect answers, or conversely, generate correct final answers through completely incorrect steps [cite: 6].

Overcomplication of Simple Tasks: Forcing a rigid sequential step-by-step progression on straightforward, single-step questions introduces unnecessary token generation, increasing both latency and operational costs while occasionally degrading final output accuracy [cite: 6].

Lack of Backtracking and Branching: In a linear topology, the model is unable to explore alternative solutions in parallel, compare competing options, or backtrack to a previous decision point when a path is deemed unpromising [cite: 3, 9, 10].

To address these vulnerabilities, researchers have developed advanced decoding and training methodologies that sit atop linear foundations. Self-consistency improves upon standard sequential prompting by decoding a diverse set of independent thought chains from the same input, selecting the most consistent final answer by marginalizing out the sampled paths [cite: 11, 12, 13, 14]. The Self-Taught Reasoner (STaR) framework represents a bootstrapping strategy where the model learns to improve itself by training on its own generated thought traces, effectively bootstrapping its analytical capacity [cite: 11]. Additionally, the Chain-of-Knowledge approach prompts the model to generate factual evidence as structured triples, using verification steps (e.g., the F^2-Verification method) to assess factuality and faithfulness before final generation [cite: 11].

The table below contrasts these sequential prompting paradigms with structured deliberation topologies, detailing their inputs, selection mechanisms, and computational overhead:


--------------------------------------------------------------------------------

Branching Paradigms and Systematic Search: The Tree of Thoughts Framework

To overcome the architectural limitations of linear progressions, the Tree of Thoughts (ToT) framework generalizes sequential prompting by framing general problem-solving as a structured search over a decision tree [cite: 1, 2]. In this framework, each tree node represents a partial solution state:

s = [x, z_{1\dots i}]

where x is the problem input and z_{1\dots i} = (z_1, \dots, z_i) represents a sequence of intermediate thought steps generated up to level i [cite: 3]. Thoughts are designed as coherent, self-contained language sequences that are small enough to facilitate the generation of diverse, promising alternatives, yet large enough for the language model to evaluate their viability [cite: 3].

To instantiate ToT for any complex task, four core structural components must be defined:

## 1. Thought Decomposition

Decomposing the global problem into discrete intermediate thought steps [cite: 3]. The structural granularity of a thought depends heavily on the task domain: a single equation line for arithmetic puzzles, a short plan paragraph for creative writing, or a word selection for word-construction puzzles [cite: 3, 16].

## 2. Thought Generation

Given a state node s, a thought generator G(p_\theta, s, k) proposes k candidate thoughts for the next step [cite: 3]. The framework leverages two main generation strategies:

Strategy A: Independent Sampling (i.i.d.): Thought candidates are sampled independently from the language model's policy: z^{(j)} \sim p^{\text{CoT}}_\theta(z_{i+1} \mid s) = p^{\text{CoT}}_\theta(z_{i+1} \mid x, z_{1\dots i}) \quad (j = 1 \dots k) This strategy is highly effective in rich thought spaces (e.g., paragraph-sized plans) where independent sampling naturally promotes divergent paths [cite: 3, 17].

Strategy B: Sequential Proposing: Candidates are proposed sequentially within a single prompt context to explicitly avoid duplication: [z^{(1)}, \dots, z^{(k)}] \sim p^{\text{propose}}_\theta(z^{(1\dots k)}_{i+1} \mid s) This is optimal in highly constrained, low-entropy thought spaces (e.g., single-character or single-number manipulations) where maintaining uniqueness is critical [cite: 3].

## 3. State Evaluation

The state evaluator V(p_\theta, S) acts as a heuristic function, leveraging the language model's meta-evaluative capabilities to assess the probability that a state s will lead to a correct final solution [cite: 3, 18]. Instead of relying on programmed heuristics, ToT utilizes two prompting strategies for evaluation:

Strategy A: Independent State Valuation: Each candidate state s in the current frontier S is evaluated independently: V(p_\theta, S)(s) \sim p^{\text{value}}_\theta(v \mid s) \quad \forall s \in S The model generates a scalar score (e.g., a scale from 1–10) or a categorical classification (e.g., sure, likely, or impossible) by simulating short lookaheads [cite: 3, 18].

Strategy B: Cross-State Voting: The model performs a pairwise or joint comparison across all candidate solutions in the frontier S, casting votes to determine the most viable candidate: V(p_\theta, S)(s) = \mathbb{I}[s = s^*] where s^* \sim p^{\text{vote}}_\theta(s^* \mid S) represents the state selected by the model [cite: 3]. This is highly effective when defining a precise scalar value is difficult, such as assessing the stylistic coherence of text passages [cite: 18].

## 4. Search Algorithm Navigation

The capabilities of thought generation and state evaluation are systematically orchestrated via classical search algorithms:

Breadth-First Search (BFS): BFS maintains and explores a systematic frontier of multiple parallel paths at each level of the tree [cite: 2, 3]. It is primarily applied in tasks where the tree depth is shallow, and pruning poor paths within a strict breadth limit prevents combinatorial explosion [cite: 3, 17].

Depth-First Search (DFS): DFS systematically traverses a single path deeply [cite: 2, 3]. If a node's evaluated score falls below a predefined threshold, the algorithm prunes the branch, backtracks to the parent node, and begins exploring the next alternative candidate [cite: 2, 3]. This is optimal for high-depth, highly constrained tasks [cite: 3, 10].

## Advanced Extensions of Search Topologies

The ToT framework has inspired several sophisticated variations that combine search, planning, and policy refinement:

Tree-of-Thoughts RL (ToTRL): An on-policy reinforcement learning framework designed to guide models in developing parallel thought strategies [cite: 12].

Tree of Uncertain Thoughts (TouT): Tailored for uncertainty quantification, this framework leverages Monte Carlo Dropout to generate uncertainty scores for intermediate thought steps, improving precision in sequence generation [cite: 12].

Boosting of Thoughts: An automated framework that iteratively explores and self-evaluates multiple trees to acquire an ensemble of trial-and-error experiences, serving as a dynamic prompt library [cite: 12, 13].

Language Agent Tree Search (LATS): A framework that unifies structured deliberation, action execution, and environmental planning [cite: 12].

RAP (World Model Agent): Repurposes the model as both a world model and an agent, incorporating Monte Carlo Tree Search (MCTS) for strategic exploration of the thought space [cite: 12].

The table below presents the empirical performance and computational cost profiles of ToT compared to standard prompting baselines:

The empirical results show that structured test-time search can compensate for model scale [cite: 9]. For instance, GPT-3.5 paired with ToT achieves a Creative Writing score of 6.62, outperforming GPT-4 using standard IO (6.19) and approaching GPT-4 with sequential prompting (6.93) [cite: 9]. However, this capability boost comes with a significant cost premium, requiring approximately five times the token consumption for writing tasks [cite: 9]. In the highly constrained mathematical Game of 24, single-path CoT achieves a success rate of only 4.0% with GPT-4, whereas ToT achieves 74.0% while requiring fewer tokens than running 100 independent CoT trials [cite: 2, 9].


--------------------------------------------------------------------------------

Networked Deliberation: Arbitrary Graph of Thoughts Topologies

## Structural Limitations of Tree Architectures

Despite the advantages of ToT over linear sequences, tree topologies impose a rigid hierarchical structure on the thought process [cite: 4, 19]. Information flows strictly unidirectionally from the root node to the leaf nodes [cite: 14, 15, 19]. This design prevents:

Cross-Path Information Merging: Separate branches cannot communicate, collaborate, or share intermediate findings [cite: 14, 15, 19].

Dynamic Feedback Loops: A model cannot loop back to refine an existing thought without re-instantiating a new sub-branch, leading to high latency and redundant generation [cite: 15, 19, 20].

Dynamic Programming Patterns: Complex problems that can be partitioned into overlapping subproblems cannot be solved by combining previously computed sub-solutions [cite: 14, 21].

Human thought processes are inherently non-linear, often forming complex networks where ideas branch, backtrack, combine, and iterate [cite: 4, 19, 22].

## The Graph of Thoughts (GoT) Formalism

The Graph of Thoughts (GoT) framework maps the intermediate thoughts generated by a language model as an arbitrary directed graph [cite: 19, 23]:

\mathcal{G} = (V, E, c)

where V = \{v_1, \dots, v_n\} is the set of vertices (nodes), each representing an intermediate thought or partial solution state [cite: 23]. The set E \subseteq V \times V consists of directed edges, where a directed edge (u, v) signifies that thought v was generated using thought u as a direct semantic input [cite: 23]. The function c : V \to C maps thoughts to semantic classes or roles within the task context [cite: 23].

The operational execution of GoT is formally modeled as a tuple [cite: 19]:

\text{GoT} = (G, \mathcal{T}, \mathcal{E}, \mathcal{R})

where:

G = (V, E) represents the dynamic Graph thought State (GRS) tracking all generated thoughts and their dependencies [cite: 19, 24, 25].

\mathcal{T} represents thought transformations, which are functions that alter the graph topology: G' = T(G, p_\theta) = (V', E') by inserting new nodes V^+ and edges E^+, or pruning existing nodes V^- and edges E^- [cite: 20, 23].

\mathcal{E} is the evaluator function that scores individual thought states or complete subgraphs [cite: 19, 26].

\mathcal{R} is the ranking function that selects the most promising thought states for subsequent operations [cite: 19, 24].

## Core Graph Transformations

GoT generalizes preceding prompting paradigms through four primary thought transformations [cite: 15, 23, 24]:

Generation and Branching (Split): Generating k independent successor thoughts from a single predecessor node, expanding the search space [cite: 14, 15, 24].

Aggregation and Merging: Combining multiple independent thought paths into a single synergistic outcome [cite: 15, 19, 24]. In its basic form, a single new vertex v^+ is created with directed edges originating from k merged nodes: V^+ = \{v^+\} \quad \text{and} \quad E^+ = \{(v_1, v^+), \dots, (v_k, v^+)\} This is critical for divide-and-conquer strategies, such as merging sorted sub-lists into a fully sorted master list [cite: 21, 24].

Refinement (Looping): Iteratively revising and updating the content of an active thought node v based on evaluative feedback [cite: 15, 19, 20]. Formally: V^+ = \emptyset \quad \text{and} \quad E^+ = \{(v, v)\} The resulting self-loop represents an iterative optimization cycle that maintains its structural dependencies [cite: 20].

Distillation and Pruning: Selecting and preserving only the top N scoring nodes (KeepBestN) or structurally valid nodes (KeepValid), purging unpromising paths to prevent combinatorial search explosion [cite: 23, 27].

## Thought Volume and Latency Profiles

GoT introduces a graph-theoretic metric to evaluate structured prompting topologies: the volume of a thought [cite: 4, 19].

For a given thought node v, its volume is defined as the cardinality of the set of all ancestor nodes from which v is reachable via directed paths:

\text{Vol}(v) = |\{u \in V \mid u \to^* v\}|

where u \to^* v indicates that a directed path exists from u to v in \mathcal{G} [cite: 4, 19]. Intuitively, the volume represents the total quantity of prior intermediate thoughts, sub-solutions, and contextual insights that contributed to the generation of v [cite: 4, 19].

By utilizing aggregation transformations, GoT allows thoughts to scale their volume exponentially or linearly while maintaining extremely low latency [cite: 19, 20]. Latency is defined as the maximum path length (number of hops) from the initial input state to the final solution node [cite: 20, 28]. While ToT requires deep trees (high latency) to integrate diverse paths, GoT merges parallel paths, achieving a high thought volume with low latency [cite: 20].

The table below summarizes the operational profiles of the core thought transformations in GoT:


--------------------------------------------------------------------------------

Dynamic, Adaptive, and Sub-Token Algorithmic Evolutions

## Adaptive Graph of Thoughts (AGoT)

Standard GoT implementations execute a pre-planned, static Graph of Operations (GoO) defined by a developer prior to execution [cite: 8, 25, 29]. This rigid structure cannot adapt to the varying difficulty of incoming queries [cite: 29, 30].

The Adaptive Graph of Thoughts (AGoT) framework addresses this by incorporating dynamic, language-model-driven complexity checks [cite: 29, 31]. AGoT builds its Directed Acyclic Graph (DAG) layer-by-layer during inference [cite: 29, 30]. At each layer, an automated check classifies each generated node as either "complex" or "non-complex" [cite: 30, 31].

If a node is classified as complex, it recursively initiates a nested, lower-level AGoT subgraph process to systematically decompose the difficult sub-task [cite: 29, 30, 31].

If classified as non-complex, the node is evaluated directly, and its result is returned to the parent graph [cite: 30, 31].

Mathematically, a node in AGoT is uniquely defined by its "heritage" — a sequence of ancestor nodes that distinguishes a particular subgraph [cite: 30, 31]. The top-level graph is denoted by G_{\emptyset} where \emptyset represents the empty heritage [cite: 31]. Under this structure, the system is governed by arbitrary limits on maximum depth d_{\text{max}}, branching limit l_{\text{max}}, and total nodes n_{\text{max}} [cite: 31].

By recursively allocating computation only to hard bottlenecks, AGoT unifies chain, tree, and graph structures dynamically [cite: 29, 31, 32]. This test-time adaptive approach achieved a 46.2% absolute performance improvement on GPQA scientific benchmarks without any parameter fine-tuning [cite: 29].

Proportions of complex nodes across tasks demonstrate that the Game of 24 produces the highest proportion of complex nodes, followed by GPQA and Mini Crosswords, confirming that non-retrieval tasks warrant the greatest degree of structural decomposition [cite: 32].

## Self-Attention-Based Graph-of-Thought (SaGoT)

Prompting-based graph frameworks operate as "ex-post" orchestrators [cite: 33]. They rely on multiple external API calls, parsers, and custom prompters to build, score, and navigate graphs [cite: 33, 34]. This introduces high computational latency, token overhead, and dependency on large model scales to understand complex graph prompts [cite: 33].

Self-attention-based Graph-of-Thought (SaGoT) introduces an alternative approach by shifting graph construction into the internal operations of the Transformer during decoding [cite: 33, 35]. SaGoT is a training-free technique that constructs a thought graph simultaneously with inference [cite: 33, 34]. It functions by:

Computing a dynamic, inter-step self-attention indicator during decoding to determine logical dependencies between generated thought segments [cite: 33, 34].

Modifying the Transformer's self-attention matrix at runtime [cite: 33, 35].

Applying a graph-structured self-attention mask that restricts each new token's attention solely to structurally related predecessor steps [cite: 33, 34].

By masking out attention to weakly related intermediate thought segments, SaGoT mitigates token-level interference and halts error propagation in a single sequence trajectory [cite: 33, 34]. Furthermore, it integrates intrinsic interpretability, allowing developers to trace why a model succeeds or fails by analyzing the attention matrices directly [cite: 33, 34]. The execution flow proceeds through five key stages: Input Prompt Construction, Initial Node Generation, Subsequent Node Generation, Graph-structured Self-attention Construction, and Process Circulation & Termination [cite: 33].

## Software Frameworks: ETH GoT, Framework-of-Thoughts, and LangGraph

To translate these theoretical models into production systems, developers utilize several specialized software libraries:

The ETH Zurich graph_of_thoughts Library: This official implementation organizes problem-solving via a static Graph of Operations (GoO) executed by a centralized Controller to generate a dynamic Graph representation State (GRS) [cite: 24, 25, 36]. It provides key modules like the Prompter (which formats messages for the language model), Parser (which extracts outputs), and Scoring [cite: 24, 25, 36].

Framework-of-Thoughts: A Python library designed to model and optimize graph-based multi-step deliberation [cite: 37]. It includes built-in integrations with Optuna for hyperparameter optimization and dspy for prompt tuning [cite: 37]. It supports advanced configurations like ProbTree (probabilistic search) on multi-hop datasets [cite: 37].

LangGraph: An agentic development toolkit that natively supports arbitrary graphs with cycles, backtracking, and dynamic state management, making it highly effective for enterprise-grade GoT implementations [cite: 15, 38].

Framework of Thoughts (FoT): A general-purpose foundation framework designed to resolve the limitations of static graph libraries [cite: 38, 39]. Unlike rigid structures, FoT allows graphs to evolve dynamically during execution [cite: 38, 39]. It features parallel execution with dynamic dependency checking to prevent race conditions, and incorporates intelligent caching to reduce API latencies and token consumption [cite: 38, 39].


--------------------------------------------------------------------------------

Architectural Implementations and Empirical Case Studies

## Programmatic Implementation in ETH Zurich's GoT Framework

To illustrate the construction of a structured graph execution, the following code snippet demonstrates how to configure and run a sorting problem for a list of 32 numbers using the official graph_of_thoughts library [cite: 36]. The implementation defines a Graph of Operations (GoO) containing sequential thought operations, which are executed automatically by the Controller [cite: 36]:

The GRS tracks intermediate thoughts and scores them at runtime using custom validators [cite: 24, 25, 36]. For sorting tasks, the scoring function checks for ascending or descending order and preserves the original frequencies of numbers to prevent hallucination [cite: 24]. The final scores inside output_got.json represent the number of unsorted elements, providing an explicit audit log [cite: 36].

## Empirical Machine Learning Code Optimization Case Study

An illustrative empirical application of structured graph deliberation is the autonomous optimization of machine learning programs [cite: 40]. In this study, the qrdlgit framework recursively optimizes an sklearn baseline script (base.py) evaluating the California housing dataset (data.pkl, obfuscated to prevent the model from retrieving pre-trained solutions) [cite: 40]. The framework generates alternative optimization paths, scores them, and recursively iterates on the highest-performing configurations [cite: 40].

The table below traces the execution logs of this autonomous optimization loop:

The execution logs demonstrate the effectiveness of tree and graph searches [cite: 40]. While the model's attempts to scale polynomial features to a degree of 3 failed catastrophically, the pruning mechanism identified the failure immediately, backtracked to the base_n1.py node, and successfully iterated toward the optimal RidgeCV configuration [cite: 40].

## Operational Configuration of TreeOfThoughts Deliberation

For complex creative text generation, system parameters must be carefully calibrated to balance generation diversity and factual coherence [cite: 17]. The reusable Python class TreeOfThoughts manages these parameters [cite: 17]:

Disabling system caching is essential during creative generation tasks to ensure that the model generates truly independent, identically distributed proposal variations, rather than returning cached outputs [cite: 17].


--------------------------------------------------------------------------------

Strategic Engineering Guidelines and Comparative Architectures

## Architectural Matrix: GoT Framework versus Framework of Thoughts (FoT)

When deploying structured deliberation architectures, system developers must choose between static, narrow-domain graph frameworks and modern, dynamic optimization runtimes.

The table below contrasts the ETH Zurich GoT library with the Framework of Thoughts (FoT) engine across core architectural criteria:

## Practical Integration Strategy for System Architects

To guide system architects in selecting the optimal thought topology, the following guidelines balance computational complexity, token costs, and task constraints [cite: 9, 15, 26]:

Deploy Standard Sequential Prompting (CoT) [cite: 5, 6] when:

The task is straightforward and has a single viable solution path [cite: 15].

Strict latency constraints require real-time streaming [cite: 26].

Token budgets are highly restricted [cite: 15].

Deploy Self-Consistency (CoT-SC) [cite: 11, 12] when:

Solving mathematical or closed-form problems where different paths should converge on the same answer [cite: 3, 14].

The base model exhibits high generation variance [cite: 14].

Deploy Tree-Search Topologies (ToT) [cite: 2, 3] when:

The problem is highly constrained and requires deliberate planning or lookahead [cite: 2, 3].

The task is pruneable, allowing DFS or BFS to discard bad paths early [cite: 3, 16].

There are no reliable subproblem merging formulas [cite: 26].

Deploy Graph Topologies (GoT / AGoT / SaGoT) [cite: 19, 29, 33] when:

The task is decomposable into independent subproblems that can be solved in parallel and merged [cite: 19, 21].

Solutions require iterative refinement through feedback loops [cite: 15, 19, 20].

The task benefits from maximizing thought volume while minimizing graph latency [cite: 20].

Intrinsic interpretability is required via attention masking during decoding [cite: 33, 34].


--------------------------------------------------------------------------------

Tree of Thoughts: Deliberate Problem Solving with Large Language Models, https://par.nsf.gov/biblio/10542045-tree-thoughts-deliberate-problem-solving-large-language-models

Tree of Thoughts: Deliberate Problem Solving with Large Language Models - arXiv, https://arxiv.org/abs/2305.10601

Tree of Thoughts: Deliberate Problem Solving with Large Language Models - arXiv, https://arxiv.org/pdf/2305.10601

arXiv:2308.09687v2 [cs.CL] 21 Aug 2023, https://storage.prod.researchhub.com/uploads/papers/2023/08/23/2308.09687.pdf

Chain-of-Thought Prompting Elicits Reasoning in Large Language Models - alphaXiv, https://www.alphaxiv.org/overview/2201.11903v6

Chain of Thought in Large Language Models: Elicited Reasoning or Constrained Imitation?, https://gregrobison.medium.com/chain-of-thought-in-large-language-models-elicited-reasoning-or-constrained-imitation-5e4ee0c811ad

Chain-of-Thought Prompting Elicits Reasoning in Large Language Models - arXiv, https://arxiv.org/pdf/2201.11903

Graph of Thoughts: Solving Elaborate Problems with Large Language Models | Request PDF - ResearchGate, https://www.researchgate.net/publication/379296666_Graph_of_Thoughts_Solving_Elaborate_Problems_with_Large_Language_Models

Tree of Thoughts: Deliberate Problem Solving with Large Language Models - OpenReview, https://openreview.net/forum?id=5Xc1ecxO1h

Tree of Thoughts: Deliberate Problem Solving with LLMs｜らみ - note, https://note.com/rami_engineer/n/n3f7ae16a432c?hl=en

Chain of Thought Prompting Elicits Reasoning in Large Language Models, https://www.semanticscholar.org/paper/Chain-of-Thought-Prompting-Elicits-Reasoning-in-Wei-Wang/1b6e810ce0afd0dd093f789d2b2742d047e316d5

Tree of Thoughts: Deliberate Problem Solving with Large Language Models, https://www.semanticscholar.org/paper/Tree-of-Thoughts%3A-Deliberate-Problem-Solving-with-Yao-Yu/2f3822eb380b5e753a6d579f31dfc3ec4c4a0820

Graph of Thoughts: Solving Elaborate Problems with Large Language Models, https://www.semanticscholar.org/paper/Graph-of-Thoughts%3A-Solving-Elaborate-Problems-with-Besta-Blach/aade40af0d85b0b4fe15c97f6222d5c2e4d6d9b3

Demystifying Chains, Trees, and Graphs of Thoughts - Torsten Hoefler, https://htor.inf.ethz.ch/publications/img/besta-topologies.pdf

Graph of Thoughts (GoT) - Agentic Patterns, https://agentic-patterns.com/patterns/graph-of-thoughts/

Tree of Thought Prompting - Walking the Path of Unique Approach to Problem-Solving, https://promptengineering.org/tree-of-thought-prompting-walking-the-path-of-unique-approach-to-problem-solving/

Understanding and Implementing the Tree of Thoughts Paradigm - Hugging Face, https://huggingface.co/blog/sadhaklal/tree-of-thoughts

Advanced Prompt Engineering Techniques: Tree-of-Thoughts Prompting - Deepgram, https://deepgram.com/learn/tree-of-thoughts-prompting

Graph of Thoughts: Solving Elaborate Problems with Large Language Models, https://ojs.aaai.org/index.php/AAAI/article/view/29720/31236

Review of “Graph of Thoughts: Solving Elaborate Problems with Large Language Models” - Temple CIS, https://cis.temple.edu/tagit/presentations/Review%20of%20Besta23.pdf

[Study Notes] Graph of Thoughts: Solving Elaborate Problems with Large Language Models, https://note.com/daichi_mu/n/n31b2438158e1?hl=en

Large Language Model Reasoning Process and Prompting techniques Part 1 - Xin Cheng, https://billtcheng2013.medium.com/large-language-model-reasoning-process-and-prompting-techniques-part-1-e3c31a78f1a0

Graph of Thoughts (GoT) Framework - Emergent Mind, https://www.emergentmind.com/topics/graph-of-thoughts-got

Paper page - Graph of Thoughts: Solving Elaborate Problems with Large Language Models, https://huggingface.co/papers/2308.09687

LLMs Graph of Thoughts Framework. Case study | by Jomsborg Lab | Medium, https://medium.com/@JacekWo/llms-graph-of-thoughts-framework-c5607a46aa9a

Graph-of-Thought (GoT) - Agentic Design Patterns, https://agentic-design.ai/patterns/reasoning-techniques/got

graph-of-thoughts/graph_of_thoughts/operations/README.md at main - GitHub, https://github.com/spcl/graph-of-thoughts/blob/main/graph_of_thoughts/operations/README.md

Demystifying Chains, Trees, and Graphs of Thoughts - IEEE Computer Society, https://www.computer.org/csdl/journal/tp/2025/12/11123142/297Ky5e7xAY

Adaptive Graph of Thoughts: Test-Time Adaptive Reasoning Unifying Chain, Tree, and Graph Structures - arXiv, https://arxiv.org/pdf/2502.05078?

[Literature Review] Adaptive Graph of Thoughts: Test-Time Adaptive Reasoning Unifying Chain, Tree, and Graph Structures - Moonlight, https://www.themoonlight.io/en/review/adaptive-graph-of-thoughts-test-time-adaptive-reasoning-unifying-chain-tree-and-graph-structures

Test-Time Adaptive Reasoning Unifying Chain, Tree, and Graph Structures - arXiv, https://arxiv.org/html/2502.05078v1

Total nodes and the percentage of complex nodes in AGoT with gpt-4o-mini for each task. - ResearchGate, https://www.researchgate.net/figure/Total-nodes-and-the-percentage-of-complex-nodes-in-AGoT-with-gpt-4o-mini-for-each-task_fig3_388848130

Self-attention-based Graph-of-Thought for Math Problem Solving - ACL Anthology, https://aclanthology.org/2025.findings-acl.317.pdf

Self-attention-based Graph-of-Thought for Math Problem Solving - ACL Anthology, https://aclanthology.org/2025.findings-acl.317/

Self-attention-based Graph-of-Thought for Math Problem Solving - ResearchGate, https://www.researchgate.net/publication/394271776_Self-attention-based_Graph-of-Thought_for_Math_Problem_Solving

GitHub - spcl/graph-of-thoughts: Official Implementation of "Graph of Thoughts: Solving Elaborate Problems with Large Language Models", https://github.com/spcl/graph-of-thoughts

fjfricke/framework-of-thoughts - GitHub, https://github.com/fjfricke/framework-of-thoughts

Framework of Thoughts: A Foundation Framework for Dynamic and Optimized Reasoning based on Chains, Trees, and Graphs - ACL Anthology, https://aclanthology.org/2026.surgellm-1.8.pdf

A Foundation Framework for Dynamic and Optimized Reasoning based on Chains, Trees, and Graphs - arXiv, https://arxiv.org/pdf/2602.16512

graph-of-thoughts/README.md at master - GitHub, https://github.com/qrdlgit/graph-of-thoughts/blob/master/README.md

graph-of-thoughts/graph_of_thoughts/controller/README.md at main - GitHub, https://github.com/spcl/graph-of-thoughts/blob/main/graph_of_thoughts/controller/README.md
