import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initDB } from '../../core/basevault/db';
import { projectsRouter } from './projects';
import fs from 'fs';
import os from 'os';
import path from 'path';

beforeAll(() => {
  initDB();
});

let scratchDir: string;
beforeAll(() => {
  scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ns-projects-test-'));
});
afterAll(() => {
  fs.rmSync(scratchDir, { recursive: true, force: true });
});

async function post(path: string, body?: any) {
  const init: RequestInit = { method: 'POST', headers: { 'Content-Type': 'application/json' } };
  if (body !== undefined) init.body = JSON.stringify(body);
  const res = await projectsRouter.request(path, init);
  return { status: res.status, data: await res.json() };
}

async function get(path: string) {
  const res = await projectsRouter.request(path);
  return { status: res.status, data: await res.json() };
}

async function createProject(name: string) {
  const res = await post('/', { name, projectRootPath: scratchDir });
  return res.data.project as { id: string; name: string; archived_at: number | null };
}

describe('projectsRouter archive/restore', () => {
  it('archives a project: it drops out of the default list but data is not deleted', async () => {
    const project = await createProject('Archive Me');

    const archiveRes = await post(`/${project.id}/archive`);
    expect(archiveRes.status).toBe(200);
    expect(archiveRes.data.project.archived_at).not.toBeNull();

    const defaultList = await get('/');
    expect(defaultList.data.projects.some((p: any) => p.id === project.id)).toBe(false);

    const fullList = await get('/?includeArchived=true');
    expect(fullList.data.projects.some((p: any) => p.id === project.id)).toBe(true);
  });

  it('restores an archived project back into the default list', async () => {
    const project = await createProject('Archive Then Restore');
    await post(`/${project.id}/archive`);

    const restoreRes = await post(`/${project.id}/restore`);
    expect(restoreRes.status).toBe(200);
    expect(restoreRes.data.project.archived_at).toBeNull();

    const defaultList = await get('/');
    expect(defaultList.data.projects.some((p: any) => p.id === project.id)).toBe(true);
  });

  it('returns 404 archiving/restoring an unknown project id', async () => {
    const archiveRes = await post('/does-not-exist/archive');
    expect(archiveRes.status).toBe(404);
    const restoreRes = await post('/does-not-exist/restore');
    expect(restoreRes.status).toBe(404);
  });
});
