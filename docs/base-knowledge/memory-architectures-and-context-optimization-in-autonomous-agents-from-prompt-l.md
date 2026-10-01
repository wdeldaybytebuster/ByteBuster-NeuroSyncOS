# Memory Architectures and Context Optimization in Autonomous Agents: From Prompt-Level Compression to Algorithmic Key-Value Cache Eviction

Memory Architectures and Context Optimization in Autonomous Agents: From Prompt-Level Compression to Algorithmic Key-Value Cache Eviction

The deployment of large language models as stateful, autonomous agents represents a major shift in artificial intelligence engineering [cite: 1, 2]. Standard autoregressive language models operate in a stateless paradigm, processing each request in isolation with no inherent continuity across interactions [cite: 1, 2]. To bridge the gap between static text generation and persistent agentic behavior, system developers must implement state management architectures that enable models to retain, organize, and utilize information across extended conversations and tasks [cite: 1, 2].

However, the physical constraints of Transformer-based architectures introduce a significant bottleneck: the finite size of the context window [cite: 1, 3, 4, 5]. As interactions accumulate, the volume of historical data, tool outputs, and system instructions can quickly exceed these token limits, leading to high computational costs, increased processing latency, and performance degradation [cite: 3, 6, 7, 8, 9]. Managing the context window efficiently is therefore a critical engineering challenge [cite: 2, 3, 7].

A modern agentic memory stack must balance the ephemeral workspace of the context window with persistent external storage systems while using specialized algorithms to compress prompts and optimize the model's internal Key-Value cache [cite: 3, 7, 10, 11].


--------------------------------------------------------------------------------

The Context Window as Volatile Workspace: RAM versus Persistent Storage

In agentic system design, the relationship between the central processor and its memory tiers can be modeled using a computer operating system analogy [cite: 2, 3, 12, 13]. The large language model functions as the central processing unit, while the active context window represents volatile Random Access Memory, or high-bandwidth GPU memory [cite: 2, 3, 7, 12, 13]. Any information stored in episodic, semantic, or procedural memory databases remains inactive and inaccessible until it is explicitly loaded into this active context space [cite: 3].

The active context window serves as the primary workspace where real-time reasoning, tool calls, and dialogue generation occur [cite: 1, 3, 7, 12]. However, treating the context window as a long-term database leads to operational failures [cite: 7]. The context window share key limitations with physical RAM that make it unsuitable for persistent storage [cite: 7]:

First, the context window is highly volatile, meaning that all instructions, temporary preferences, and reasoning paths are lost as soon as the active session terminates [cite: 3, 7]. Second, model performance degrades long before the physical token limit is reached [cite: 7]. Under self-attention mechanics, models exhibit a U-shaped accuracy curve, retrieving information located at the beginning and end of the context window with high fidelity, while often overlooking facts buried in the middle [cite: 7, 14, 15]. This attention dilution degrades retrieval accuracy in multi-document tasks by 20% to 30% [cite: 14].

Additionally, keeping unnecessary data in the context window increases operational costs, as every API call requires re-processing the entire active sequence [cite: 7]. Finally, model adherence to behavioral constraints declines over long sequences [cite: 7]. Studies show that while positive commands (commission constraints) remain stable, negative rules (omission constraints, which direct the model what not to do) decay rapidly [cite: 7]. For example, a negative constraint established at turn 3 may drop from a 73% compliance rate at turn 5 to just 33% by turn 16 [cite: 7].

To maintain model accuracy and manage processing costs, developers split agent memory into a distinct two-layer architecture [cite: 7]. Working memory handles the volatile, immediate information needed for the active task, while persistent storage manages long-term facts, safety rules, and session-spanning data [cite: 7].

In cognitive science, Tulving’s binding principle states that a memory is only useful if it preserves enough context to be interpretable during retrieval, rather than merely recognizable [cite: 12]. Storing raw conversation transcripts is often insufficient for long-term agent consistency [cite: 12].

Instead, systems must perform structured encoding at ingestion time, processing raw transcripts into standardized memories that link the observed event, its temporal context, and its outcome [cite: 12]. This structured data is then routed to the persistent storage layer, where it is indexed for future query-time retrieval [cite: 12].


