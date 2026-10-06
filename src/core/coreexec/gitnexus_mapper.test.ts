import { describe, it, expect, beforeAll, beforeEach, vi, afterEach } from 'vitest';
import { db, initDB } from '../basevault/db';
import { executePlugin } from './worker';
import { CerebroVectorStore } from '../memory/cerebro/vector';
import crypto from 'crypto';

// We will mock RouteSwitchEngine to spy on its generateEmbedding function
import { RouteSwitchEngine } from '../routeswitch/engine';

vi.mock('../routeswitch/engine', () => {
  const RouteSwitchEngine = vi.fn();
  RouteSwitchEngine.prototype.generateEmbedding = vi.fn().mockResolvedValue(new Float32Array(1536).fill(0.42));
  return { RouteSwitchEngine };
});

import child_process from 'child_process';

vi.spyOn(child_process, 'execFile').mockImplementation((...args: any[]) => {
  const cb = args.pop();
  const cmd = args[0];
  const cmdArgs = args[1];
  
  if (cmd === 'npx' && cmdArgs && cmdArgs[0] === 'gitnexus') {
    if (typeof cb === 'function') {
      cb(null, { stdout: 'Mocked AST payload from gitnexus', stderr: '' });
    }
    return {} as any;
  }
  
  // Real implementation for other things or just fail
  if (typeof cb === 'function') {
    cb(new Error('Unexpected command'), '', '');
  }
  return {} as any;
});

describe('Skill A: GitNexus Mapper Fix (TDD)', () => {
  const projectId = crypto.randomUUID();

  beforeAll(() => {
    initDB();
  });

  beforeEach(() => {
    db.prepare('DELETE FROM tasks').run();
    db.prepare('DELETE FROM workflow_runs').run();
    db.prepare('DELETE FROM projects').run();
    db.prepare('DELETE FROM cerebro_memories_vec').run();
    db.prepare('DELETE FROM cerebro_memories_meta').run();

    // Setup dummy project
    db.prepare(`
      INSERT INTO projects (id, name, created_at)
      VALUES (?, ?, ?)
    `).run(projectId, 'Test Project', Date.now());

    vi.clearAllMocks();
  });

  it('asserts that gitnexus_mapper requests a semantic embedding via RouteSwitch instead of cryptographic noise', async () => {
    const runId = crypto.randomUUID();
    const taskId = crypto.randomUUID();

    db.prepare(`
      INSERT INTO workflow_runs (id, project_id, status, dag_layout, created_at)
      VALUES (?, ?, 'running', '[]', ?)
    `).run(runId, projectId, Date.now());

    db.prepare(`
      INSERT INTO tasks (id, run_id, status)
      VALUES (?, ?, 'running')
    `).run(taskId, runId);

    // Spy on CerebroVectorStore.insert to check the embedding that is inserted
    const insertSpy = vi.spyOn(CerebroVectorStore, 'insert');

    const result = await executePlugin({
      taskId,
      plugin: 'gitnexus_mapper',
      params: { query: 'test query' }
    }, projectId, db, CerebroVectorStore);

    expect(result!.status).toBe('success');

    // Assert that RouteSwitchEngine.generateEmbedding was called
    expect(RouteSwitchEngine.prototype.generateEmbedding).toHaveBeenCalledTimes(1);
    expect(RouteSwitchEngine.prototype.generateEmbedding).toHaveBeenCalledWith('Mocked AST payload from gitnexus');

    // Assert that the semantic embedding returned by RouteSwitch was inserted, 
    // NOT the cryptographic noise!
    expect(insertSpy).toHaveBeenCalledTimes(1);
    const insertedEmbedding = insertSpy.mock.calls[0]![2]; // 3rd argument is the embedding
    expect(insertedEmbedding).toBeDefined();
    expect(insertedEmbedding![0]).toBeCloseTo(0.42, 2); // It should match our mocked semantic API return
  });
});
