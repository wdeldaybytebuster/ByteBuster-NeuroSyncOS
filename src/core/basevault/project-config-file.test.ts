import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { writeProjectConfigYaml, readProjectConfigYaml } from './project-config-file';

const tmpDirs: string[] = [];

function makeTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ns-project-config-test-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tmpDirs.length) {
    const dir = tmpDirs.pop()!;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('project-config-file', () => {
  it('writes then reads back the same id/name round-trip', () => {
    const dir = makeTmpDir();
    const createdAt = Date.now();
    writeProjectConfigYaml({ id: 'proj-1', name: 'My Project', project_root_path: dir, created_at: createdAt });

    const filePath = path.join(dir, '.neurosync', 'neurosync-config.yaml');
    expect(fs.existsSync(filePath)).toBe(true);

    const read = readProjectConfigYaml(dir);
    expect(read?.id).toBe('proj-1');
    expect(read?.name).toBe('My Project');
    expect(read?.created_at).toBe(new Date(createdAt).toISOString());
  });

  it('skips writing when project_root_path is null', () => {
    writeProjectConfigYaml({ id: 'proj-2', name: 'No Root', project_root_path: null, created_at: Date.now() });
    // Nothing to assert on disk since there's no directory to check — the
    // real assertion is that this doesn't throw.
    expect(true).toBe(true);
  });

  it('returns null for a missing file', () => {
    const dir = makeTmpDir();
    expect(readProjectConfigYaml(dir)).toBeNull();
  });

  it('returns null for a corrupt/unparseable file instead of throwing', () => {
    const dir = makeTmpDir();
    const neurosyncDir = path.join(dir, '.neurosync');
    fs.mkdirSync(neurosyncDir, { recursive: true });
    fs.writeFileSync(path.join(neurosyncDir, 'neurosync-config.yaml'), ':\n  - this is not: valid: yaml::: [[[');

    expect(() => readProjectConfigYaml(dir)).not.toThrow();
    expect(readProjectConfigYaml(dir)).toBeNull();
  });

  it('overwrites an existing file on update (PUT semantics)', () => {
    const dir = makeTmpDir();
    const createdAt = Date.now();
    writeProjectConfigYaml({ id: 'proj-3', name: 'Original Name', project_root_path: dir, created_at: createdAt });
    writeProjectConfigYaml({ id: 'proj-3', name: 'Renamed', project_root_path: dir, created_at: createdAt });

    const read = readProjectConfigYaml(dir);
    expect(read?.name).toBe('Renamed');
  });
});
