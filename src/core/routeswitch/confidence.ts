/**
 * Pure, provider-agnostic helpers for turning a stream of per-token confidence
 * values into AgentStop-compatible logprobs and driving a generation loop that
 * can be aborted mid-stream.
 *
 * These are extracted from the llama-cpp adapter specifically so the wiring
 * logic (confidence→logprob conversion, EOG handling, abort handling, maxTokens
 * cutoff) can be unit-tested directly with a fake async generator — there is no
 * real GGUF model in CI, so the adapter's node-llama-cpp assembly is exercised
 * separately (see confidence.test.ts / llama-cpp.test.ts).
 */

/**
 * Convert a token *probability* (0..1, as node-llama-cpp reports it via the
 * `confidence` metadata field of `evaluateWithMetadata`) into a *logprob* (the
 * natural log of the probability).
 *
 * `AgentStopSupervisor` thresholds on logprobs (`thresholdH: -1.0`, i.e. any
 * token less likely than p≈0.37 counts as "low confidence"), so this is the
 * conversion that makes real model confidence line up with the existing,
 * already-unit-tested supervisor contract.
 *
 * p = 1   → 0
 * p = 0.5 → -0.69
 * p → 0   → clamped to ln(1e-10) ≈ -23 (avoids -Infinity)
 */
export function probabilityToLogprob(probability: number): number {
  const EPSILON = 1e-10;
  const p = Math.max(EPSILON, Math.min(1, probability));
  return Math.log(p);
}

export type ConfidenceStreamStopReason = 'eog' | 'maxTokens' | 'aborted' | 'end';

export interface ConfidenceStreamDeps<T> {
  /** True when the given token is an end-of-generation token (EOS/EOT/etc.). */
  isEog: (token: T) => boolean;
  /** Report a token's logprob to the supervisor / stream consumer. */
  onLogprob: (logprob: number) => void;
  /**
   * Whether generation should stop *now*. Checked before and after each token so
   * an abort triggered synchronously inside `onLogprob` (e.g. AgentStop firing)
   * halts the loop on the very next opportunity.
   */
  isAborted: () => boolean;
  /** Hard cap on generated tokens. */
  maxTokens: number;
}

export interface ConfidenceStreamResult<T> {
  tokens: T[];
  aborted: boolean;
  stopReason: ConfidenceStreamStopReason;
}

/**
 * Drive an `evaluateWithMetadata`-style async generator that yields
 * `{ token, confidence }` per step, converting each confidence to a logprob and
 * reporting it, while honouring EOG tokens, an external abort, and a maxTokens
 * cap.
 *
 * Breaking out of the `for await` loop calls the generator's `.return()`, which
 * is what genuinely stops llama.cpp from evaluating any further tokens — that's
 * how an AgentStop abort saves real compute rather than just discarding a
 * response that was already fully generated.
 */
export async function consumeConfidenceStream<T>(
  gen: AsyncGenerator<{ token: T; confidence?: number }, void, unknown>,
  deps: ConfidenceStreamDeps<T>,
): Promise<ConfidenceStreamResult<T>> {
  const tokens: T[] = [];
  let aborted = false;
  let stopReason: ConfidenceStreamStopReason = 'end';

  // Aborted before we even started (signal already tripped).
  if (deps.isAborted()) {
    return { tokens, aborted: true, stopReason: 'aborted' };
  }

  for await (const out of gen) {
    const { token, confidence } = out;

    // An EOG token marks the natural end of the response; don't emit it.
    if (deps.isEog(token)) {
      stopReason = 'eog';
      break;
    }

    if (typeof confidence === 'number') {
      deps.onLogprob(probabilityToLogprob(confidence));
    }

    // The token that pushed the supervisor over its consecutive-low threshold is
    // still a real generated token — keep it, then stop so nothing further is
    // computed.
    tokens.push(token);

    if (deps.isAborted()) {
      aborted = true;
      stopReason = 'aborted';
      break;
    }

    if (tokens.length >= deps.maxTokens) {
      stopReason = 'maxTokens';
      break;
    }
  }

  return { tokens, aborted, stopReason };
}
