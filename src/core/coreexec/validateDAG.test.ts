import { describe, it, expect, beforeAll, vi } from 'vitest';
import { db, initDB } from '../basevault/db';
import { validateDAGTemplate, validateDAGProposal, escalateBlockedDAGToOsTodos } from './validateDAG';
import { scoutEmitter } from '../scoutdaemon/sse';

beforeAll(() => {
  initDB();
});

describe('validateDAGTemplate() — §3.4 cron-path structural + semantic gate', () => {
  it('returns SA-06 error for empty string', async () => {

    const result = validateDAGTemplate('');
    expect(result.error).toMatch(/SA-06/);
    expect(result.proposal).toBeNull();
  });

  it('returns SA-06 error for whitespace-only string', async () => {

    const result = validateDAGTemplate('   \n\t  ');
    expect(result.error).toMatch(/SA-06/);
    expect(result.proposal).toBeNull();
  });

  it('returns Parse Violation error for non-JSON string', async () => {

    const result = validateDAGTemplate('NOT JSON {{{');
    expect(result.error).toMatch(/Parse Violation/);
    expect(result.proposal).toBeNull();
  });

  it('returns SA-06 error for JSON without nodes array', async () => {

    const result = validateDAGTemplate(JSON.stringify({ hello: 'world' }));
    expect(result.error).toMatch(/SA-06/);
    expect(result.proposal).toBeNull();
  });

  it('returns SA-06 error for JSON with empty nodes', async () => {

    const result = validateDAGTemplate(JSON.stringify({ nodes: [] }));
    expect(result.error).toMatch(/SA-06/);
    expect(result.proposal).toBeNull();
  });

  it('returns SA-07 error for a valid DAG that uses a reserved label', async () => {

    const result = validateDAGTemplate(
      JSON.stringify({
        nodes: [{ id: 'n1', dependencies: [], prompt: 'CoreExec restart' }],
      }),
    );
    expect(result.error).toMatch(/SA-07/);
    expect(result.proposal).toBeTruthy();
  });

  it('returns SA-05 error for a valid DAG that uses a rogue agent', async () => {

    const result = validateDAGTemplate(
      JSON.stringify({
        nodes: [{ id: 'n1', dependencies: [], prompt: 'agent: RogueEngine' }],
      }),
    );
    expect(result.error).toMatch(/SA-05/);
  });

  it('returns null error for a clean valid DAG', async () => {

    const result = validateDAGTemplate(
      JSON.stringify({
        nodes: [{ id: 'n1', dependencies: [], prompt: 'fetch the weather' }],
      }),
    );
    expect(result.error).toBeNull();
    expect(result.proposal?.nodes).toHaveLength(1);
  });
});

describe('validateDAGProposal() — §3.4 approve-path object gate', () => {
  it('returns SA-06 for null input', async () => {

    const result = validateDAGProposal(null);
    expect(result.error).toMatch(/SA-06/);
  });

  it('returns SA-06 for non-object input', async () => {

    expect(validateDAGProposal('a string').error).toMatch(/SA-06/);
    expect(validateDAGProposal(42).error).toMatch(/SA-06/);
    expect(validateDAGProposal(undefined).error).toMatch(/SA-06/);
  });

  it('returns SA-06 for object without nodes array', async () => {

    const result = validateDAGProposal({ id: 'x' });
    expect(result.error).toMatch(/SA-06/);
  });

  it('returns null for a proposal with a clean node', async () => {

    const result = validateDAGProposal({
      nodes: [{ id: 'n1', dependencies: [], prompt: 'fetch the weather' }],
    });
    expect(result.error).toBeNull();
  });
});

describe('escalateBlockedDAGToOsTodos() — §3.4 FK-satisfying escalation', () => {
  it('writes a workflow_runs + tasks + os_todos triple that satisfies all FKs', async () => {


    const beforeRuns = (db.prepare('SELECT COUNT(*) AS n FROM workflow_runs').get() as any).n;
    const beforeTasks = (db.prepare('SELECT COUNT(*) AS n FROM tasks').get() as any).n;
    const beforeTodos = (db.prepare('SELECT COUNT(*) AS n FROM os_todos').get() as any).n;

    const result = escalateBlockedDAGToOsTodos(
      'wf-test-' + Date.now(),
      'SA-07 Violation: reserved label',
      'scheduler',
    );

    expect(result.todoId).toBeTruthy();
    expect(result.sentinelTaskId).toMatch(/^blocked-task-/);
    expect(result.runId).toMatch(/^blocked-run-/);

    // Sentinel task EXISTS in tasks (so the FK targets a real row).
    const taskRow = db.prepare('SELECT * FROM tasks WHERE id = ?').get(result.sentinelTaskId);
    expect(taskRow).toBeTruthy();
    expect((taskRow as any).status).toBe('blocked-by-validation');

    // Sentinel run EXISTS in workflow_runs.
    const runRow = db.prepare('SELECT * FROM workflow_runs WHERE id = ?').get(result.runId);
    expect(runRow).toBeTruthy();

    // os_todos row references the task as dag_node_id.
    const todoRow = db.prepare('SELECT * FROM os_todos WHERE id = ?').get(result.todoId);
    expect(todoRow).toBeTruthy();
    expect((todoRow as any).dag_node_id).toBe(result.sentinelTaskId);
    expect((todoRow as any).severity).toBe('HIGH');

    const afterRuns = (db.prepare('SELECT COUNT(*) AS n FROM workflow_runs').get() as any).n;
    const afterTasks = (db.prepare('SELECT COUNT(*) AS n FROM tasks').get() as any).n;
    const afterTodos = (db.prepare('SELECT COUNT(*) AS n FROM os_todos').get() as any).n;
    expect(afterRuns - beforeRuns).toBe(1);
    expect(afterTasks - beforeTasks).toBe(1);
    expect(afterTodos - beforeTodos).toBe(1);

    // Cleanup.
    db.prepare('DELETE FROM os_todos WHERE id = ?').run(result.todoId);
    db.prepare('DELETE FROM tasks WHERE id = ?').run(result.sentinelTaskId);
    db.prepare('DELETE FROM workflow_runs WHERE id = ?').run(result.runId);
  });

  it('emits a TODO_ESCALATED scout event with origin and workflowId', async () => {


    const events: any[] = [];
    const handler = (e: any) => events.push(e);
    scoutEmitter.on('update', handler);
    try {
      const workflowId = 'wf-scout-test-' + Date.now();
      const result = escalateBlockedDAGToOsTodos(
        workflowId,
        'SA-06 Violation: empty nodes',
        'approve-route',
      );
      const scoped = events.filter((e: any) => e.workflowId === workflowId);
      expect(scoped).toHaveLength(1);
      expect(scoped[0].type).toBe('TODO_ESCALATED');
      expect(scoped[0].origin).toBe('approve-route');
      expect(scoped[0].reason).toMatch(/SA-06/);
      // Cleanup.
      db.prepare('DELETE FROM os_todos WHERE id = ?').run(result.todoId);
      db.prepare('DELETE FROM tasks WHERE id = ?').run(result.sentinelTaskId);
      db.prepare('DELETE FROM workflow_runs WHERE id = ?').run(result.runId);
    } finally {
      scoutEmitter.off('update', handler);
    }
  });

  it('does NOT throw when WF + task + todo write succeeds (FK constraint relaxed via sentinel)', async () => {

    expect(() =>
      escalateBlockedDAGToOsTodos('wf-no-throw', 'Parse Violation test'),
    ).not.toThrow();
  });
});
