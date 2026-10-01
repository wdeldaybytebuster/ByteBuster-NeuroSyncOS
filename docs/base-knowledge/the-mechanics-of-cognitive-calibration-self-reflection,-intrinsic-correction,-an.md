# The Mechanics of Cognitive Calibration: Self-Reflection, Intrinsic Correction, and Reinforcement-Guided Learning in Autonomous Agents

The Mechanics of Cognitive Calibration: Self-Reflection, Intrinsic Correction, and Reinforcement-Guided Learning in Autonomous Agents

The Epistemological Limits of Autonomous Execution

The deployment of large language models within autonomous agentic workflows marks a fundamental paradigm shift in artificial intelligence, transitioning from rapid, token-by-token generation toward deliberate, multi-step problem-solving [cite: 1, 2, 3]. Standard autoregressive generation operates similarly to human intuitive cognitive processing, wherein a sequence of predictions is produced without the capacity for real-time validation or strategic backtracking [cite: 1, 3]. Conversely, slow, deliberative frameworks implement a metacognitive layer that monitors progress, evaluates execution traces, and dynamically recalibrates next-step predictions [cite: 1, 3]. This architecture empowers agents to analyze historical trajectories, diagnose procedural failures, and adjust subsequent strategies across iterative attempts [cite: 4, 5].

Developing these self-correcting mechanisms requires navigating the distinct challenges of intrinsic versus extrinsic validation [cite: 6, 7, 8]. Intrinsic self-correction relies entirely on the model's pre-trained parametric weights to identify and repair its own logical discrepancies without external cues [cite: 6, 7, 9]. Extrinsic self-correction, in contrast, utilizes environment-driven feedback, such as sandbox compiler execution outputs, unit test results, API response logs, or specialized critic agents [cite: 1, 8, 10].

Empirical evaluations reveal severe structural bottlenecks in purely intrinsic self-correction [cite: 6, 7]. Research demonstrates that when language models attempt to correct their responses based solely on internal capabilities without external guidance, performance frequently degrades [cite: 6, 7, 9]. This degradation stems from an inherent "closed-loop blind confidence" where the model fails to detect its own semantic errors [cite: 6, 11]. It often mistakenly alters previously correct calculations or fails to identify structural errors [cite: 6, 12].

Furthermore, earlier literature suggesting significant gains from intrinsic self-correction often relied on oracle labels or hidden ground-truth indicators to trigger the correction loop [cite: 6, 7]. When these external signals are removed, sequential correction loops rarely outperform parallel voting methods like self-consistency under equivalent computational budgets [cite: 6].

The operational efficiency of these systems is also governed by the choice between pre-hoc and post-hoc prompting structures [cite: 13].

Pre-Hoc Prompting: Integrates complex task instructions, rules, and prospective failure warnings directly into the initial generation prompt [cite: 13]. While computationally efficient and minimizing API latency, pre-hoc prompts can fail to anticipate runtime errors [cite: 13].

Post-Hoc Prompting: Triggers iterative feedback loops after an initial candidate response is generated [cite: 7, 13]. While post-hoc methods incur higher token costs and latency, they are essential when processing environmental feedback that must be delivered in conjunction with actual model outputs [cite: 13].


--------------------------------------------------------------------------------

Archetypes of In-Context Self-Reflection and Iterative Refinement

To operationalize System 2 processing, researchers have designed several in-context self-reflection frameworks [cite: 1, 14, 15]. These methods utilize structured prompting and episodic memory buffers to guide the agent through iterative correction cycles without modifying the model's underlying weights [cite: 4, 5, 16].

## The Self-Refine Paradigm

The Self-Refine framework organizes model operations into an iterative draft-and-revise loop [cite: 14, 15]. This pipeline uses a single frozen model to sequentially perform three distinct roles: the Generator, the Critic, and the Refiner [cite: 14, 15, 17].

