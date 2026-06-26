import { parentPort } from 'worker_threads';
import { db } from './db';
import { ReflectionExecutor } from '../memory/cerebro/reflection';

if (parentPort) {
  parentPort.on('message', async (msg) => {
    if (msg.type === 'run_reflection') {
      try {
        console.log('Reflection Worker: Starting consolidation and habituation scoring...');
        
        // 1. Memory consolidation (existing logic)
        await ReflectionExecutor.runReflectionCycle(msg.payload?.mockChatHistory);

        // 2. Habituation Scoring (pruning stale facts, decaying access counts)
        const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
        const now = Date.now();
        const staleThreshold = now - THIRTY_DAYS_MS;

        // Pruning stale facts (e.g. older than 30 days and rarely accessed)
        const pruneStmt = db.prepare(`
          DELETE FROM cerebro_memories_meta 
          WHERE last_accessed_at < ? AND access_count < 5
        `);
        const pruneInfo = pruneStmt.run(staleThreshold);
        
        if (pruneInfo.changes > 0) {
          console.log(`Reflection Worker: Pruned ${pruneInfo.changes} stale memories.`);
          
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

        parentPort?.postMessage({ type: 'reflection_done', pruned: pruneInfo.changes });
      } catch (err: any) {
        console.error('Reflection Worker Error:', err);
        parentPort?.postMessage({ type: 'reflection_error', error: err.message });
      }
    }
  });
}
