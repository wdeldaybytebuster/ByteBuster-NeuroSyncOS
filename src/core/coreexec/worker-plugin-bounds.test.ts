import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { db, initDB } from '../basevault/db';
// NOTE: importing './worker' instantiates the CoreExecWorker ThreadWorker
// class at module load — construction only registers handlers; no pool and
// no threads are spawned (threads come from worker-pool.ts, not imported
// here). executePlugin itself is a pure async function of its arguments:
// CerebroVectorStore is injected, and §5/Phase F-6 removed the workerDb
// parameter — os_todos writes go through the single-writer queue, which
// applies them locally on this shared test handle (no channel configured).
import { executePlugin, MAX_OKF_FILES_PER_TASK, MAX_OKF_FILE_BYTES } from './worker';

/**
 * P3-S6 — acquisition bounds on the okf_indexer files batch (interim
 * single-writer-topology discipline: each worker task bounds its own write
 * burst — see docs/security/WORKER-WRITE-TOPOLOGY.md).
 */
describe('okf_indexer files-batch acquisition bounds (P3-S6)', () => {
  let tmpDir: string;

  function makeStore() {
    const vectorInserts: unknown[][] = [];
    const CerebroVectorStore = {
      insert: (...args: unknown[]) => {
        vectorInserts.push(args);
        return 'mem-test-id';
      },
    };
    return { CerebroVectorStore, vectorInserts };
  }

  function todoCount(): number {
    return (db.prepare('SELECT COUNT(*) as n FROM os_todos').get() as { n: number }).n;
  }

  beforeAll(() => {
    initDB();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'okf-bounds-'));
  });

  beforeEach(() => {
    // The write queue's local-apply sink writes os_todos on the shared
    // ':memory:' handle — reset it between cases.
    db.prepare('DELETE FROM os_todos').run();
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('indexes a small file with one vector insert + one os_todos write (legacy shape preserved)', async () => {
    const f = path.join(tmpDir, 'small.ts');
    fs.writeFileSync(f, 'export const x = 1;\n');
    const { CerebroVectorStore, vectorInserts } = makeStore();

    const out = await executePlugin(
      { plugin: 'okf_indexer', params: { files: [f] } },
      'proj-test',
      CerebroVectorStore,
    );

    expect(out?.status).toBe('success');
    expect(out?.stdout).toBe('Indexed 1 files.');
    expect(vectorInserts).toHaveLength(1);
    expect(todoCount()).toBe(1);
  });

  it('skips an oversize file without any write and surfaces the skip', async () => {
    const f = path.join(tmpDir, 'big.ts');
    fs.writeFileSync(f, 'x'.repeat(MAX_OKF_FILE_BYTES + 1));
    const { CerebroVectorStore, vectorInserts } = makeStore();

    const out = await executePlugin(
      { plugin: 'okf_indexer', params: { files: [f] } },
      'proj-test',
      CerebroVectorStore,
    );

    expect(out?.status).toBe('success');
    expect(out?.stdout).toContain('Indexed 0 files.');
    expect(out?.stdout).toContain('Skipped 1');
    expect(vectorInserts).toHaveLength(0);
    expect(todoCount()).toBe(0);
  });

  it('counts unreadable files as skipped, never silent', async () => {
    const f = path.join(tmpDir, 'does-not-exist.ts');
    const { CerebroVectorStore, vectorInserts } = makeStore();

    const out = await executePlugin(
      { plugin: 'okf_indexer', params: { files: [f] } },
      'proj-test',
      CerebroVectorStore,
    );

    expect(out?.status).toBe('success');
    expect(out?.stdout).toContain('Skipped 1');
    expect(vectorInserts).toHaveLength(0);
    expect(todoCount()).toBe(0);
  });

  it(`caps one task at MAX_OKF_FILES_PER_TASK (${MAX_OKF_FILES_PER_TASK}) writes and defers the rest`, async () => {
    expect(MAX_OKF_FILES_PER_TASK).toBe(100);
    const files: string[] = [];
    for (let i = 0; i < MAX_OKF_FILES_PER_TASK + 5; i++) {
      const f = path.join(tmpDir, `f${i}.ts`);
      fs.writeFileSync(f, `export const v${i} = ${i};\n`);
      files.push(f);
    }
    const { CerebroVectorStore, vectorInserts } = makeStore();

    const out = await executePlugin(
      { plugin: 'okf_indexer', params: { files } },
      'proj-test',
      CerebroVectorStore,
    );

    expect(out?.status).toBe('success');
    expect(vectorInserts).toHaveLength(MAX_OKF_FILES_PER_TASK);
    expect(todoCount()).toBe(MAX_OKF_FILES_PER_TASK);
    expect(out?.stdout).toContain(`Indexed ${MAX_OKF_FILES_PER_TASK} files.`);
    expect(out?.stdout).toContain('deferred 5');
  });
});
