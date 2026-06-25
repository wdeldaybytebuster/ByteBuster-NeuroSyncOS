import { describe, it, expect, beforeEach } from 'vitest';
import { db, initDB } from '../../basevault/db';
import { ReflectionExecutor } from './reflection';

describe('ReflectionExecutor', () => {
  beforeEach(() => {
    initDB();
    db.prepare('DELETE FROM cerebro_memories_meta').run();
    db.prepare('DELETE FROM cerebro_memories_vec').run();
  });

  it('should parse mock chat history and insert new preference', async () => {
    const history = [
      'User: I want a workflow to scrape data.',
      'User: No, do not use Python. I prefer Node.js for everything.'
    ];

    await ReflectionExecutor.runReflectionCycle(history);

    const rows = db.prepare("SELECT * FROM cerebro_memories_meta WHERE type = 'preference'").all() as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0].content).toContain('User strongly prefers Node.js');
  });

  it('should prevent semantic drift by ignoring duplicates', async () => {
    const history = [
      'User: I prefer Node.js for everything.'
    ];

    // First cycle inserts the fact
    await ReflectionExecutor.runReflectionCycle(history);
    
    // Second cycle should ignore it
    await ReflectionExecutor.runReflectionCycle(history);

    const rows = db.prepare("SELECT * FROM cerebro_memories_meta WHERE type = 'preference'").all();
    expect(rows).toHaveLength(1); // Still 1, did not duplicate
  });
});
