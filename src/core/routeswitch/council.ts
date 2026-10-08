import { LLMProvider } from './providers';
import type { GenerationStreamHooks } from './providers';

export interface ConsensusResult {
  content: string;
  /** Numeric confidence, 0.0-1.0. Derived from disagreementScore as 1 - min(disagreementScore, 1). */
  confidence: number;
  disagreementScore: number;
}

/**
 * P2-B1 — council-level deadline (default 60 s, `COUNCIL_TIMEOUT_MS` override).
 *
 * Derivation: a single provider leg is budgeted 30 s (OPENAI_COMPAT_TIMEOUT_MS,
 * openai-compatible.ts:51-52). A hung council of 3 legs would worst-case burn
 * 90 s (the min worst-case sum; 5 legs = 150 s upper bound) with NO bound at
 * all before this change — executeCouncilMode awaited Promise.all forever.
 * 60 s sits above one 30 s leg (a single slow-but-alive leg never trips the
 * council) and below the 90 s min worst-case sum (a fully-hung council always
 * resolves first). Env override lets constrained hardware (Axiom 6) tighten it.
 */
export const DEFAULT_COUNCIL_TIMEOUT_MS = 60_000;

function resolveCouncilTimeoutMs(): number {
  const n = Number(process.env.COUNCIL_TIMEOUT_MS);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_COUNCIL_TIMEOUT_MS;
}

/**
 * Link several signals into one (mirrors combineSignals,
 * openai-compatible.ts:82-98 — the engine keeps AbortController ownership,
 * derivatives never create competing controllers except for this fallback).
 */
function anySignals(signals: AbortSignal[]): AbortSignal {
  const anyFn = (AbortSignal as unknown as { any?: (s: AbortSignal[]) => AbortSignal }).any;
  if (typeof anyFn === 'function') return anyFn.call(AbortSignal, signals);
  const controller = new AbortController();
  const forward = (): void => {
    try {
      const culprit = signals.find((s) => s.aborted);
      controller.abort(culprit ? culprit.reason : undefined);
    } catch { /* already aborted */ }
  };
  if (signals.some((s) => s.aborted)) forward();
  else for (const s of signals) s.addEventListener('abort', forward, { once: true });
  return controller.signal;
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
    schema?: any,
    hooks?: GenerationStreamHooks,
  ): Promise<ConsensusResult> {

    // P2-B1 — two-layer bound. Layer 1 (per-leg signals): every leg derives
    // its signal from the council controller + its own timeout + the caller's
    // hooks.signal, so providers that honour abort (openai-compatible via
    // combineSignals, llama-cpp via its streaming isAborted plumbing) stop
    // burning budget the instant the council is done with them. Layer 2
    // (Promise.race): bounds how long the CALLER waits even for providers
    // that IGNORE abort — a race alone would leak the loser legs (abandoned
    // promises keep burning inference), so the deadline ALSO aborts the
    // council controller; the race is just how we stop waiting.
    const timeoutMs = resolveCouncilTimeoutMs();
    const councilController = new AbortController();
    const legSignals = providers.map(() => {
      const parts: AbortSignal[] = [councilController.signal, AbortSignal.timeout(timeoutMs)];
      if (hooks?.signal) parts.push(hooks.signal);
      return anySignals(parts);
    });

    // Settle markers let the deadline salvage legs that finished before it
    // fired, instead of discarding a mostly-complete council.
    const settled: Array<{ done: boolean; value: string | null }> =
      providers.map(() => ({ done: false, value: null }));
    const legPromises = providers.map((p, i) => {
      const legHooks: GenerationStreamHooks = { signal: legSignals[i]! };
      if (hooks?.onTokenConfidence) legHooks.onTokenConfidence = hooks.onTokenConfidence;
      return p.generate(prompt, estimatedTokens, schema, legHooks).then(
        (r) => {
          settled[i] = { done: true, value: r };
          return r;
        },
        () => {
          settled[i] = { done: true, value: null };
          return null;
        },
      );
    });
    const fanout = Promise.all(legPromises);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<'timed-out'>((resolve) => {
      timer = setTimeout(() => {
        councilController.abort(new Error(`Council deadline exceeded after ${timeoutMs}ms`));
        resolve('timed-out');
      }, timeoutMs);
    });
    const raced = await Promise.race([fanout.then(() => 'settled' as const), deadline]);
    if (timer !== undefined) clearTimeout(timer);

    const results: Array<string | null> = raced === 'settled'
      ? await fanout
      : settled.filter((s) => s.done).map((s) => s.value);

    const validResults = results.filter((r): r is string => r !== null && r.trim() !== '');

    if (validResults.length === 0) {
      throw new Error(
        raced === 'settled'
          ? 'All council providers failed to generate a response.'
          : `Council deadline exceeded after ${timeoutMs}ms with no usable leg result.`,
      );
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
