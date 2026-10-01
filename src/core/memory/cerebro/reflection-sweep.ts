import { db, initDB } from '../../basevault/db';
import { CerebroVectorStore } from './vector';
import { HabituationScorer } from './habituation';
import crypto from 'crypto';

export interface CerebroWorkerInput {
  historyToProcess?: string[];
  extractedFacts?: string[];
  classifications?: { fact: string, existingContent: string, classification: 'duplicate' | 'update' | 'unrelated' }[];
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
          db.prepare(`
            INSERT INTO cerebro_learning_approvals (id, fact, confidence, status, source_run_id, created_at, conflict_with_id, conflict_reasoning)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `).run(crypto.randomUUID(), fact, 0.6, 'pending', null, Date.now(), conflictId, conflictReasoning);
        }
      }

      if (!skip) {
        CerebroVectorStore.insert(fact, 'preference');
      }
    }
  }

  // Habituation scoring sweep
  const allMemoriesRaw = db.prepare('SELECT id, content, type, last_accessed_at, access_count FROM cerebro_memories_meta').all() as any[];
  // Attach dummy similarity to use HabituationScorer (similarity isn't used for pruning typically, just ranking)
  const allMemories = allMemoriesRaw.map(m => ({ ...m, similarity: 1.0, embedding: new Float32Array() }));
  
  if (allMemories.length > 0) {
    const ranked = HabituationScorer.rank(allMemories, Date.now()) as (typeof allMemories[0] & { r_final: number })[];
    // Prune memories with very low R_final (e.g. below 0.05)
    const PRUNE_THRESHOLD = 0.05;
    for (const mem of ranked) {
      if (mem.r_final < PRUNE_THRESHOLD) {
        db.prepare('DELETE FROM cerebro_memories_meta WHERE id = ?').run(mem.id);
        db.prepare('DELETE FROM cerebro_memories_vec WHERE id = ?').run(mem.id);
      }
    }
  }

  // Pruning stale facts (e.g. older than 30 days and rarely accessed)
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
  const staleThreshold = Date.now() - THIRTY_DAYS_MS;

  const pruneStmt = db.prepare(`
    DELETE FROM cerebro_memories_meta 
    WHERE last_accessed_at < ? AND access_count < 5
  `);
  const pruneInfo = pruneStmt.run(staleThreshold);
  
  if (pruneInfo.changes > 0) {
    // Also clean up vectors for pruned metadata
    const cleanupVecStmt = db.prepare(`
      DELETE FROM cerebro_memories_vec 
      WHERE id NOT IN (SELECT id FROM cerebro_memories_meta)
    `);
    cleanupVecStmt.run();
  }

  // Decay access counts slightly over time to simulate "forgetting" unused facts
  const decayStmt = db.prepare(`
    UPDATE cerebro_memories_meta 
    SET access_count = max(0, access_count - 1)
  `);
  decayStmt.run();
}
