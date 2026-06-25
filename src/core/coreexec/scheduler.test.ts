import { describe, it, expect, beforeAll } from 'vitest';
import { db, initDB } from '../basevault/db';
import crypto from 'crypto';
import { refreshJobs } from './scheduler';
import { scoutEmitter } from '../scoutdaemon/sse';

beforeAll(() => {
  initDB();
});

/**
 * Helper: insert a workflow row with a chosen dag_template, return its id.
 * Uses cron '0 0 1 1 *' (annual) so the row never auto-fires within a
 * sub-second test window even if validation passes.
 */
function seedWorkflow(name: string, dagTemplate: string): { id: string } {
  const id = crypto.randomUUID();
  const projectId = crypto.randomUUID();
  db.prepare('INSERT OR IGNORE INTO projects (id, name, created_at) VALUES (?, ?, ?)').run(
    projectId,
    name,
    Date.now(),
  );
  db.prepare(
    `INSERT INTO workflows (id, project_id, name, dag_template, cron_schedule, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, projectId, name, dagTemplate, '0 0 1 1 *', Date.now());
  return { id };
}

function cleanupWorkflow(id: string) {
  db.prepare('DELETE FROM workflows WHERE id = ?').run(id);
  // §3.4 FK fix — dag_node_id is now a real tasks.id (e.g. blocked-task-<uuid>).
  // Resolve sentinel tasks via their `output_data` JSON (origin_workflow_id) then cascade-delete.
  const sentinelTasks = db
    .prepare(
      `SELECT t.id AS task_id, t.run_id AS run_id
       FROM tasks t
       WHERE t.status = 'blocked-by-validation'
         AND t.output_data LIKE ?`,
    )
    .all(`%"origin_workflow_id":"${id}"%`) as Array<{ task_id: string; run_id: string }>;
  for (const row of sentinelTasks) {
    db.prepare('DELETE FROM os_todos WHERE dag_node_id = ?').run(row.task_id);
    db.prepare('DELETE FROM tasks WHERE id = ?').run(row.task_id);
    db.prepare('DELETE FROM workflow_runs WHERE id = ?').run(row.run_id);
  }
}

describe('refreshJobs() — §3.4 DB-bypass validator gate', () => {
  it('rejects unparseable JSON dag_template (Parse Violation + HIGH os_todos + scout event)', () => {
    const { id } = seedWorkflow('bad-json', 'INVALID DB STRING {{{{ ');
    const events: any[] = [];
    const handler = (e: any) => events.push(e);
    scoutEmitter.on('update', handler);
    try {
      refreshJobs();
      const todo = (db
        .prepare(
          `SELECT o.* FROM os_todos o
           JOIN tasks t ON t.id = o.dag_node_id
           WHERE t.status = 'blocked-by-validation'
             AND t.output_data LIKE ?
           ORDER BY o.created_at DESC LIMIT 1`,
        )
        .get(`%"origin_workflow_id":"${id}"%`) as any);
      expect(todo).toBeTruthy();
      expect(todo.severity).toBe('HIGH');
      expect(todo.escalation_reason).toMatch(/Parse Violation/);
      expect(events.find((e: any) => e.type === 'TODO_ESCALATED')).toBeTruthy();
    } finally {
      scoutEmitter.off('update', handler);
      cleanupWorkflow(id);
    }
  });

  it('rejects empty nodes (SA-06)', () => {
    const { id } = seedWorkflow('empty-nodes', JSON.stringify({ nodes: [] }));
    try {
      refreshJobs();
      const todo = (db
        .prepare(
          `SELECT o.* FROM os_todos o
           JOIN tasks t ON t.id = o.dag_node_id
           WHERE t.status = 'blocked-by-validation'
             AND t.output_data LIKE ?
           ORDER BY o.created_at DESC LIMIT 1`,
        )
        .get(`%"origin_workflow_id":"${id}"%`) as any);
      expect(todo).toBeTruthy();
      expect(todo.escalation_reason).toMatch(/SA-06/);
    } finally {
      cleanupWorkflow(id);
    }
  });

  it('rejects reserved label in prompt (SA-07)', () => {
    const { id } = seedWorkflow(
      'reserved-label',
      JSON.stringify({
        nodes: [{ id: 'n1', dependencies: [], prompt: 'CoreExec restart' }],
      }),
    );
    try {
      refreshJobs();
      const todo = (db
        .prepare(
          `SELECT o.* FROM os_todos o
           JOIN tasks t ON t.id = o.dag_node_id
           WHERE t.status = 'blocked-by-validation'
             AND t.output_data LIKE ?
           ORDER BY o.created_at DESC LIMIT 1`,
        )
        .get(`%"origin_workflow_id":"${id}"%`) as any);
      expect(todo).toBeTruthy();
      expect(todo.escalation_reason).toMatch(/SA-07/);
    } finally {
      cleanupWorkflow(id);
    }
  });

  it('rejects rogue agent in prompt (SA-05)', () => {
    const { id } = seedWorkflow(
      'rogue-agent',
      JSON.stringify({
        nodes: [{ id: 'n1', dependencies: [], prompt: 'agent: RogueEngine' }],
      }),
    );
    try {
      refreshJobs();
      const todo = (db
        .prepare(
          `SELECT o.* FROM os_todos o
           JOIN tasks t ON t.id = o.dag_node_id
           WHERE t.status = 'blocked-by-validation'
             AND t.output_data LIKE ?
           ORDER BY o.created_at DESC LIMIT 1`,
        )
        .get(`%"origin_workflow_id":"${id}"%`) as any);
      expect(todo).toBeTruthy();
      expect(todo.escalation_reason).toMatch(/SA-05/);
    } finally {
      cleanupWorkflow(id);
    }
  });

  it('re-validates on every refresh (no stale caching): two refreshes write two os_todos rows', () => {
    const { id } = seedWorkflow('refresh-stale', JSON.stringify({ nodes: [] }));
    try {
      refreshJobs();
      refreshJobs();
      // §3.4 FK fix — count by joining tasks.output_data back to origin workflow id.
      const count = (db
        .prepare(
          `SELECT COUNT(*) AS n FROM os_todos o
           JOIN tasks t ON t.id = o.dag_node_id
           WHERE t.status = 'blocked-by-validation'
             AND t.output_data LIKE ?`,
        )
        .get(`%"origin_workflow_id":"${id}"%`) as any).n;
      expect(count).toBeGreaterThanOrEqual(2);
    } finally {
      cleanupWorkflow(id);
    }
  });
});