--------------------------------------------------------------------------------

Engineering Frameworks for State Management and Active Memory Control

Several frameworks, such as MemGPT and Letta, implement virtual context management by partitioning the model's workspace into structured memory blocks [cite: 1, 2, 3, 12]. These systems manage memory through three key layers: Core Memory, Recall Memory, and Archival Memory [cite: 2].

Core Memory contains critical system details, such as the agent's persona and user preferences, which are pinned directly to the top of the context window [cite: 1, 2]. These blocks have strict character limits and can be dynamically modified by the agent using specialized API tools [cite: 2].

Recall Memory stores the full chronological history of conversational exchanges outside the active context window, allowing the agent to query and pull older logs back into its workspace as needed [cite: 2].

Archival Memory acts as a large, external knowledge repository where structured documents, codebases, or database tables are indexed and accessed using vector search or graph traversals [cite: 2].

To minimize processing delays during active dialogue, systems use a stateful, dual-agent architecture to handle memory operations asynchronously [cite: 2]. In this setup, a fast primary model (such as GPT-4o-mini) handles live user interactions without memory-editing capabilities [cite: 2].

During periods of inactivity, a background sleep-time agent runs asynchronously using a larger, more powerful model (such as Claude 3.7 Sonnet) to analyze raw logs, extract key facts, and rewrite the primary agent's Core Memory blocks [cite: 2]. This asynchronous consolidation keeps the active context clean and prevents the performance drops associated with continuous log growth [cite: 2].

Software development frameworks provide concrete abstractions to implement these memory strategies [cite: 1, 20]. For example, LangChain provides specialized classes designed to manage, summarize, and compress conversation history [cite: 20, 21, 22, 23, 24]:

ConversationBufferMemory: Stores raw conversation history sequentially as a rolling transcript [cite: 20, 23, 25]. While simple to implement, its token footprint scales linearly with conversation length, making it unsuitable for long sequences [cite: 20, 21, 25].

ConversationBufferWindowMemory: Maintains a sliding window of the last k conversational turns, dropping older exchanges [cite: 21, 22, 23]. This provides predictable token consumption but loses all historical context beyond the active window [cite: 1, 21, 23].

ConversationSummaryMemory: Uses an auxiliary language model to maintain a running summary of the conversation [cite: 21, 22, 23]. After each turn, the summary is updated to preserve key context while reducing token usage [cite: 21, 23]. However, this iterative compression can introduce summarization drift over long sequences [cite: 13, 26].

ConversationSummaryBufferMemory: Combines raw buffer tracking with running summarization [cite: 21, 22, 23, 24]. It keeps recent exchanges verbatim in the active window [cite: 24]. Once the sequence exceeds a pre-set token limit, older turns are extracted, compiled into a running summary, and appended at the front of the context [cite: 3, 23, 24]. This hybrid approach balances precision for recent interactions with long-term context retention [cite: 3, 24].

These memory architectures can also be configured using specific parameters to control how messages are structured and stored [cite: 20]:

return_messages: When set to True, the memory buffer is returned as a list of structured message objects, which is ideal for chat models [cite: 20]. When set to False, it returns a single concatenated string, which is typically used for completion APIs [cite: 20].

ai_prefix and human_prefix: Define the speaker labels used in the text buffer, allowing developers to align the history with the formatting of the underlying model [cite: 20].

input_key and output_key: Explicitly define which keys in the system's input and output dictionaries correspond to active user messages and agent responses, ensuring the memory system records the correct interactions [cite: 20].

chat_memory: Allows developers to swap the default in-memory history storage for persistent backends like Redis or DynamoDB to persist conversations across sessions [cite: 20, 23].

Managing conversation history under strict context constraints is particularly important in specialized applications [cite: 27]. For example, the Conversational Patient Assistance and Triage in Healthcare (C-PATH) system uses a multi-turn dialogue management module to prune history and selectively summarize earlier turns, keeping conversations within its 1024-token limit [cite: 27].

During development, fine-tuning datasets like MedQA-USMLE, MedMCQA, and PubmedQA are used to evaluate how different dialogue structures affect token consumption [cite: 27]. Conversational formats can vary widely [cite: 27]:

