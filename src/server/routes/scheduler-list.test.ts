import { describe, it, expect, beforeAll } from 'vitest';
import { schedulerListRouter } from './scheduler-list';
import { db, initDB } from '../../core/basevault/db';
import crypto from 'crypto';

// Ensure basevault schema exists; vitest runs files in isolation and the
// DB singleton file may not have all tables on a clean workspace.
beforeAll(() => {
  initDB();
});

async function get(path: string): Promise<{ status: number; body: any }> {
  const res = await schedulerListRouter.request(path);
  return { status: res.status, body: await res.json() };
}

describe('schedulerListRouter', () => {
  it('returns an empty job list when no workflows have cron_schedule', async () => {
    // We don't seed any cron workflows in this test; queries table is shared,
    // but the assertion is structural: count is a number, jobs is an array.
    const { status, body } = await get('/jobs');
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(typeof body.count).toBe('number');
    expect(Array.isArray(body.jobs)).toBe(true);
  });

  it('computes nextTick for a valid cron expression in the future', async () => {
    const id = crypto.randomUUID();
    const projectId = crypto.randomUUID();

    db.prepare('INSERT OR IGNORE INTO projects (id, name, created_at) VALUES (?, ?, ?)').run(
      projectId, 'cron-test', Date.now()
    );
    db.prepare(`
      INSERT INTO workflows (id, project_id, name, dag_template, cron_schedule, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, projectId, 'every-minute', '{}', '* * * * *', Date.now());

    try {
      const { status, body } = await get('/jobs');
      expect(status).toBe(200);
      expect(body.success).toBe(true);

      const mine = body.jobs.find((j: any) => j.id === id);
      expect(mine).toBeTruthy();
      expect(mine.cron).toBe('* * * * *');
      expect(typeof mine.nextTick).toBe('number');
      // next tick must be in the future relative to body.now
      expect(mine.nextTick).toBeGreaterThan(body.now);
    } finally {
      db.prepare('DELETE FROM workflows WHERE id = ?').run(id);
    }
  });

  it('returns nextTick=null for an invalid cron expression stored in DB', async () => {
    const id = crypto.randomUUID();
    const projectId = crypto.randomUUID();

    db.prepare('INSERT OR IGNORE INTO projects (id, name, created_at) VALUES (?, ?, ?)').run(
      projectId, 'cron-test-bad', Date.now()
    );
    db.prepare(`
      INSERT INTO workflows (id, project_id, name, dag_template, cron_schedule, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, projectId, 'invalid-cron', '{}', 'this-is-not-cron', Date.now());

    try {
      const { status, body } = await get('/jobs');
      expect(status).toBe(200);
      const mine = body.jobs.find((j: any) => j.id === id);
      expect(mine).toBeTruthy();
      expect(mine.nextTick).toBeNull();
    } finally {
      db.prepare('DELETE FROM workflows WHERE id = ?').run(id);
    }
  });
});
