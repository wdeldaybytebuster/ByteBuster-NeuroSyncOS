import { MemoryRecord } from './vector';

export class HabituationScorer {
  /**
   * Applies the biological decay formula to rank memories:
   * R_final = R_semantic * (f_access * 1.5) * e^(-(Δt * 0.3))
   * 
   * @param records The initial semantic records (from vector or fallback search)
   * @param currentTime Current timestamp in ms (defaults to Date.now())
   * @returns Re-ranked records sorted by R_final descending
   */
  public static rank(records: MemoryRecord[], currentTime: number = Date.now()): MemoryRecord[] {
    return records.map(record => {
      // Delta T in days
      const daysSinceAccess = Math.max(0, (currentTime - record.last_accessed_at) / (1000 * 60 * 60 * 24));
      
      // f_access: Treat 0 accesses as 1 for base multiplier
      const f_access = Math.max(1, record.access_count);
      
      const r_semantic = record.similarity || 0.1; // Baseline if missing
      
      // Formula
      const decayFactor = Math.exp(-(daysSinceAccess * 0.3));
      const boostFactor = f_access * 1.5;
      
      const r_final = r_semantic * boostFactor * decayFactor;

      return {
        ...record,
        r_final
      };
    }).sort((a, b) => b.r_final - a.r_final);
  }
}