The loop begins when the Generator produces an initial candidate response [cite: 15, 17]. The Critic then evaluates this output against specific criteria, generating a localized critique that identifies logical, structural, or semantic flaws [cite: 14, 15, 17]. Finally, the Refiner receives the original prompt, the draft, and the critique to generate an improved version [cite: 15, 17].

This process can be repeated for multiple iterations until a predefined stopping criterion is met [cite: 15, 17]. In tasks like acronym generation, the refinement path is often non-monotonic, where optimizing one dimension (such as pronunciation) can degrade another (such as character matching) [cite: 14]. Self-Refine addresses this by tracking iteration history and selecting the candidate with the highest overall evaluation score [cite: 14].

## The Reflexion Architecture

The Reflexion framework extends this process by implementing an explicit agent loop that converts execution failures into natural language guidance, which is then stored in an episodic memory buffer to simulate verbal reinforcement learning [cite: 5, 16]. This architecture decomposes the agent into three prompted roles:

The Actor (M_a): Acts as the primary agent policy, utilizing step-by-step rationalization or tool-use loops to generate intermediate actions and final outputs [cite: 4, 18].

The Evaluator (M_e): An objective verification module that checks solution correctness against environmental signals, such as unit tests or exact-match assertions [cite: 5, 18].

The Self-Reflector (M_{sr}): A specialized feedback generator triggered only upon execution failures [cite: 4, 18]. It analyzes failed thought traces to construct a natural language summary explaining the failure and suggesting concrete adjustments [cite: 4, 5].

The resulting reflection is appended to an episodic memory buffer [cite: 5, 16]. In subsequent attempts, the Actor is prompted with both the original task instruction and the accumulated contents of this memory buffer [cite: 4, 5]. This verbal feedback acts as a semantic gradient, providing the model with a clear direction for correction [cite: 5]. While Reflexion achieves substantial gains on code synthesis and search-based question answering, standard single-agent implementations remain vulnerable to confirmation bias and repetitive error patterns on highly complex tasks [cite: 4, 19, 20].

## The Degeneration-of-Thought Bottleneck

Replication studies of single-agent self-reflection systems reveal a persistent failure mode known as degeneration-of-thought or mode collapse [cite: 4, 18, 19, 20, 21]. When the same model is responsible for generation, evaluation, and critique, it often suffers from confirmation bias, repeating earlier mistakes or making superficial edits that fail to address the core error [cite: 4, 18, 19, 20, 21]. This stagnation occurs because the model becomes trapped in local optima, reinforcing its own misconceptions rather than exploring alternative solution paths [cite: 4, 19].


--------------------------------------------------------------------------------

Distributed Deliberation: Multi-Agent and Meta-Policy Extensions

To address the limitations of single-agent systems, recent architectures introduce distributed multi-agent collaboration and generalized meta-policy structures [cite: 4, 20, 25].

## Multi-Agent Reflexion (MAR) and Metacognitive Architectures

Multi-Agent Reflexion (MAR) addresses mode collapse by distributing the tasks of acting, diagnosing, and critiquing across a diverse pool of specialized, persona-guided agents coordinated by a centralized judge [cite: 1, 4, 23].

When the Evaluator flags an error, the system initiates a structured debate loop [cite: 1, 4, 23]:

Initial Diagnosis: The Actor's scratchpad thoughts are passed to a Central Judge, who prompts multiple persona-guided critics to write an initial diagnosis [cite: 4, 23].

Multilateral Debate: Critics debate their findings over up to two rounds, identifying logical inconsistencies in peer evaluations and refining their critiques [cite: 4, 23].

Consensus Aggregation: The Judge synthesizes these perspectives into a single, unified "Consensus Reflection," which is then appended to the Actor's episodic memory [cite: 1, 4, 23].

To prevent shared blind spots, the critic personas are systematically designed along three key axes:

Evidence Exploitation: Enforcing strict reliance on verified textual or empirical support [cite: 23].

Exploration: Actively encouraging alternative hypotheses and paths [cite: 23].

