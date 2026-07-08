import { describe, it, expect, beforeEach } from 'vitest';
import { db, initDB } from '../../basevault/db';
import { ReflectionExecutor } from './reflection';
import { CerebroVectorStore } from './vector';

describe('ReflectionExecutor', () => {
  beforeEach(() => {
    initDB();
    db.prepare('DELETE FROM cerebro_memories_meta').run();
    db.prepare('DELETE FROM cerebro_memories_vec').run();
    db.prepare('DELETE FROM cerebro_learning_approvals').run();
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

    const pending = db.prepare("SELECT * FROM cerebro_learning_approvals WHERE status = 'pending'").all();
    expect(pending).toHaveLength(0); // exact duplicate never creates a pending approval either
  });

  it('should queue a genuinely different-but-similar fact as a pending approval instead of silently dropping it', async () => {
    // Seed an existing memory that shares many tokens with (but is not
    // text-identical to) the fact the keyword-fallback extractor will produce
    // for a "dark mode" mention, so keyword-fallback similarity search returns
    // similarity > 0.85 while the two strings are NOT exactly equal.
    const existingContent = 'User prefers dark mode UI elements as their primary interface theme.';
    const existingId = CerebroVectorStore.insert(existingContent, 'preference');

    const history = ['User: I like dark mode.'];

    await ReflectionExecutor.runReflectionCycle(history);

    // The new (similar-but-not-identical) fact must NOT be inserted directly
    // into cerebro_memories_meta -- only the pre-seeded memory should exist.
    const memRows = db.prepare("SELECT * FROM cerebro_memories_meta WHERE type = 'preference'").all() as any[];
    expect(memRows).toHaveLength(1);
    expect(memRows[0].id).toBe(existingId);

    // Instead, a pending learning-approval row should have been created,
    // flagged as conflicting with the pre-seeded memory.
    const pending = db.prepare("SELECT * FROM cerebro_learning_approvals WHERE status = 'pending'").all() as any[];
    expect(pending).toHaveLength(1);
    expect(pending[0].fact).toBe('User prefers dark mode UI elements.');
    expect(pending[0].conflict_with_id).toBe(existingId);
    expect(typeof pending[0].conflict_reasoning).toBe('string');
    expect(pending[0].conflict_reasoning).toContain(existingContent);
  });
});
