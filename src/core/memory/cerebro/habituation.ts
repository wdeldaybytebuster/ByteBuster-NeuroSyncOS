import { MemoryRecord } from './vector';

/** Default decay-rate coefficient (Δt multiplier) in the biological decay formula. */
export const DEFAULT_DECAY_RATE = 0.3;
/** Default access-count boost multiplier in the biological decay formula. */
export const DEFAULT_ACCESS_BOOST = 1.5;

/**
 * Pure decay-factor function: e^(-(daysSinceAccess * decayRate)).
 * Shared by HabituationScorer.rank and the server-side decay-stats/prune
 * routes so there is a single source of truth for the formula.
 */
export function computeDecayFactor(daysSinceAccess: number, decayRate: number = DEFAULT_DECAY_RATE): number {
  return Math.exp(-(daysSinceAccess * decayRate));
}

export class HabituationScorer {
  /**
   * Applies the biological decay formula to rank memories:
   * R_final = R_semantic * (f_access * boostMultiplier) * e^(-(Δt * decayRate))
   *
   * @param records The initial semantic records (from vector or fallback search)
   * @param currentTime Current timestamp in ms (defaults to Date.now())
   * @param decayRate Δt multiplier in the decay exponent (defaults to DEFAULT_DECAY_RATE)
   * @param boostMultiplier Access-count boost multiplier (defaults to DEFAULT_ACCESS_BOOST)
   * @returns Re-ranked records sorted by R_final descending
   */
  public static rank(
    records: MemoryRecord[],
    currentTime: number = Date.now(),
    decayRate: number = DEFAULT_DECAY_RATE,
    boostMultiplier: number = DEFAULT_ACCESS_BOOST
  ): MemoryRecord[] {
    return records.map(record => {
      // Delta T in days
      const daysSinceAccess = Math.max(0, (currentTime - record.last_accessed_at) / (1000 * 60 * 60 * 24));

      // f_access: Treat 0 accesses as 1 for base multiplier
      const f_access = Math.max(1, record.access_count);

      const r_semantic = record.similarity || 0.1; // Baseline if missing

      // Formula
      const decayFactor = computeDecayFactor(daysSinceAccess, decayRate);
      const boostFactor = f_access * boostMultiplier;

      const r_final = r_semantic * boostFactor * decayFactor;

      return {
        ...record,
        r_final
      };
    }).sort((a, b) => b.r_final - a.r_final);
  }
}
