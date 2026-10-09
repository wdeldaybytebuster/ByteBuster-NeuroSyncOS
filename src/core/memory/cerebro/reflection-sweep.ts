import { initDB } from '../../basevault/db';
import { CerebroVectorStore } from './vector';
import { HabituationScorer } from './habituation';
import crypto from 'crypto';
// §5 / Phase F-6 — every write in this sweep (approvals INSERT, prune
// DELETEs, vector cleanup) routes through the single-writer queue; the
// habituation SELECT sits on a read-only handle. On a worker thread the
// ops post to the main-thread sink in FIFO order; test mode runs the
// sweep inline on the main thread, where the sink applies locally.
import { openReadonlyHandle, postWriteOpOrThrow } from '../../basevault/write-queue';

export interface CerebroWorkerInput {
  historyToProcess?: string[];
  extractedFacts?: string[];
  classifications?: { fact: string, existingContent: string, classification: 'duplicate' | 'update' | 'unrelated' }[];
  source_tool?: string;
}

export async function runReflectionSweep(input: CerebroWorkerInput) {
  initDB();
  
  if (input.extractedFacts) {
    for (const fact of input.extractedFacts) {
      const existing = CerebroVectorStore.search(fact, 'preference', undefined, 1);
      let skip = false;
      
      if (existing.length > 0 && existing[0]!.similarity! > 0.85) {
        const classificationMatch = input.classifications?.find(c => c.fact === fact && c.existingContent === existing[0]!.content);
        const classification = classificationMatch ? classificationMatch.classification : (fact.trim().toLowerCase() === existing[0]!.content.trim().toLowerCase() ? 'duplicate' : 'update');
        
        if (classification === 'duplicate') {
          skip = true;
        } else if (classification === 'update') {
          skip = true;
          const conflictId = existing[0]!.id;
          const conflictReasoning = `Possibly contradicts or updates an existing memory: "${existing[0]!.content}"`;
          // §5 / Phase F-6 — conflict approval routed through the write queue
          // (was: db.prepare(INSERT INTO cerebro_learning_approvals...).run()).
          postWriteOpOrThrow({
            kind: 'learning_approval_insert',
            id: crypto.randomUUID(),
            fact,
            confidence: 0.6,
            conflictWithId: conflictId,
            conflictReasoning,
            sourceTool: input.source_tool || null,
          });
        }
      }

      if (!skip) {
        CerebroVectorStore.insert(fact, 'preference', undefined, null, false, input.source_tool);
      }
    }
  }

  // Habituation scoring sweep — the ranking SELECT runs on the read-only
  // handle (§5 precondition 3 discipline); only the DELETEs are writes.
  const readDb = openReadonlyHandle();
  const allMemoriesRaw = readDb.prepare('SELECT id, content, type, last_accessed_at, access_count FROM cerebro_memories_meta').all() as any[];
  // Attach dummy similarity to use HabituationScorer (similarity isn't used for pruning typically, just ranking)
  const allMemories = allMemoriesRaw.map(m => ({ ...m, similarity: 1.0, embedding: new Float32Array() }));
  
  if (allMemories.length > 0) {
    const ranked = HabituationScorer.rank(allMemories, Date.now()) as (typeof allMemories[0] & { r_final: number })[];
    // Prune memories with very low R_final (e.g. below 0.05)
    const PRUNE_THRESHOLD = 0.05;
    for (const mem of ranked) {
      if (mem.r_final < PRUNE_THRESHOLD) {
        // §5 / Phase F-6 — one memory_delete op covers BOTH former
        // statements (meta DELETE at :55 + vec DELETE at :56); the sink
        // deletes meta then vec inside the op (was: two db.prepare().run()).
        postWriteOpOrThrow({ kind: 'memory_delete', id: mem.id });
      }
    }
  }

  // Pruning stale facts (e.g. older than 30 days and rarely accessed)
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
  const staleThreshold = Date.now() - THIRTY_DAYS_MS;
  const PRUNE_MIN_ACCESS = 5;
  // §5 / Phase F-6 — stale-facts prune routed through the write queue.
  // minAccess stays 5 — the sweep's existing hardcoded predicate rides
  // along in the op so behavior is byte-identical (was: pruneStmt.run()).
  postWriteOpOrThrow({ kind: 'prune_stale', staleThreshold, minAccess: PRUNE_MIN_ACCESS });

  // The vec cleanup formerly re-ran only when pruneInfo.changes > 0; the
  // sink-side vec_cleanup_orphans op is an idempotent orphan sweep, so it
  // posts unconditionally — same end state, no lost bookkeeping.
  postWriteOpOrThrow({ kind: 'vec_cleanup_orphans' });

}
