import { Hono } from 'hono';
import { db } from '../../core/basevault/db';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';

export const projectsRouter = new Hono();

projectsRouter.get('/', (c) => {
  try {
    const projects = db.prepare('SELECT * FROM projects ORDER BY created_at DESC').all();
    return c.json({ projects });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

projectsRouter.post('/', async (c) => {
  try {
    const body = await c.req.json();
    const name = body.name || 'Untitled Project';
    const id = randomUUID();
    const workspacePath = path.join(process.cwd(), '.data/workspaces', id);
    
    // Create physical workspace sandbox directory
    fs.mkdirSync(workspacePath, { recursive: true });

    db.prepare(`
      INSERT INTO projects (id, name, workspace_path, created_at)
      VALUES (?, ?, ?, ?)
    `).run(id, name, workspacePath, Date.now());

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
    return c.json({ success: true, project });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});
