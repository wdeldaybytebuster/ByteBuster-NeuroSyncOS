import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { db, initDB } from '../../core/basevault/db';
import { systemRouter } from './system';

beforeAll(() => {
  initDB();
});

// Each test starts from a clean proposal slate so the single-active-proposal
// assertions are deterministic regardless of ordering.
beforeEach(() => {
  db.prepare('DELETE FROM dag_proposals').run();
  db.prepare("DELETE FROM system_settings WHERE key = 'pending_proposal'").run();
});

async function post(path: string, body: any): Promise<{ status: number; data: any }> {
  const res = await systemRouter.request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json() };
}

async function del(path: string): Promise<{ status: number; data: any }> {
  const res = await systemRouter.request(path, { method: 'DELETE' });
  return { status: res.status, data: await res.json() };
}

async function get(path: string): Promise<{ status: number; data: any }> {
  const res = await systemRouter.request(path);
  return { status: res.status, data: await res.json() };
}

const sampleProposal = { nodes: [{ id: 'n1', prompt: 'do a thing' }, { id: 'n2', prompt: 'do another' }] };

describe('POST /proposals/stage', () => {
  it('creates a dag_proposals row with the default 0.5 confidence and pending status', async () => {
    const res = await post('/proposals/stage', { proposal: sampleProposal, projectId: 'proj-1' });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.id).toBeTruthy();

    const row = db.prepare('SELECT * FROM dag_proposals WHERE id = ?').get(res.data.id) as any;
    expect(row.confidence).toBe(0.5);
    expect(row.status).toBe('pending');
    expect(row.project_id).toBe('proj-1');
    expect(JSON.parse(row.proposal).nodes).toHaveLength(2);
  });

  it('stages successfully with no project_id (nullable / Global scope)', async () => {
    const res = await post('/proposals/stage', { proposal: sampleProposal });
    expect(res.status).toBe(200);
    const row = db.prepare('SELECT project_id FROM dag_proposals WHERE id = ?').get(res.data.id) as any;
    expect(row.project_id).toBeNull();
  });

  it('rejects a missing proposal with 400', async () => {
    const res = await post('/proposals/stage', {});
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
  });

  it('supersedes a prior pending proposal so only one is pending at a time', async () => {
    const first = await post('/proposals/stage', { proposal: sampleProposal });
    const second = await post('/proposals/stage', { proposal: sampleProposal });

    const pendingCount = (db.prepare("SELECT COUNT(*) c FROM dag_proposals WHERE status = 'pending'").get() as any).c;
    expect(pendingCount).toBe(1);

    const firstRow = db.prepare('SELECT status FROM dag_proposals WHERE id = ?').get(first.data.id) as any;
    const secondRow = db.prepare('SELECT status FROM dag_proposals WHERE id = ?').get(second.data.id) as any;
    expect(firstRow.status).toBe('superseded');
    expect(secondRow.status).toBe('pending');
  });
});

describe('GET /proposals/pending', () => {
  it('returns null when nothing is pending', async () => {
    const res = await get('/proposals/pending');
    expect(res.data.success).toBe(true);
    expect(res.data.proposal).toBeNull();
  });

  it('returns the pending proposal with id + confidence, and a backward-compatible proposal shape', async () => {
    const staged = await post('/proposals/stage', { proposal: sampleProposal, projectId: 'proj-x' });
    const res = await get('/proposals/pending');
    expect(res.data.id).toBe(staged.data.id);
    expect(res.data.confidence).toBe(0.5);
    expect(res.data.projectId).toBe('proj-x');
    expect(res.data.proposal.nodes).toHaveLength(2); // consumers read d.proposal.nodes
  });
});

describe('POST /proposals/resolve and /proposals/reject', () => {
  it('resolve marks the proposal approved', async () => {
    const staged = await post('/proposals/stage', { proposal: sampleProposal });
    const res = await post('/proposals/resolve', { id: staged.data.id });
    expect(res.status).toBe(200);
    const row = db.prepare('SELECT status FROM dag_proposals WHERE id = ?').get(staged.data.id) as any;
    expect(row.status).toBe('approved');
    // no longer pending
    expect((await get('/proposals/pending')).data.proposal).toBeNull();
  });

  it('reject marks the proposal rejected', async () => {
    const staged = await post('/proposals/stage', { proposal: sampleProposal });
    const res = await post('/proposals/reject', { id: staged.data.id });
    expect(res.status).toBe(200);
    const row = db.prepare('SELECT status FROM dag_proposals WHERE id = ?').get(staged.data.id) as any;
    expect(row.status).toBe('rejected');
  });

  it('returns 404 resolving an unknown/non-pending id', async () => {
    const res = await post('/proposals/resolve', { id: 'nope' });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /proposals/pending', () => {
  it('clears the current pending proposal (marks it rejected)', async () => {
    const staged = await post('/proposals/stage', { proposal: sampleProposal });
    const res = await del('/proposals/pending');
    expect(res.data.success).toBe(true);
    const row = db.prepare('SELECT status FROM dag_proposals WHERE id = ?').get(staged.data.id) as any;
    expect(row.status).toBe('rejected');
    expect((await get('/proposals/pending')).data.proposal).toBeNull();
  });
});