Expanded layperson dialogue (data_5k_artificial) often uses verbose phrasing that can exceed 40 turns per interaction [cite: 27]. This rapid token growth risks exceeding context limits, making training and inference less stable [cite: 27].

Structured GPT-rewritten interactions (data_5k_GPT) maintain tighter control over token lengths, keeping most conversations under 30 turns [cite: 27]. This structural consistency reduces context overflows and improves model stability during training and deployment [cite: 27].


--------------------------------------------------------------------------------

Mathematical Formalization of Prompt and Context-Resident Compression

Prompt compression reduces the length of input prompts while preserving their core semantic meaning [cite: 11]. This is done using either hard compression (which selects a verbatim subsequence of the original text) or soft compression (which maps token segments into continuous vector representations using a trained model) [cite: 11].

Hard prompt compression is formalized as an optimization problem [cite: 11]. Given an original prompt O, the goal is to find a compressed subsequence H \subseteq O that minimizes token length |H| while keeping the semantic divergence between the model's outputs on O and H below a threshold \epsilon [cite: 11]:

\min_{H \subseteq O} |H|, \quad \text{s.t.} \quad D_{\text{sem}}(O, H) \leq \epsilon

In practice, this divergence is measured using the Kullback-Leibler (KL) divergence between the output probability distributions generated by the model when fed with either the original or the compressed prompt [cite: 11]:

D_{\text{sem}}(O, H) = D_{\text{KL}}\left(P\left(\mathbf{y} \mid O\right) \parallel P\left(\mathbf{y} \mid H\right)\right)

where \mathbf{y} represents the generated output tokens [cite: 28, 29].

Soft prompt compression, by contrast, maps continuous segments of tokens into condensed vector sequences (C_0, C_1) using a frozen encoder and a trainable projection bridge [cite: 11]. This aligns the compressed vectors with the model's embedding space [cite: 11].

The LLMLingua framework uses a coarse-to-fine compression method based on the information entropy of a small language model (M_s) [cite: 6, 28, 30, 31, 32]. Tokens with low perplexity contribute less to the model's overall information gain, meaning they can be removed with minimal impact on the target model's understanding [cite: 6, 28, 32]. The compression process is managed by three core modules [cite: 6, 28, 31, 32]:

## The Budget Controller

The Budget Controller dynamically allocates target compression rates to different parts of the prompt, such as system instructions, in-context demonstrations, and the active query [cite: 6, 28, 32]. Demonstrations are typically compressed first, with any remaining token budget reallocated to instructions and queries using a dynamic reallocation formula [cite: 6, 28, 32]:

\Delta \tau = \frac{k \cdot \tau_{\text{dems}} L_{\text{dems}} - \tilde{L}_{\mathcal{D}}}{L_{\text{ins}} + L_{\text{que}}}

where \tau_{\text{dems}} is the target compression rate for demonstrations, L_{\text{dems}} is the original token length of the demonstrations, \tilde{L}_{\mathcal{D}} is the actual length of the retained demonstrations, L_{\text{ins}} and L_{\text{que}} are the lengths of the instructions and questions, and k is a scaling constant [cite: 28, 29, 32].

## Segment-Wise Iterative Token Compression

To preserve the linguistic and logical connections between adjacent tokens, LLMLingua processes the input sequence in segments [cite: 6, 28, 32]. It divides the prompt into m segments, \mathcal{S} = \{\mathbf{s}_1, \mathbf{s}_2, \dots, \mathbf{s}_m\}, and calculates conditional probabilities across them [cite: 6, 28, 32]:

p(\tilde{\mathbf{s}}_j) = \prod_{i=1}^{\tilde{L}} p\left(\tilde{x}_i \mid \tilde{x}_{<i}, \bar{x}_{<i}\right)

where \tilde{x}_i represents the tokens within the current segment, and \tilde{x}_{<i} and \bar{x}_{<i} are the preceding compressed and discarded tokens, respectively [cite: 32]. Tokens with conditional probabilities falling below a dynamic threshold \gamma_i are pruned, and the remaining tokens are passed as context for the next segment [cite: 6, 32]. This process preserves grammatical cohesion across the sequence [cite: 6].

## Distribution Alignment

