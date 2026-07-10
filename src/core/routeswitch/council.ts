import { LLMProvider } from './providers';

export interface ConsensusResult {
  content: string;
  /** Numeric confidence, 0.0-1.0. Derived from disagreementScore as 1 - min(disagreementScore, 1). */
  confidence: number;
  disagreementScore: number;
}

/**
 * Build a term-frequency (bag-of-words) vector for a response.
 *
 * Tokenisation is deliberately simple and dependency-free: lowercase, then
 * split on any run of non-alphanumeric characters. This handles both prose and
 * the JSON-DAG payloads Council Mode usually arbitrates (keys like `nodes`,
 * `id`, `prompt` and their values all become comparable tokens; braces, quotes
 * and colons are treated as separators). We intentionally keep short tokens
 * (unlike the length>3 filter in cerebro/vector.ts's keyword fallback) because
 * for structured output short tokens like `id` carry real structural signal.
 */
function termFrequencies(text: string): Map<string, number> {
  const tf = new Map<string, number>();
  const tokens = text.toLowerCase().match(/[a-z0-9]+/g);
  if (!tokens) return tf;
  for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
  return tf;
}

/**
 * Cosine similarity between two term-frequency vectors, in [0, 1].
 *
 * Cosine over term frequencies (rather than raw string length) means two
 * responses that say the same thing at different verbosity still score as
 * highly similar — length no longer masquerades as (dis)agreement, which was
 * the core weakness of the previous heuristic. Returns 0 when either vector is
 * empty so an empty/degenerate response never inflates agreement.
 */
function cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
  if (a.size === 0 || b.size === 0) return 0;
  // Iterate the smaller map for the dot product.
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let dot = 0;
  for (const [term, freq] of small) {
    const other = large.get(term);
    if (other) dot += freq * other;
  }
  let magA = 0;
  for (const v of a.values()) magA += v * v;
  let magB = 0;
  for (const v of b.values()) magB += v * v;
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

export class ConsensusSynthesizer {
  /**
   * Executes multiple providers in parallel and synthesises a consensus response.
   *
   * Scoring is a LOCAL, deterministic, dependency-free heuristic computed purely
   * from the responses already collected — it adds NO extra LLM/network calls
   * (an "ask a judge model" step would be exactly the per-request paid/free-tier
   * cost the cost governor is designed to avoid; see the base-knowledge tracker).
   *
   * How it works:
   *   1. Each valid response becomes a term-frequency bag-of-words vector.
   *   2. We compute pairwise cosine similarity across all responses.
   *   3. `agreement` = mean pairwise similarity → `disagreementScore` = 1 - agreement
   *      and `confidence` = 1 - disagreementScore (preserving the documented
   *      relationship on {@link ConsensusResult.confidence}).
   *   4. The returned `content` is the MEDOID — the response with the highest
   *      total similarity to the others, i.e. the answer the council most agrees
   *      with. This replaces the old "pick the longest" rule, which rewarded
   *      verbosity rather than consensus.
   *
   * HONEST LIMITATIONS (this is still a heuristic, not semantic understanding):
   *   - Bag-of-words cosine measures lexical/token overlap, not meaning. Two
   *     responses that agree using different vocabulary will score as
   *     disagreeing; two that share boilerplate but differ in substance will
   *     score as agreeing. It is a genuine, meaningful improvement over
   *     comparing string lengths — not a semantic judge.
   *   - Medoid selection favours the majority answer. When two short responses
   *     agree and one longer response is more complete, the medoid is one of the
   *     short ones — that is what "consensus" means here, at the cost of
   *     occasionally dropping detail. This is deliberate and documented.
   *   - True embedding similarity would require an embedding-model call per
   *     response, which would reintroduce the cost-governance conflict, so it is
   *     intentionally NOT used here.
   */
  public static async executeCouncilMode(
    prompt: string,
    estimatedTokens: number,
    providers: LLMProvider[],
    schema?: any
  ): Promise<ConsensusResult> {

    // Execute all providers in parallel (limited by network/threads)
    const promises = providers.map(p => p.generate(prompt, estimatedTokens, schema).catch(e => null));
    const results = await Promise.all(promises);

    const validResults = results.filter((r): r is string => r !== null && r.trim() !== '');

    if (validResults.length === 0) {
      throw new Error('All council providers failed to generate a response.');
    }

    if (validResults.length === 1) {
      // A single corroborating voice carries no consensus signal — keep the
      // established degenerate contract (confidence 0, max disagreement).
      return { content: validResults[0]!, confidence: 0, disagreementScore: 1.0 };
    }

    // Term-frequency vectors for each response, computed once.
    const vectors = validResults.map(termFrequencies);
    const n = vectors.length;

    // Pairwise cosine similarity. Track each response's total similarity to the
    // others so we can pick the medoid (the most-agreed-with answer).
    let similaritySum = 0;
    let pairCount = 0;
    const totalSimilarity = new Array<number>(n).fill(0);

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const sim = cosineSimilarity(vectors[i]!, vectors[j]!);
        similaritySum += sim;
        pairCount++;
        totalSimilarity[i]! += sim;
        totalSimilarity[j]! += sim;
      }
    }

    const meanAgreement = pairCount > 0 ? similaritySum / pairCount : 0;
    const disagreementScore = Math.max(0, Math.min(1, 1 - meanAgreement));
    // Preserve the documented relationship: confidence = 1 - min(disagreement, 1).
    const confidence = Math.max(0, Math.min(1, 1 - disagreementScore));

    // Medoid: the response most similar (on average) to all the others.
    let chosenIdx = 0;
    for (let i = 1; i < n; i++) {
      if (totalSimilarity[i]! > totalSimilarity[chosenIdx]!) chosenIdx = i;
    }

    return {
      content: validResults[chosenIdx]!,
      confidence,
      disagreementScore
    };
  }
}