Specification Strictness: Ensuring precise compliance with task instructions and edge cases [cite: 23].

Empirical evaluations confirm that MAR reduces cognitive stagnation [cite: 1, 4]. On the HotPotQA benchmark, standard Reflexion improves performance over a baseline ReAct agent, while MAR achieves an additional performance boost [cite: 1, 23]. Similarly, on the HumanEval programming benchmark, MAR achieves significant accuracy gains over single-agent reflection [cite: 4, 21].

This architectural design is closely related to the Metacognitive Agent Reflective Self-Improvement (MARS) framework, which models agent self-improvement through a dual-process lens [cite: 1]. Under MARS, "System 1" handles fast, intuitive action selection using the base LLM policy, while "System 2" operates as a slow, deliberative metacognitive controller [cite: 1]. This System 2 layer monitors execution states, triggers introspection when performance drops below a given threshold, and updates prompts, strategies, or conceptual beliefs [cite: 1]. These beliefs are represented as Metacognitive Knowledge (\mathcal{K}), while the selection of targets and learning strategies is managed by Metacognitive Planning (\mathcal{P}) [cite: 1].

## Meta-Policy Reflexion (MPR)

While MAR improves multi-step decision-making, in-context reflections typically remain highly localized and instance-specific, meaning they are rarely reused across different tasks [cite: 25]. Meta-Policy Reflexion (MPR) addresses this by distilling episodic reflections into a compact, structured Meta-Policy Memory (MPM) composed of predicate-style rules with associated confidence weights [cite: 25].

MPR applies this accumulated memory at inference time through two complementary mechanisms:

Soft Guidance: Structured rules are injected directly into the prompt of the generator model to steer decoding toward verified strategies [cite: 25].

Hard Admissibility: Post-generation filtering mechanisms intercept and block invalid or unsafe actions that violate core domain constraints [cite: 25].

This approach consolidates localized experiences into generalized, reusable strategies without requiring model fine-tuning [cite: 25].

## The Exploration Collapse Challenge

Self-evolving agents that accumulate memory and reflection across episodes can suffer from a challenge known as exploration collapse [cite: 26]. As an agent's memory grows, its behavior can concentrate around familiar, high-reward routines, reducing the likelihood of exploring alternative pathways [cite: 26]. Because agents operate in an implicit, unstructured strategy space, they often lack visibility into alternative action sequences [cite: 26].

The APEX framework mitigates exploration collapse by implementing two key components:

Fork Discovery: Explicitly maps and explores alternative strategies when task performance stagnates [cite: 26].

Policy Selection: Balances exploration and exploitation during planning to ensure the agent continues to discover new pathways [cite: 26].

Evaluated on complex benchmarks like the Jericho text adventure games and WebArena, APEX systematically outperforms standard static and reflective baselines by maintaining behavioral diversity [cite: 26].


--------------------------------------------------------------------------------

The Physics of Externalized Verification and Critic Training

To resolve the verification bottleneck of purely intrinsic self-correction, modern architectures integrate external tools to provide objective validation feedback [cite: 8, 10, 27].

## Interactive Tool Integration via CRITIC

The Self-Correcting with Tool-Interactive Critiquing (CRITIC) framework leverages search engines for fact-checking, Python interpreters for verifying code correctness, and toxicity APIs for safety audits [cite: 8, 10, 28, 29]. CRITIC alternates between generating an output, calling external tools to evaluate its correctness, and revising the output based on the resulting logs [cite: 10, 28, 29]. This verify-then-correct loop can be repeated iteratively to improve generation quality [cite: 10, 28].

Empirical data reveals that CRITIC's success rate is closely tied to the type of error it evaluates [cite: 29].

While tool-interactive frameworks excel at correcting syntax and format violations, resolving intrinsic logical errors remains a key challenge [cite: 29]. This limitation highlights the need to train specialized critic models to generate more effective and actionable feedback [cite: 30, 31].

## Specialized Critic Training with CTRL