Because the small model M_s (such as Phi-2) may have a different vocabulary distribution than the larger target model, the compression process can introduce formatting artifacts that degrade performance [cite: 6, 28, 31, 32]. To prevent this, M_s is fine-tuned on instruction-output pairs generated by the target model, aligning their text distributions [cite: 6, 28, 31, 32]:

\mathcal{L}_{\text{align}}\left(\theta_{M_s}\right) = -\frac{1}{N} \sum_{i=1}^{N} \log P\left(\mathbf{y}_i^{\text{LLM}} \mid \mathbf{x}_i; \theta_{M_s}\right)

where \mathbf{x}_i represents the input prompt and \mathbf{y}_i^{\text{LLM}} is the corresponding target model generation [cite: 29].


--------------------------------------------------------------------------------

Hierarchical Summarization Dynamics and Clustering Trees

When dealing with very long documents or conversation histories, simple token-level pruning can break the narrative structure of the text [cite: 26, 34]. In these cases, developers use hierarchical summarization, which condenses text into structured, multi-layered summaries [cite: 16, 34].

This approach organizes information into a summary tree, allowing the model to query different levels of detail depending on the task [cite: 16, 34]. This structure is supported by several specialized systems:

RAPTOR (Recursive Abstractive Processing for Tree-Organized Retrieval): Constructs hierarchical summary trees by clustering text chunks and recursively summarizing them [cite: 34]. This integrates information from different parts of a document, making it easier for the model to answer complex, multi-step questions [cite: 34].

DTCRS (Dynamic Tree Construction for Recursive Summarization): Instead of building a static tree, DTCRS dynamically constructs a summary tree based on the document's table of contents and the semantics of the user's query [cite: 34]. This focuses the summary on the active topic, reducing redundant information and improving retrieval efficiency [cite: 34].

HERCULES (Hierarchical Embedding-based Recursive Clustering): Recursively clusters document embeddings using k-means starting from level 0 [cite: 35]. It uses a language model to generate descriptive titles and summaries for each cluster, improving the interpretability of the hierarchy [cite: 35]. It supports both "direct" mode (clustering raw embeddings) and "description" mode (clustering based on LLM-generated summaries), and can be guided toward specific themes using a topic seed [cite: 35].

These hierarchical structures can also be applied to user preference modeling [cite: 36]. For example, in text-rich sequential recommendation systems (such as LLM-TRSR), user history is processed using CNN- or RNN-inspired paradigms [cite: 36]:

Hierarchical Summarization (CNN-Inspired): Divides the user's behavioral history into separate blocks and summarizes each block individually [cite: 36]. These summaries are then concatenated and summarized again at a higher level, capturing broad preference trends [cite: 36].

Recurrent Summarization (RNN-Inspired): Summarizes the first behavioral block and passes that summary as context to process the next block [cite: 36]. This sequential approach models how user preferences evolve over time [cite: 36].


--------------------------------------------------------------------------------

Key-Value Cache Eviction Mechanics and Resource Budgets

At the hardware layer, multi-turn generation introduces a significant bottleneck: the linear growth of the Key-Value (KV) cache [cite: 4, 10, 37, 38]. During autoregressive decoding, each generated token must attend to the keys and values of all previous tokens [cite: 4, 38].

To avoid recomputing these vectors at every step, inference engines store them in GPU memory [cite: 4, 38, 39]. As sequences grow, the memory footprint of this cache can quickly exceed the model parameters themselves [cite: 8]. For example, the parameters of a 7-billion-parameter model require 14 GB of GPU memory, while its KV cache can consume up to 72 GB over long sequences [cite: 8].

To manage this memory footprint, models use architectural variations like Multi-Query Attention (MQA) or Grouped-Query Attention (GQA) [cite: 8]. In MQA, all query heads share a single key and value head, which significantly reduces the size of the cache [cite: 8]. GQA balances this by grouping query heads to share key and value heads, optimizing both memory consumption and retrieval accuracy [cite: 8].

Alongside these architectural designs, inference engines use real-time eviction strategies to stay within a fixed memory budget [cite: 10, 40]. These eviction algorithms prioritize token retention through several distinct mechanisms:

## Attention Sinks (StreamingLLM)

