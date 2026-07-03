import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { db, initDB } from '../basevault/db';
import { scanProjectForDocs } from './project-scanner';

beforeAll(() => {
  initDB();
});

const scratchDirs: string[] = [];
afterEach(() => {
  for (const dir of scratchDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function makeProject(): { projectId: string; rootPath: string } {
  const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), 'ns-scanner-test-'));
  scratchDirs.push(rootPath);
  const projectId = crypto.randomUUID();
  db.prepare('INSERT INTO projects (id, name, project_root_path, created_at) VALUES (?, ?, ?, ?)').run(
    projectId,
    'Scanner Test Project',
    rootPath,
    Date.now(),
  );
  return { projectId, rootPath };
}

describe('scanProjectForDocs', () => {
  it('discovers documentation files and reports them as unprocessed by default', () => {
    const { projectId, rootPath } = makeProject();
    fs.writeFileSync(path.join(rootPath, 'README.md'), '# hello');
    fs.writeFileSync(path.join(rootPath, 'notes.txt'), 'notes');
    fs.writeFileSync(path.join(rootPath, 'ignored.json'), '{}');

    const result = scanProjectForDocs(projectId);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.totalFound).toBe(2);
    expect(result.unprocessedCount).toBe(2);
    expect(result.processedCount).toBe(0);
    expect(result.unprocessed.map((d) => d.relativePath).sort()).toEqual(['README.md', 'notes.txt']);
  });

  it('skips node_modules/.git/dist and other noise directories', () => {
    const { projectId, rootPath } = makeProject();
    fs.mkdirSync(path.join(rootPath, 'node_modules'), { recursive: true });
    fs.writeFileSync(path.join(rootPath, 'node_modules', 'buried.md'), 'nope');
    fs.mkdirSync(path.join(rootPath, 'dist'), { recursive: true });
    fs.writeFileSync(path.join(rootPath, 'dist', 'buried2.md'), 'nope');
    fs.writeFileSync(path.join(rootPath, 'real.md'), 'yes');

    const result = scanProjectForDocs(projectId);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.totalFound).toBe(1);
    expect(result.unprocessed[0]?.relativePath).toBe('real.md');
  });

  it('marks docs already recorded in okf_processed_docs_<projectId> as processed', () => {
    const { projectId, rootPath } = makeProject();
    fs.writeFileSync(path.join(rootPath, 'a.md'), 'a');
    fs.writeFileSync(path.join(rootPath, 'b.md'), 'b');
    db.prepare("INSERT INTO system_settings (key, value) VALUES (?, ?)").run(
      `okf_processed_docs_${projectId}`,
      JSON.stringify(['a.md']),
    );

    const result = scanProjectForDocs(projectId);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.totalFound).toBe(2);
    expect(result.processedCount).toBe(1);
    expect(result.unprocessedCount).toBe(1);
    expect(result.processed[0]?.relativePath).toBe('a.md');
  });

  it('returns a 400-flavored failure when the project has no project_root_path', () => {
    const projectId = crypto.randomUUID();
    db.prepare('INSERT INTO projects (id, name, created_at) VALUES (?, ?, ?)').run(
      projectId,
      'No Root Path Project',
      Date.now(),
    );

    const result = scanProjectForDocs(projectId);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.httpStatus).toBe(400);
  });
});
