import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { db, initDB } from '../basevault/db';
import { executePlugin } from './worker';
import { CerebroVectorStore } from '../memory/cerebro/vector';
import crypto from 'crypto';
import { RouteSwitchEngine } from '../routeswitch/engine';

vi.mock('../routeswitch/engine', () => {
  const RouteSwitchEngine = vi.fn();
  // The schema_patcher plugin calls routeSwitch.execute(...) (the scoped
  // RouteSwitchEngine API), so the test double must stub `execute` — not the
  // lower-level `generate` it replaced.
  RouteSwitchEngine.prototype.execute = vi.fn().mockResolvedValue({
    content: '// Auto-generated patch Draft\n// Applies delta: repository.owner.login -> repository.owner.name\nfunction parse(data) {\n  return data.repository.owner.name;\n}',
    provider: 'mock-provider',
    tokensUsed: 100
  });
  return { RouteSwitchEngine };
});

describe('Skill C: Circuit Breaker Auto-Patcher (TDD)', () => {
  const projectId = crypto.randomUUID();

  beforeAll(() => {
    initDB();
  });

  beforeEach(() => {
    db.prepare('DELETE FROM tasks').run();
    db.prepare('DELETE FROM workflow_runs').run();
    db.prepare('DELETE FROM projects').run();
    db.prepare('DELETE FROM os_todos').run();

    // Setup dummy project
    db.prepare(`
      INSERT INTO projects (id, name, created_at)
      VALUES (?, ?, ?)
    `).run(projectId, 'Test Project', Date.now());

    vi.clearAllMocks();
  });

  it('Schema Patcher: correctly parses synthetic error trace, creates patch, and queues os_todos ticket for user review', async () => {
    const runId = crypto.randomUUID();
    const taskId = crypto.randomUUID();
    
    // Synthetic error trace representing a tripped Schema Drift Circuit Breaker
    const syntheticErrorTrace = {
      apiName: 'GitHub API v4',
      error: 'Field "repository.owner.login" is deprecated',
      delta: 'repository.owner.login -> repository.owner.name',
    };

    db.prepare(`
      INSERT INTO workflow_runs (id, project_id, status, dag_layout, created_at)
      VALUES (?, ?, 'running', '[]', ?)
    `).run(runId, projectId, Date.now());

    db.prepare(`
      INSERT INTO tasks (id, run_id, status)
      VALUES (?, ?, 'running')
    `).run(taskId, runId);

    const result = await executePlugin({
      taskId,
      plugin: 'schema_patcher',
      params: { 
        errorTrace: syntheticErrorTrace
      }
    }, projectId, db, CerebroVectorStore);

    expect(result).not.toBeNull();
    expect(result!.status).toBe('success');
    expect(result!.stdout).toContain('Schema patch drafted and queued for review.');

    // Assert an os_todos ticket was created
    const todos = db.prepare(`SELECT * FROM os_todos WHERE project_id = ?`).all(projectId) as any[];
    expect(todos.length).toBe(1);
    
    const todo = todos[0];
    expect(todo.source_module).toBe('CoreExec');
    expect(todo.severity).toBe('high');
    expect(todo.escalation_reason).toBe('Schema Drift Circuit Breaker Tripped');
    expect(todo.required_action_type).toBe('REVIEW');
    
    // The todo context payload should contain references to the patch and error
    const context = JSON.parse(todo.context_payload);
    expect(context.action).toBe('REVIEW_SCHEMA_PATCH');
    expect(context.errorTrace).toEqual(syntheticErrorTrace);
    expect(context.draftPatch).toBeDefined();
    // The draft patch should mention the delta
    expect(context.draftPatch).toContain('repository.owner.name');
    
    // Assert patch file was generated in the workspace
    expect(context.patchFile).toBeDefined();
    const fs = require('fs');
    const fileExists = fs.existsSync(context.patchFile);
    expect(fileExists).toBe(true);

    // Clean up
    if (fileExists) {
      fs.unlinkSync(context.patchFile);
    }
  });
});