Transformers systematically assign high attention weights to the first few tokens in a sequence, regardless of their semantic relevance [cite: 8, 10, 38, 40, 41, 42, 43]. Because the softmax operation forces attention weights to sum to one, the model distributes surplus attention to these initial tokens when no strong semantic matches exist [cite: 43, 44].

In addition to collecting attention in the forward pass, this pattern concentrates gradients during backward passes, creating gradient sinks [cite: 45]. This gradient concentration can be measured using attention-column mass and second-moment metrics [cite: 45]:

M_s^{\ell, h} = \sum_{t=s}^{T-1} a_{ts}^{\ell, h}, \quad S_s^{\ell, h} = \sum_{t=s}^{T-1} \left(a_{ts}^{\ell, h}\right)^2

where a_{ts}^{\ell, h} represents the attention weight from token t to sink token s at layer \ell and head h [cite: 45].

StreamingLLM exploits this pattern by keeping these initial sink tokens pinned in memory alongside a sliding window of recent tokens, discarding intermediate content [cite: 10, 40, 41, 42]. This stabilizes the attention distribution during continuous generation without requiring model fine-tuning [cite: 41, 42, 44].

The attention sink also functions as an implicit gating mechanism [cite: 43]. This behaves similarly to explicit gated attention, which uses sigmoid activations to route attention weights [cite: 43]:

G_t^{\ell, h} = \sigma\left(\mathbf{x}_t^{\ell} W_{\theta}^{\ell, h}\right)

where W_{\theta}^{\ell, h} is a learnable projection matrix [cite: 43].

## Heavy Hitters (H2O & SnapKV)

H2O identifies that a small subset of tokens receives the majority of the attention weight during decoding [cite: 8, 38, 46, 47]. It tracks the cumulative attention scores of each token and evicts the lowest-scoring ones to maintain a fixed cache budget [cite: 8, 10, 38, 47].

SnapKV applies this method to the prefill stage of long-context tasks [cite: 8, 10, 38, 40]. It uses a small observation window at the end of the prompt to evaluate attention weights, selecting and keeping only the most important prefix tokens before generation begins [cite: 8, 10, 38, 40].

## Twilight (Top-p Adaptive Sparsity)

While most systems use a fixed Top-k budget, Twilight dynamically evaluates attention weights using Top-p thresholds [cite: 37]. This accommodates both focused attention layers (which require only a few tokens to capture the bulk of the attention mass) and diffuse attention layers (where weights are distributed broadly across the sequence) [cite: 37]. This adaptive pruning can discard up to 98% of tokens with minimal impact on accuracy [cite: 37].

## TriAttention (Trigonometric Compression)

Pre-RoPE (Rotary Position Embedding) Query and Key vectors concentrate around fixed, non-zero center points across most attention heads and model architectures [cite: 48, 49, 50, 51, 52]. Because of this clustering, query-key attention scores can be modeled as a function of their positional distance using a trigonometric series [cite: 48, 50, 51, 52].

TriAttention uses these center points to score and compress keys offline using calibration data, eliminating the need to track live queries during generation [cite: 48, 51, 52]. The trigonometric scoring function evaluates keys across geometrically spaced future offsets [cite: 48, 51]:

S_{\text{trig}}(j) = \sum_{d \in \mathcal{D}} w_d \cdot \cos\left(\theta_d \cdot (d - j)\right)

where \mathcal{D} = \{1, 2, 4, \dots, 2^{16}\} represents the set of target offsets, and w_d are weighting factors [cite: 48, 51].

This positional prior is combined with Query-Key norms to identify important keys, reducing memory footprint by 10.7x while maintaining accuracy on complex mathematical tasks [cite: 48, 49, 51, 52].

## K-VEC & Nexus Sampling

To prevent performance drops caused by aggressive pruning, K-VEC monitors token coverage across different attention heads and layers [cite: 10, 53]. This coverage preserves the mutual information between inputs and outputs, protecting the model's predictive accuracy on long-context tasks [cite: 10, 53].

Nexus Sampling addresses the fragility of deterministic Top-k cutoffs, which can permanently evict tokens that look temporarily marginal during a single step [cite: 10, 40, 54, 55]. It uses a short iterative walk over the attention matrix to calculate "Nexus scores" for "bridge tokens" (which anchor clusters of mutually-attended tokens) [cite: 10, 40, 55].

