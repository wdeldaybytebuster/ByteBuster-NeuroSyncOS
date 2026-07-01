import { Hono } from 'hono';
import { db } from '../../core/basevault/db';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { writeProjectConfigYaml, readProjectConfigYaml } from '../../core/basevault/project-config-file';

export const projectsRouter = new Hono();

/**
 * Validates a user-supplied project_root_path:
 * - Must be absolute path
 * - No null bytes
 * - No traversal sequences after resolution
 * - Must exist on disk (or be empty/null to skip)
 * Returns sanitized path or null. Throws on unsafe input.
 */
function validateProjectRootPath(inputPath: string | undefined | null): string | null {
  if (!inputPath || inputPath.trim() === '') return null;

  const trimmed = inputPath.trim();

  // Reject null bytes
  if (trimmed.indexOf('\0') !== -1) {
    throw new Error('Path contains null bytes — rejected for security.');
  }

  // Must be absolute
  if (!path.isAbsolute(trimmed)) {
    throw new Error('project_root_path must be an absolute path (e.g., /home/user/my-project).');
  }

  // Resolve to canonical form (removes ../ sequences)
  const resolved = path.resolve(trimmed);

  // Reject paths that resolve to system-critical directories
  const forbidden = ['/', '/etc', '/usr', '/bin', '/sbin', '/var', '/tmp', '/root', '/proc', '/sys', '/dev'];
  if (forbidden.includes(resolved)) {
    throw new Error(`project_root_path cannot be a system directory: ${resolved}`);
  }

  // Verify directory exists on disk
  if (!fs.existsSync(resolved)) {
    throw new Error(`project_root_path does not exist on disk: ${resolved}`);
  }

  const stat = fs.statSync(resolved);
  if (!stat.isDirectory()) {
    throw new Error(`project_root_path must be a directory, not a file: ${resolved}`);
  }

  return resolved;
}

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
    const id = randomUUID();
    const workspacePath = path.join(process.cwd(), '.data/workspaces', id);

    // Validate project_root_path if provided
    let projectRootPath: string | null = null;
    try {
      projectRootPath = validateProjectRootPath(body.projectRootPath || body.project_root_path);
    } catch (validationErr: any) {
      return c.json({ success: false, error: validationErr.message }, 400);
    }

    // Portability: if this project_root_path already has a neurosync-config.yaml
    // (e.g. the folder was copied in from another machine), honor its name when
    // the caller didn't explicitly supply one. We deliberately do NOT reuse the
    // file's id for the new local row — see project-config-file.ts's read/write
    // docs and this task's tracker entry for why (local primary-key safety).
    const existingConfig = projectRootPath ? readProjectConfigYaml(projectRootPath) : null;
    const name = body.name || existingConfig?.name || 'Untitled Project';

    // Create physical workspace sandbox directory
    fs.mkdirSync(workspacePath, { recursive: true });

    const createdAt = Date.now();
    db.prepare(`
      INSERT INTO projects (id, name, workspace_path, project_root_path, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, name, workspacePath, projectRootPath, createdAt);

    writeProjectConfigYaml({ id, name, project_root_path: projectRootPath, created_at: createdAt });

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
    return c.json({ success: true, project });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

projectsRouter.put('/:id', async (c) => {
  try {
    const { id } = c.req.param();
    const body = await c.req.json();

    // Verify project exists
    const existing = db.prepare('SELECT id FROM projects WHERE id = ?').get(id);
    if (!existing) {
      return c.json({ success: false, error: 'Project not found' }, 404);
    }

    const updates: string[] = [];
    const params: any[] = [];

    // Update name if provided
    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (!name) return c.json({ success: false, error: 'name cannot be empty' }, 400);
      updates.push('name = ?');
      params.push(name);
    }

    // Update project_root_path with validation
    if (body.projectRootPath !== undefined || body.project_root_path !== undefined) {
      const rawPath = body.projectRootPath ?? body.project_root_path;
      try {
        const validated = validateProjectRootPath(rawPath);
        updates.push('project_root_path = ?');
        params.push(validated);
      } catch (validationErr: any) {
        return c.json({ success: false, error: validationErr.message }, 400);
      }
    }

    if (updates.length === 0) {
      return c.json({ success: false, error: 'No valid fields to update' }, 400);
    }

    params.push(id);
    db.prepare(`UPDATE projects SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as {
      id: string; name: string; project_root_path: string | null; created_at: number;
    };
    writeProjectConfigYaml(project);

    return c.json({ success: true, project });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});
