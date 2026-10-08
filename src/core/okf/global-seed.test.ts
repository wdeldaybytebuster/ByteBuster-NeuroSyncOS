import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { db, initDB } from '../basevault/db';
import { copyMarkdownTree, seedIfEmpty, bootstrapGlobalOKFSeed } from './global-seed';

beforeAll(() => {
  initDB();
});

const scratchDirs: string[] = [];
afterEach(() => {
  for (const dir of scratchDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function makeTmpDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  scratchDirs.push(dir);
  return dir;
}

describe('copyMarkdownTree', () => {
  it('copies nested .md files and preserves directory structure', () => {
    const source = makeTmpDir('ns-seed-src-');
    const target = makeTmpDir('ns-seed-dst-');
    fs.mkdirSync(path.join(source, 'core-reasoning'), { recursive: true });
    fs.writeFileSync(path.join(source, 'core-reasoning', 'react-loop.md'), '---\ntype: concept\n---\nbody');
    fs.writeFileSync(path.join(source, 'core-reasoning', 'notes.txt'), 'not markdown');

    const copied = copyMarkdownTree(source, target);

    expect(copied).toBe(1);
    expect(fs.existsSync(path.join(target, 'core-reasoning', 'react-loop.md'))).toBe(true);
    expect(fs.existsSync(path.join(target, 'core-reasoning', 'notes.txt'))).toBe(false);
  });

  it('returns 0 when the source directory does not exist', () => {
    const target = makeTmpDir('ns-seed-dst-');
    const copied = copyMarkdownTree(path.join(target, 'does-not-exist'), target);
    expect(copied).toBe(0);
  });
});

describe('seedIfEmpty', () => {
  it('seeds an empty target directory', () => {
    const source = makeTmpDir('ns-seed-src-');
    const target = makeTmpDir('ns-seed-dst-');
    fs.writeFileSync(path.join(source, 'concept.md'), '---\ntype: concept\n---\nbody');

    const result = seedIfEmpty(source, target);

    expect(result.seeded).toBe(true);
    expect(result.filesCopied).toBe(1);
    expect(fs.existsSync(path.join(target, 'concept.md'))).toBe(true);
  });

  it('does not overwrite a target that already has content', () => {
    const source = makeTmpDir('ns-seed-src-');
    const target = makeTmpDir('ns-seed-dst-');
    fs.writeFileSync(path.join(source, 'new-concept.md'), '---\ntype: concept\n---\nnew');
    fs.writeFileSync(path.join(target, 'operator-authored.md'), '---\ntype: concept\n---\nmine');

    const result = seedIfEmpty(source, target);

    expect(result.seeded).toBe(false);
    expect(result.filesCopied).toBe(0);
    expect(fs.existsSync(path.join(target, 'new-concept.md'))).toBe(false);
    expect(fs.readFileSync(path.join(target, 'operator-authored.md'), 'utf-8')).toContain('mine');
  });
});

describe('bootstrapGlobalOKFSeed', () => {
  it('seeds, indexes, and is idempotent on a second run', () => {
    const source = makeTmpDir('ns-seed-src-');
    const target = makeTmpDir('ns-seed-dst-');
    fs.writeFileSync(
      path.join(source, 'idempotent-execution.md'),
      '---\ntype: concept\ntitle: Idempotent Execution\nconfidence: 0.95\n---\n\n# Idempotent Execution\n\nBody text.',
    );
    fs.writeFileSync(
      path.join(source, 'speculative-concept.md'),
      '---\ntype: concept\ntitle: Speculative Concept\nconfidence: 0.85\n---\n\n# Speculative Concept\n\nBody text.',
    );

    const first = bootstrapGlobalOKFSeed(source, target);
    expect(first.seeded).toBe(true);
    expect(first.filesCopied).toBe(2);
    expect(first.indexed).toBe(1); // 0.95 auto-indexes; 0.85 stays pending review

    const nodeCount = db.prepare("SELECT COUNT(*) as c FROM okf_nodes WHERE tier = 'GLOBAL' AND file_path LIKE ?").get(`${target}%`) as { c: number };
    expect(nodeCount.c).toBe(1);

    const second = bootstrapGlobalOKFSeed(source, target);
    expect(second.seeded).toBe(false);
    expect(second.filesCopied).toBe(0);
  });

  it('is a no-op when the seed source directory is missing', () => {
    const target = makeTmpDir('ns-seed-dst-');
    const result = bootstrapGlobalOKFSeed(path.join(target, 'nonexistent'), target);
    expect(result.seeded).toBe(false);
    expect(result.filesCopied).toBe(0);
    expect(result.indexed).toBe(0);
  });
});