These scores serve as weights in a reservoir sampling step, ensuring that every positive-weight token maintains a non-zero probability of remaining in memory [cite: 40, 55]. This probabilistic buffer protects long-term context during continuous streaming [cite: 10, 40, 54, 55].


--------------------------------------------------------------------------------

Cognitive Memory Evaluation and Benchmarking Paradigms

Evaluating long-range memory requires benchmarks that test behavior beyond simple keyword matching [cite: 57, 58]. Standard evaluations can overlook how well an agent maintains context over long sequences [cite: 58].

To address this, modern evaluation frameworks use benchmarks like LoCoMo and LoCoMo-Plus to stress-test long-range retrieval and reasoning [cite: 57, 58]:

LoCoMo: Evaluates models on their ability to recall and process facts across hundreds of conversational turns and multi-session dialogues [cite: 57]. It tests single-hop queries, multi-hop temporal reasoning, and chronological event graph reconstruction, which is scored using FactScore and graph F1 metrics [cite: 57].

LoCoMo-Plus: Targets beyond-factual cognitive memory [cite: 58]. It uses long-context scenarios with a "cue-trigger semantic disconnect," where the model must remember and apply implicit constraints established early in the conversation to guide its future actions [cite: 58].

To improve performance on these long-range tasks, advanced memory frameworks structure context using multi-scale temporal hierarchies [cite: 57]:

TiMem (Temporal-Hierarchical Memory): Consolidates conversational memory into structured scales, organizing events from turn \rightarrow session \rightarrow day \rightarrow week \rightarrow month [cite: 57]. It uses complexity-aware recall to pull relevant historical facts back into the active context [cite: 57].

ENGRAM-R, Amory, O-Mem, MemWeaver, Hindsight, and MIRIX: These architectures use dynamic context pruning and relational indexing to achieve high retrieval accuracy on the LoCoMo and LongMemEval benchmarks while reducing token consumption to a fraction of the baseline [cite: 18, 57, 59].

Using these stateful memory layers, prompt compression techniques, and algorithmic cache eviction strategies, developers can build agentic systems that maintain operational efficiency and behavioral consistency over long deployments [cite: 2, 3, 7, 17].


--------------------------------------------------------------------------------

Agent memory: types, techniques, and implementation guide - Mastra, https://mastra.ai/articles/agent-memory

Agent Memory: How to Build Agents That Learn and Remember - Letta, https://www.letta.com/blog/agent-memory/

Working Memory in LLMs: The Context Window as Cognitive Architecture - Atlan, https://atlan.com/know/working-memory-llms/

KV Cache Optimization Strategies for Scalable and Efficient LLM Inference - arXiv, https://arxiv.org/pdf/2603.20397

Parse Trees Guided LLM Prompt Compression - IEEE Computer Society, https://www.computer.org/csdl/journal/tp/2026/01/11164467/2a2blVideec

Compressing Prompts with LLMLingua: Reduce Costs, Retain Performance - PromptHub, https://www.prompthub.us/blog/compressing-prompts-with-llmlingua-reduce-costs-retain-performance

Memory vs Context Window for LLM and AI Agents | Mem0, https://mem0.ai/blog/context-window-is-ram-not-storage-why-most-agent-failures-happen-how-to-fix-them-in-2026

Top 10 KV Cache Compression Techniques for LLM Inference: Reducing Memory Overhead Across Eviction, Quantization, and Low-Rank Methods - MarkTechPost, https://www.marktechpost.com/2026/04/29/top-10-kv-cache-compression-techniques-for-llm-inference-reducing-memory-overhead-across-eviction-quantization-and-low-rank-methods/

LongLLMLingua: Accelerating and Enhancing LLMs in Long Context Scenarios via Prompt Compression - arXiv, https://arxiv.org/html/2310.06839v2

SnapKV: LLM Knows What You are Looking for Before Generation - ResearchGate, https://www.researchgate.net/publication/397201904_SnapKV_LLM_Knows_What_You_are_Looking_for_Before_Generation

Prompt Compression for LLMs - Emergent Mind, https://www.emergentmind.com/topics/prompt-compression-for-large-language-models

