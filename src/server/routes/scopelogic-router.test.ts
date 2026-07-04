import { describe, it, expect, beforeEach } from 'vitest';
import { scopelogicRouter, __clearScopeLogicSessionsForTest } from './scopelogic-router';

// No generateFn is injected here, so the interview uses its static-question
// fallback — deterministic and dependency-free, ideal for testing per-project
// session isolation (the concern under test is routing, not LLM behavior).

beforeEach(() => {
  __clearScopeLogicSessionsForTest();
});

async function post(path: string, body: any): Promise<{ status: number; data: any }> {
  const res = await scopelogicRouter.request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json() };
}

async function get(path: string): Promise<{ status: number; data: any }> {
  const res = await scopelogicRouter.request(path);
  return { status: res.status, data: await res.json() };
}

describe('scopelogicRouter — per-project session isolation', () => {
  it('keeps two projects\' interview state independent (no leakage)', async () => {
    await post('/prompt', { message: 'Goal for project A', projectId: 'proj-a' });
    await post('/prompt', { message: 'Goal for project B — first', projectId: 'proj-b' });
    await post('/prompt', { message: 'Goal for project B — second', projectId: 'proj-b' });

    const a = await get('/history?projectId=proj-a');
    const b = await get('/history?projectId=proj-b');

    // proj-a advanced one round; proj-b advanced two.
    expect(a.data.round).toBe(1);
    expect(b.data.round).toBe(2);

    // Each project only sees its own messages.
    const aText = JSON.stringify(a.data.history);
    const bText = JSON.stringify(b.data.history);
    expect(aText).toContain('Goal for project A');
    expect(aText).not.toContain('project B');
    expect(bText).toContain('project B');
    expect(bText).not.toContain('project A');
  });

  it('routes requests without a projectId to a consistent shared Global session', async () => {
    await post('/prompt', { message: 'Global goal one' });
    await post('/prompt', { message: 'Global goal two' });

    const globalHistory = await get('/history');
    expect(globalHistory.data.round).toBe(2);
    expect(JSON.stringify(globalHistory.data.history)).toContain('Global goal one');

    // The Global session is distinct from any project-scoped one.
    await post('/prompt', { message: 'A project goal', projectId: 'proj-x' });
    const projX = await get('/history?projectId=proj-x');
    expect(projX.data.round).toBe(1);
    expect(JSON.stringify(projX.data.history)).not.toContain('Global goal');
  });

  it('reset only clears the targeted project, leaving other interviews in-flight', async () => {
    await post('/prompt', { message: 'Keep me', projectId: 'proj-keep' });
    await post('/prompt', { message: 'Wipe me', projectId: 'proj-wipe' });

    const reset = await post('/reset', { projectId: 'proj-wipe' });
    expect(reset.data.success).toBe(true);

    const wiped = await get('/history?projectId=proj-wipe');
    const kept = await get('/history?projectId=proj-keep');

    // The reset project is back to a fresh session.
    expect(wiped.data.round).toBe(0);
    expect(wiped.data.isComplete).toBe(false);
    expect(wiped.data.history).toHaveLength(0);

    // The other project's interview is untouched.
    expect(kept.data.round).toBe(1);
    expect(JSON.stringify(kept.data.history)).toContain('Keep me');
  });

  it('rejects a prompt with no message (400)', async () => {
    const res = await post('/prompt', { projectId: 'proj-a' });
    expect(res.status).toBe(400);
    expect(res.data.error).toMatch(/Message is required/);
  });
});