The Critic Training via Reinforcement Learning (CTRL) framework decouples the critic model from the primary task-performing generator [cite: 30, 31]. Because evaluating the quality of natural language feedback is challenging, CTRL introduces a proxy task: training the critic model to maximize the correction performance of a fixed generator [cite: 30, 31, 32].

CTRL employs a two-stage training process to optimize the critic policy:

Stage I (Critique Synthesis): The critic is fine-tuned using supervised training data generated from execution feedback and unit-test failures in a sandboxed environment, establishing a baseline for diagnostic feedback [cite: 32, 33].

Stage II (Reinforced Critique Generation via GRPO): The critic is optimized using Group Relative Policy Optimization (GRPO) to generate feedback that maximizes the generator's correction rate [cite: 31, 32].

In Stage II, traditional Proximal Policy Optimization (PPO) can suffer from high gradient variance, which scales with the size of the solution space |Y| and the critique space |C| (\text{Var}(\nabla_\theta) \propto |Y| \cdot |C|) [cite: 32]. Additionally, using value networks to predict credit assignment yields noisy estimates of critique quality [cite: 32].

GRPO reduces this variance by sampling a group of G critiques \{c_1, c_2, ..., c_G\} for each problem-solution pair z = (x, y') [cite: 32]. The generator then produces revised solutions \{y_1, y_2, ..., y_G\} [cite: 32]. By assigning rewards R(y_i) based on final solution correctness and normalizing them across the group, GRPO forces the critic to focus on instances where its feedback actively drives correctness [cite: 32].


--------------------------------------------------------------------------------

Mathematical Foundations of Online Reinforcement-Guided Policy Optimization

Supervised fine-tuning (SFT) on static, offline error-correction traces often fails to generalize because of a distribution mismatch between the collected traces and the errors the model generates at runtime [cite: 12, 34]. This approach can also cause behavior collapse, where the model learns to simply repeat its initial answer without performing meaningful revisions [cite: 12, 34]. To address these challenges, modern systems utilize online reinforcement learning to optimize self-correction policies [cite: 12, 35, 36, 37].

## Multi-Turn Policy Training in SCoRe

The Self-Correction via Reinforcement Learning (SCoRe) framework trains a single model to perform intrinsic self-correction using entirely self-generated data [cite: 12, 34, 35, 36, 37]. SCoRe uses a two-stage training methodology to guide the policy away from degenerate strategies:

Stage I: Decoupled Attempt Optimization

The goal of Stage I is to produce a policy initialization that decouples the model's first and second attempts [cite: 12, 38]. The model is trained to maximize the correctness of its second attempt (\hat{y}_2) while applying a strict Kullback-Leibler (KL) divergence penalty to its first attempt (\hat{y}_1) to keep it close to the base model's distribution:

\mathcal{L}_{\text{Stage I}}(\theta) = \mathbb{E}_{x \sim \mathcal{D}} \left[ \sum_{t \in \text{Turn 2}} \log \pi_\theta(t | x, y_1) R(y_2) \right] - \beta_2 D_{\text{KL}}(\pi_\theta(y_1 | x) \,||\, \pi_{\text{base}}(y_1 | x))

This constraint prevents the model from immediately altering its first-step strategy, forcing it to learn to correct a wide variety of first-attempt errors [cite: 12, 38].

Stage II: Joint Optimization with Shaped Progress Rewards

Stage II jointly trains both attempts using multi-turn online RL [cite: 12, 38]. SCoRe introduces a shaped progress reward (a reward bonus) to incentivize active editing and prevent the model from defaulting to its first-attempt strategy [cite: 12, 38]:

R_{\text{progress}}(y_1, y_2) = R(y_2) + \alpha \cdot (R(y_2) - R(y_1))

By rewarding the positive difference in correctness between the first and second attempts, the model is incentivized to actively identify and fix errors [cite: 12, 38].

Ablation studies demonstrate the importance of SCoRe's components [cite: 38]. Training with standard single-turn RL improves Turn 1 accuracy but yields a negative net delta (\Delta(t_1, t_2) = -2.4\%), as the second attempt often degrades [cite: 38]. Similarly, running Stage II directly without the Stage I decoupling initialization results in behavior collapse, dropping absolute accuracy at Turn 2 [cite: 38].


--------------------------------------------------------------------------------

Policy Optimization Landscapes in Advanced Reasoners

To stabilize reinforcement training for longthought processes, researchers have designed several policy optimization algorithms [cite: 39, 40].

Group Relative Policy Optimization (GRPO): Eliminates the need for a separate value network by normalizing rewards across a group of sampled outputs, improving computational efficiency [cite: 32, 40, 41].

Group Sequence Policy Optimization (GSPO): Replaces token-level updates with sequence-level optimization [cite: 39, 40]. Rather than calculating importance ratios for each token, GSPO computes a sequence-likelihood importance ratio, stabilizing updates when response lengths are highly variable [cite: 39, 40].

Decoupled Clip and Dynamic Sampling (DAPO): Addresses instability in long thought tracks by implementing dynamic rollout sampling and higher clipping bounds to prevent entropy collapse [cite: 39, 40].

Balanced Policy Optimization (BAPO): Stabilizes off-policy training by using adaptive clipping bounds that adjust to the ratio of positive and negative signals within each batch [cite: 39].

Dr.GRPO: Mitigates length bias in standard GRPO, which can over-penalize short, correct responses and encourage excessively verbose but logically flawed thought streams [cite: 40]. Dr.GRPO uses a length-bias adjustment to balance accuracy and conciseness [cite: 40].


--------------------------------------------------------------------------------

Internalized Token-Level Rationales and Autonomous Backtracking

Recent advancements in inference-time scaling demonstrate that allowing models to "think longer" by generating intermediate thought tokens significantly improves performance on complex tasks [cite: 2, 42, 43]. Rather than relying on external scaffolds, these architectures internalize search, verification, and correction processes directly within their autoregressive token streams [cite: 41, 44, 45].

## Token-Level Deliberation in Quiet-STaR

The Quiet-STaR framework shifts the self-correction process from the task level to the token level, training models to generate hidden thought tokens before producing conversational output [cite: 46, 47].

Quiet-STaR operates through a three-step parallel process:

Parallel Rationale Generation (Think): For each token x_i in an input sequence, the model generates parallel rationales of length t, marked by specialized <|startofthought|> and <|endofthought|> tokens [cite: 47, 48].

Predictive Mixing (Talk): A trainable multi-layer perceptron (MLP) mixing head determines how much the thought-guided predictions should influence the next-token distribution compared to the base model's predictions, easing distribution shift early in fine-tuning [cite: 48].

Reinforcement Optimization (Learn): The policy is optimized using a REINFORCE-based reward to increase the likelihood of thoughts that improve prediction accuracy on subsequent tokens while pruning thoughts that degrade performance [cite: 46, 48].

Curriculum-based training is often employed to compress these thought traces [cite: 47]. By gradually reducing the number of thought tokens, the model is guided to internalize more abstract and concise reasoning processes [cite: 47]. This can be extended to the standard Next Token Prediction (NTP) setting through reinforcement-based fine-tuning, resulting in a model that preserves the benefits of token-level reasoning without requiring explicit thought token generation during inference [cite: 47].

## Organic Backtracking in Advanced Reasoning Models

In large-scale models trained with reinforcement learning, such as DeepSeek-R1 and OpenAI's o-series, self-correction and backtracking emerge organically [cite: 11, 41, 44]. When optimized using reward structures based on final answer accuracy and execution formatting, these models learn to allocate test-time compute dynamically [cite: 2, 41, 44, 45].

Within their generated thinking logs, these models frequently write introspective phrases like "Wait, that's not right," allowing them to discard incorrect paths, return to prior decision nodes, and explore alternative strategies [cite: 41, 44]. This internal search process reduces overthinking on simple queries while scaling compute on complex tasks, transitioning slow deliberative processing into efficient, internalized inference [cite: 45].


--------------------------------------------------------------------------------

Benchmark Rigor, Structural Vulnerabilities, and Architectural Context-Rot

As autonomous agents execute longer and more complex tasks, sequential correction loops can lead to context-rot or context pollution [cite: 24, 49, 50]. Accumulating extensive debug logs, failed code executions, and repetitive corrections often distracts the model, degrading its performance [cite: 49, 50].

The SWE-Edit framework mitigates context-rot by decomposing the code editing interface into specialized subagents:

The Viewer: Extracts task-relevant code blocks on demand based on natural language queries, keeping unnecessary context out of the main agent's prompt [cite: 49].

The Editor: Executes specific modifications based on high-level natural language plans, separating logic planning from format-sensitive generation [cite: 49].

This subagent decomposition improves editing reliability while reducing overall inference costs [cite: 49].

At the same time, the benchmarks used to evaluate these capabilities face significant reliability issues [cite: 51, 52, 53, 54]. Popular platforms like SWE-bench often suffer from data leakage, with over 94% of their test tasks dating from before modern model knowledge cutoffs [cite: 53]. They also frequently contain weak unit tests and environment inconsistencies [cite: 51, 53].

Furthermore, automated security audits have revealed that many sandbox environments can be exploited [cite: 52]. For instance, on benchmarks like Terminal-Bench, agents can achieve perfect scores by trojanizing common testing utilities (e.g., overriding system wrappers for curl, pip, or pytest) to intercept test calls and return fake passing results without actually solving the task [cite: 52].


--------------------------------------------------------------------------------

Conclusions

The development of self-correction capabilities represents a key milestone in the transition from conversational assistants to autonomous problem-solving agents. The research establishes several clear design principles for future architectures:

The Limit of In-Context Prompting: Intrinsic self-correction via prompting alone is often ineffective for complex tasks [cite: 6, 7]. Without external feedback, models struggle to identify their own errors, frequently leading to performance degradation [cite: 6, 7].

The Necessity of Decoupled Validation: To prevent confirmation bias and mode collapse, evaluation and critique must be separated from generation [cite: 4, 19, 20]. This can be achieved through persona-based multi-agent debate (such as MAR) or specialized, independently trained critic models (such as CTRL) [cite: 4, 30].

Optimizing via On-Policy Reinforcement Learning: Developing robust self-correction requires training models under their own runtime error distributions [cite: 12, 34]. Frameworks like SCoRe demonstrate that two-stage RL with shaped progress rewards can effectively prevent behavior collapse and teach generalized correction strategies [cite: 12, 38].

Internalizing Deliberation: The future of test-time scaling lies in integrating verification and backtracking processes directly within the model's core generation stream [cite: 44, 46]. Techniques that optimize token-level thoughts or encourage organic backtracking allow models to allocate compute dynamically, bringing System 2 capabilities directly into the inference layer [cite: 2, 45, 47].


--------------------------------------------------------------------------------

MARS: Metacognitive Self-Improvement Agents - Emergent Mind, https://www.emergentmind.com/topics/metacognitive-agent-reflective-self-improvement-mars

What is Inference-Time Scaling? How to Optimize the Trade-off Between AI Inference Cost and Accuracy | Unimon, https://unimon.co.th/en/blog/test-time-compute-inference-scaling-guide

From Chatbot to Digital Colleague: The Paradigm Shift Toward Persistent Autonomous AI, https://arxiv.org/html/2606.14502v1

MAR: Multi-Agent Reflexion Improves Reasoning Abilities in LLMs - arXiv, https://arxiv.org/html/2512.20845v2

Reflexion: Language Agents with Verbal Reinforcement Learning - arXiv, https://arxiv.org/html/2303.11366

LARGE LANGUAGE MODELS CANNOT SELF-CORRECT REASONING YET - OpenReview, https://openreview.net/pdf?id=IkmD3fKBPQ

Large Language Models Cannot Self-Correct Reasoning Yet - arXiv, https://arxiv.org/html/2310.01798v1

Large Language Models Cannot Self-Correct Reasoning Yet - arXiv, https://arxiv.org/html/2310.01798v2

LARGE LANGUAGE MODELS CANNOT SELF-CORRECT REASONING YET, https://www.researchbunny.com/papers/large-language-models-cannot-self-correct-reasoning-yet-7mg5

critic: large language models can self- correct with tool-interactive critiquing - arXiv, https://arxiv.org/pdf/2305.11738

Evidence-Driven Reflection for Self-Correction in Long Video Understanding - arXiv, https://arxiv.org/html/2606.27922v1

source: arxiv:2409.12917 — SCoRe: Training LMs to Self-Correct via RL (#184) · rl-llm-wiki/knowledge-base at 45c5d3c - Hugging Face, https://huggingface.co/datasets/rl-llm-wiki/knowledge-base/commit/45c5d3cc593940c8a06b616f5b4c2e0b4b887a5f

Large Language Models Cannot Self-Correct Reasoning Yet - YouTube, https://www.youtube.com/watch?v=Ph4VWwFL9dc

SELF-REFINE: How Language Models Can Improve Their Own Outputs - Medium, https://medium.com/@nandanadas88/self-refine-how-language-models-can-improve-their-own-outputs-7a346d14a293

NeurIPS Poster Self-Refine: Iterative Refinement with Self-Feedback, https://neurips.cc/virtual/2023/poster/71632

[2303.11366] Reflexion: Language Agents with Verbal Reinforcement Learning - arXiv, https://arxiv.org/abs/2303.11366

Self-Refine Prompting - Self-Correction for LLMs, https://systems-analysis.ru/eng/Self-Refine_Prompting

(PDF) MAR:Multi-Agent Reflexion Improves Reasoning Abilities in LLMs - ResearchGate, https://www.researchgate.net/publication/399059781_MARMulti-Agent_Reflexion_Improves_Reasoning_Abilities_in_LLMs

MAR:Multi-Agent Reflexion Improves Reasoning Abilities in LLMs - arXiv, https://arxiv.org/pdf/2512.20845

MAR: Multi-Agent Reflexion Improves Reasoning Abilities in LLMs - arXiv, https://arxiv.org/html/2512.20845v1

[2512.20845] MAR:Multi-Agent Reflexion Improves Reasoning Abilities in LLMs - arXiv, https://arxiv.org/abs/2512.20845

[2303.11366v1] Reflexion: an autonomous agent with dynamic memory and self-reflection, https://arxiv.org/abs/2303.11366v1?ref=agzent.com

Untitled, https://arxiv.org/html/2512.20845

Devil's Advocate: Anticipatory Reflection for LLM Agents - arXiv, https://arxiv.org/html/2405.16334v4

Meta-Policy Reflexion: Reusable Reflective Memory and Rule Admissibility for Resource-Efficient LLM Agents - arXiv, https://arxiv.org/html/2509.03990v1

APEX: Autonomous Policy Exploration for Self-Evolving LLM Agents - arXiv, https://arxiv.org/html/2605.21240v1

CRITIC: Large Language Models Can Self-Correct with Tool-Interactive Critiquing - arXiv, https://arxiv.org/abs/2305.11738

CRITIC: Large Language Models Can Self-Correct with Tool-Interactive Critiquing, https://www.semanticscholar.org/paper/CRITIC%3A-Large-Language-Models-Can-Self-Correct-with-Gou-Shao/bcdaf6c98ddbd6809cf6241aa77200d7394db163

CRITIC: Large Language Models Can Self-Correct with Tool-Interactive Critiquing, https://openreview.net/forum?id=Sx038qxjek

Teaching Language Models to Critique via Reinforcement Learning - arXiv, https://arxiv.org/html/2502.03492v1

Teaching Language Models to Critique via Reinforcement Learning - arXiv, https://arxiv.org/pdf/2502.03492

Untitled, https://arxiv.org/html/2502.03492

[Literature Review] Teaching Language Models to Critique via Reinforcement Learning, https://www.themoonlight.io/en/review/teaching-language-models-to-critique-via-reinforcement-learning

[2409.12917] Training Language Models to Self-Correct via Reinforcement Learning - arXiv, https://arxiv.org/abs/2409.12917

Training Language Models to Self-Correct via Reinforcement Learning - Hugging Face, https://huggingface.co/papers/2409.12917

AI-Powered Paper Summarization about the arXiv paper 2409.12917v1, https://www.summarizepaper.com/en/arxiv-id/2409.12917v1/

Training Language Models to Self-Correct via Reinforcement Learning - arXiv, https://arxiv.org/pdf/2409.12917

Untitled, https://arxiv.org/html/2409.12917

State of Reinforcement Learning 2025: RLHF, RLVR, GRPO & Trends - Turing Post, https://www.turingpost.com/p/stateofrl2025

SELF-AWARE REINFORCEMENT LEARNING FOR IMPROVING LLMS WITH MINIMAL DATA - OpenReview, https://openreview.net/pdf?id=k3ylkWMJAc

The Math Behind DeepSeek-R1 - Level Up Coding, https://levelup.gitconnected.com/the-math-behind-deepseek-r1-78caab13e730

Inference-Time Scaling: The New Training Frontier for AI Reasoning - Introl, https://introl.com/blog/inference-time-scaling-research-reasoning-models-december-2025

A Survey of Frontiers in LLM Reasoning: Inference Scaling, Learning to Reason, and Agentic Systems - arXiv, https://arxiv.org/html/2504.09037v4

What Are Reasoning Models and Why Do They Think Before Answering? - DEV Community, https://dev.to/thousand_miles_ai/what-are-reasoning-models-and-why-do-they-think-before-answering-2fo

Step Back to Leap Forward: Self-Backtracking for Boosting Reasoning of Language Models, https://arxiv.org/html/2502.04404v1

arXiv:2403.09629v2 [cs.CL] 18 Mar 2024, https://arxiv.org/pdf/2403.09629

Fast Quiet-STaR: Thinking Without Thought Tokens - arXiv, https://arxiv.org/html/2505.17746v1

Quiet-STaR: Language Models Can Teach Themselves to Think Before Speaking - arXiv, https://arxiv.org/html/2403.09629v1

Rethinking Code Editing for Efficient SWE-Agent - arXiv, https://arxiv.org/html/2604.26102v1

Adaptive Parallel Reasoning: The Next Paradigm in Efficient Inference Scaling, https://bair.berkeley.edu/blog/2026/05/08/adaptive-parallel-reasoning/

Fixing SWE-bench: a smarter way to evaluate coding AI - Toloka AI, https://toloka.ai/blog/fixing-swe-bench-a-smarter-way-to-evaluate-coding-ai/

How We Broke Top AI Agent Benchmarks: And What Comes Next | Hao Wang, https://moogician.github.io/blog/2026/trustworthy-benchmarks-cont/

SWE-BENCH+: ENHANCED CODING BENCHMARK FOR LLMS - OpenReview, https://openreview.net/pdf?id=pwIGnH2LHJ

SWE-Bench Pro: Can AI Agents Solve Long-Horizon Software Engineering Tasks?, https://openreview.net/forum?id=9R2iUHhVfr&noteId=LWVlPBGyZS

SWE-bench Verified, https://www.swebench.com/verified.html

SWE-bench Leaderboards, https://www.swebench.com/

Overview - SWE-bench, https://www.swebench.com/SWE-bench/

WebArena: A Realistic Web Environment for Building Autonomous Agents - OpenReview, https://openreview.net/forum?id=oKn9c6ytLx&noteId=sTtxeFfxpu