Memory in AI Agents. A deep-dive for engineers who want to… | by Ali | Jun, 2026 | Medium, https://medium.com/@salisai/memory-in-ai-agents-6411c2589c5f

A Practical Guide to Memory for Autonomous LLM Agents | Towards Data Science, https://towardsdatascience.com/a-practical-guide-to-memory-for-autonomous-llm-agents/

Prompt Compression Techniques: Reducing Context Window Costs While Improving LLM Performance | by Kuldeep Paul | Medium, https://medium.com/@kuldeep.paul08/prompt-compression-techniques-reducing-context-window-costs-while-improving-llm-performance-afec1e8f1003

Agent Memory Architectures: 5 Patterns and Trade-offs - Atlan, https://atlan.com/know/agent-memory-architectures/

Top techniques to Manage Context Lengths in LLMs - Agenta, https://agenta.ai/blog/top-6-techniques-to-manage-context-length-in-llms

Context Window Management for Long-Running Agents: Strategies and Tradeoffs - MachineLearningMastery.com, https://machinelearningmastery.com/context-window-management-for-long-running-agents-strategies-and-tradeoffs/

AI Agent Memory 2026: Progress Benchmark Report Evaluations - Mem0, https://mem0.ai/blog/state-of-ai-agent-memory-2026

Beyond Static Summarization: Proactive Memory Extraction for LLM Agents - arXiv, https://arxiv.org/html/2601.04463v1

LangChain ConversationBufferMemory: Complete Implementation Guide + Code Examples 2025 - Latenode Blog, https://latenode.com/blog/ai-frameworks-technical-infrastructure/langchain-setup-tools-agents-memory/langchain-conversationbuffer-memory-complete-implementation-guide-code-examples-2025

How to Implement LangChain Memory - OneUptime, https://oneuptime.com/blog/post/2026-01-27-langchain-memory/view

Conversational Memory in LangChain | Aurelio AI, https://www.aurelio.ai/learn/langchain-conversational-memory

memory | langchain_classic - LangChain Reference, https://reference.langchain.com/python/langchain-classic/chains/conversation/memory

ConversationSummaryBufferMe, https://langchain-doc.readthedocs.io/en/latest/modules/memory/types/summary_buffer.html

Enhance Conversational Agents with LangChain Memory - Comet, https://www.comet.com/site/blog/enhance-conversational-agents-with-langchain-memory/

CogCanvas: Verbatim-Grounded Artifact Extraction for Long LLM Conversations - arXiv, https://arxiv.org/html/2601.00821v2

C-PATH: Conversational Patient Assistance and Triage in Healthcare System - arXiv, https://arxiv.org/html/2506.06737v1

LLMLingua: Compressing Prompts for Accelerated Inference of Large Language Models - ACL Anthology, https://aclanthology.org/2023.emnlp-main.825.pdf

arXiv:2310.05736v2 [cs.CL] 6 Dec 2023, https://arxiv.org/pdf/2310.05736

LLMLingua: Compressing Prompts for Accelerated Inference of Large Language Models, https://aclanthology.org/2023.emnlp-main.825/

Compressing Prompts for Accelerated Inference of Large Language Models - LLMLingua, https://llmlingua.com/llmlingua.html

LLMLingua: Compressing Prompts for Accelerated Inference of Large Language Models, https://arxiv.org/html/2310.05736v2

LongLLMLingua Prompt Compression Guide | LlamaIndex, https://www.llamaindex.ai/blog/longllmlingua-bye-bye-to-middle-loss-and-save-on-your-rag-costs-via-prompt-compression-54b559b9ddf7

DTCRS: Dynamic Tree Construction for Recursive Summarization - arXiv, https://arxiv.org/html/2604.07012v1

HERCULES: Hierarchical Embedding-based Recursive Clustering Using LLMs for Efficient Summarization - arXiv, https://arxiv.org/html/2506.19992v1

Harnessing Large Language Models for Text-Rich Sequential Recommendation - arXiv, https://arxiv.org/html/2403.13325v1

Twilight: Adaptive Attention Sparsity with Hierarchical Top-p Pruning - arXiv, https://arxiv.org/html/2502.02770v3

KV Cache Compression and Its Infra Problems - Research at NVIDIA, https://research.nvidia.com/labs/eai/blogs/kv-cache-compression-and-its-infra-problems/

TokenStack: A Heterogeneous HBM-PIM Architecture and Runtime for Efficient LLM Inference - arXiv, https://arxiv.org/pdf/2605.05639

Forget Without Compromise: Nexus Sampling for Streaming KV-Cache Eviction Under Fixed Budgets - arXiv, https://arxiv.org/pdf/2606.23961

EFFICIENT STREAMING LANGUAGE MODELS WITH ATTENTION SINKS - ICLR Proceedings, https://proceedings.iclr.cc/paper_files/paper/2024/file/5e5fd18f863cbe6d8ae392a93fd271c9-Paper-Conference.pdf

GitHub - mit-han-lab/streaming-llm: [ICLR 2024] Efficient Streaming Language Models with Attention Sinks, https://github.com/mit-han-lab/streaming-llm

Attention Sink Forges Native MoE in Attention Layers: Sink-Aware Training to Address Head Collapse - arXiv, https://arxiv.org/html/2602.01203v1

Attention Sink in Transformers - Emergent Mind, https://www.emergentmind.com/topics/attention-sink

Attention Sinks Induce Gradient Sinks: Massive Activations as Gradient Regulators in Transformers - arXiv, https://arxiv.org/html/2603.17771v2

[Feature]: H2O: Heavy-Hitter Oracle for Efficient Generative Inference of Large Language Models #3532 - GitHub, https://github.com/vllm-project/vllm/issues/3532

H2O: Heavy-Hitter Oracle for Efficient Generative Inference of Large Language Models - NIPS, https://proceedings.neurips.cc/paper_files/paper/2023/file/6ceefa7b15572587b78ecfcebb2827f8-Paper-Conference.pdf

TriAttention: Efficient Long Reasoning with Trigonometric KV Compression | OpenReview, https://openreview.net/forum?id=0tgzJK50Jz&referrer=%5Bthe%20profile%20of%20Bohan%20Zhuang%5D(%2Fprofile%3Fid%3D~Bohan_Zhuang1)

TriAttention — Efficient long reasoning with trigonometric KV cache compression. Enables OpenClaw local deployment on memory-constrained GPUs. - GitHub, https://github.com/WeianMao/triattention

TriAttention: Efficient Long Reasoning with Trigonometric KV Compression - arXiv, https://arxiv.org/html/2604.04921v1

Researchers from MIT, NVIDIA, and Zhejiang University Propose TriAttention: A KV Cache Compression Method That Matches Full Attention at 2.5× Higher Throughput - MarkTechPost, https://www.marktechpost.com/2026/04/11/researchers-from-mit-nvidia-and-zhejiang-university-propose-triattention-a-kv-cache-compression-method-that-matches-full-attention-at-2-5x-higher-throughput/

[2604.04921] TriAttention: Efficient Long Reasoning with Trigonometric KV Compression, https://arxiv.org/abs/2604.04921

Coverage-Driven KV Cache Eviction for Efficient and Improved Inference of LLM, https://openreview.net/forum?id=c6dwCJM0CK

Forget Without Compromise: Nexus Sampling for Streaming KV-Cache Eviction Under Fixed Budgets - ResearchGate, https://www.researchgate.net/publication/407645517_Forget_Without_Compromise_Nexus_Sampling_for_Streaming_KV-Cache_Eviction_Under_Fixed_Budgets

Forget Without Compromise: Nexus Sampling for Streaming KV-Cache Eviction Under Fixed Budgets - arXiv, https://arxiv.org/html/2606.23961v1

Towards Threshold-Free KV Cache Pruning - arXiv, https://arxiv.org/html/2502.16886v3

LoCoMo: Conversational Memory Benchmark - Emergent Mind, https://www.emergentmind.com/topics/locomo

Locomo-Plus: Beyond-Factual Cognitive Memory Evaluation Framework for LLM Agents - ACL Anthology, https://aclanthology.org/2026.acl-long.1150.pdf

Lightweight Memory Construction with Dynamic Evolution for LLM Agents - arXiv, https://arxiv.org/html/2601.14287v2
