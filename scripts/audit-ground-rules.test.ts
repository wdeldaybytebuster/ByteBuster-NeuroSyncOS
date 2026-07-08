import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  checkPortGridCoreExecSeparation,
  checkShellExecSurface,
  scanForChildProcessUsage,
  CHILD_PROCESS_ALLOWLIST,
  checkTestsUseInMemoryDb,
  checkNoExternalDbDependencies,
  findForbiddenDependencies,
  checkGlobalOKFSeedWired,
} from './audit-ground-rules';

// Each check function under test accepts an explicit repoRoot, so these tests
// build small synthetic repo trees under a temp dir rather than touching the
// real repository -- both pass and fail scenarios are constructed in
// isolation, never by mutating real files.

function newTempRepo(tempDirs: string[]): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-ground-rules-test-'));
  tempDirs.push(dir);
  return dir;
}

describe('audit-ground-rules', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    while (tempDirs.length) {
      const dir = tempDirs.pop()!;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  describe('checkPortGridCoreExecSeparation', () => {
    it('passes when both dashboards and both populated core dirs exist', () => {
      const repo = newTempRepo(tempDirs);
      fs.mkdirSync(path.join(repo, 'src/ui/views'), { recursive: true });
      fs.mkdirSync(path.join(repo, 'src/core/portgrid'), { recursive: true });
      fs.mkdirSync(path.join(repo, 'src/core/coreexec'), { recursive: true });
      fs.writeFileSync(path.join(repo, 'src/ui/views/PortGridDashboard.tsx'), 'export {}');
      fs.writeFileSync(path.join(repo, 'src/ui/views/CoreExecDashboard.tsx'), 'export {}');
      fs.writeFileSync(path.join(repo, 'src/core/portgrid/sandbox.ts'), 'export {}');
      fs.writeFileSync(path.join(repo, 'src/core/coreexec/engine.ts'), 'export {}');

      const result = checkPortGridCoreExecSeparation(repo);
      expect(result.passed).toBe(true);
    });

    it('fails when the CoreExec dashboard file is missing', () => {
      const repo = newTempRepo(tempDirs);
      fs.mkdirSync(path.join(repo, 'src/ui/views'), { recursive: true });
      fs.mkdirSync(path.join(repo, 'src/core/portgrid'), { recursive: true });
      fs.mkdirSync(path.join(repo, 'src/core/coreexec'), { recursive: true });
      fs.writeFileSync(path.join(repo, 'src/ui/views/PortGridDashboard.tsx'), 'export {}');
      fs.writeFileSync(path.join(repo, 'src/core/portgrid/sandbox.ts'), 'export {}');
      fs.writeFileSync(path.join(repo, 'src/core/coreexec/engine.ts'), 'export {}');
      // CoreExecDashboard.tsx intentionally omitted.

      const result = checkPortGridCoreExecSeparation(repo);
      expect(result.passed).toBe(false);
      expect(result.message).toContain('CoreExecDashboard.tsx');
    });

    it('fails when a core directory exists but has been emptied of .ts files', () => {
      const repo = newTempRepo(tempDirs);
      fs.mkdirSync(path.join(repo, 'src/ui/views'), { recursive: true });
      fs.mkdirSync(path.join(repo, 'src/core/portgrid'), { recursive: true });
      fs.mkdirSync(path.join(repo, 'src/core/coreexec'), { recursive: true });
      fs.writeFileSync(path.join(repo, 'src/ui/views/PortGridDashboard.tsx'), 'export {}');
      fs.writeFileSync(path.join(repo, 'src/ui/views/CoreExecDashboard.tsx'), 'export {}');
      fs.writeFileSync(path.join(repo, 'src/core/portgrid/sandbox.ts'), 'export {}');
      // src/core/coreexec left empty -- simulates the boundary collapsing.

      const result = checkPortGridCoreExecSeparation(repo);
      expect(result.passed).toBe(false);
    });
  });

  describe('scanForChildProcessUsage (pure)', () => {
    it('detects both import and bare-call patterns', () => {
      const files = [
        { relPath: 'a.ts', content: "import { spawn } from 'child_process';\nspawn('ls');" },
        { relPath: 'b.ts', content: "const cp = require('child_process');" },
      ];
      const findings = scanForChildProcessUsage(files);
      expect(findings.map((f) => f.relPath).sort()).toEqual(['a.ts', 'b.ts']);
    });

    it('does not flag same-named methods on unrelated objects (db.exec, RegExp.exec, pty.spawn)', () => {
      const files = [
        { relPath: 'c.ts', content: "db.exec('BEGIN IMMEDIATE');" },
        { relPath: 'd.ts', content: 'linkRegex.exec(body);' },
        { relPath: 'e.ts', content: "pty.spawn('bash', []);" },
      ];
      const findings = scanForChildProcessUsage(files);
      expect(findings).toEqual([]);
    });
  });

  describe('checkShellExecSurface', () => {
    it('passes when child_process usage is confined to allowlisted files', () => {
      const repo = newTempRepo(tempDirs);
      const allowedFile = CHILD_PROCESS_ALLOWLIST[0]!;
      const fullPath = path.join(repo, allowedFile);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, "import { spawn } from 'child_process';\nspawn('bwrap');");

      const result = checkShellExecSurface(repo);
      expect(result.passed).toBe(true);
      expect(result.message).toContain(allowedFile);
    });

    it('fails when a non-allowlisted file uses child_process', () => {
      const repo = newTempRepo(tempDirs);
      const rogueFile = path.join(repo, 'src/core/some-new-feature/rogue.ts');
      fs.mkdirSync(path.dirname(rogueFile), { recursive: true });
      fs.writeFileSync(rogueFile, "import { execSync } from 'child_process';\nexecSync('rm -rf /tmp/x');");

      const result = checkShellExecSurface(repo);
      expect(result.passed).toBe(false);
      expect(result.message).toContain('src/core/some-new-feature/rogue.ts');
    });

    it('excludes .test.ts files from the scan', () => {
      const repo = newTempRepo(tempDirs);
      const testFile = path.join(repo, 'src/core/some-new-feature/rogue.test.ts');
      fs.mkdirSync(path.dirname(testFile), { recursive: true });
      fs.writeFileSync(testFile, "import { execSync } from 'child_process';\nexecSync('echo hi');");

      const result = checkShellExecSurface(repo);
      expect(result.passed).toBe(true);
    });
  });

  describe('checkTestsUseInMemoryDb', () => {
    it('passes when db.ts branches on process.env.VITEST', () => {
      const repo = newTempRepo(tempDirs);
      const dbFile = path.join(repo, 'src/core/basevault/db.ts');
      fs.mkdirSync(path.dirname(dbFile), { recursive: true });
      fs.writeFileSync(dbFile, 'const isTestEnv = !!process.env.VITEST;\n');

      const result = checkTestsUseInMemoryDb(repo);
      expect(result.passed).toBe(true);
    });

    it('fails when db.ts has no VITEST branch', () => {
      const repo = newTempRepo(tempDirs);
      const dbFile = path.join(repo, 'src/core/basevault/db.ts');
      fs.mkdirSync(path.dirname(dbFile), { recursive: true });
      fs.writeFileSync(dbFile, "const dbPath = 'real.db';\n");

      const result = checkTestsUseInMemoryDb(repo);
      expect(result.passed).toBe(false);
    });

    it('fails when db.ts does not exist at all', () => {
      const repo = newTempRepo(tempDirs);
      const result = checkTestsUseInMemoryDb(repo);
      expect(result.passed).toBe(false);
    });
  });

  describe('findForbiddenDependencies (pure)', () => {
    it('returns an empty array for an approved dependency set', () => {
      const found = findForbiddenDependencies({ 'better-sqlite3': '^12.0.0', 'sqlite-vec': '^0.1.9' });
      expect(found).toEqual([]);
    });

    it('flags a forbidden dependency when present', () => {
      const found = findForbiddenDependencies({ 'better-sqlite3': '^12.0.0', mongodb: '^6.0.0' });
      expect(found).toEqual(['mongodb']);
    });
  });

  describe('checkNoExternalDbDependencies', () => {
    it('passes when package.json has no forbidden dependencies', () => {
      const repo = newTempRepo(tempDirs);
      fs.writeFileSync(
        path.join(repo, 'package.json'),
        JSON.stringify({ dependencies: { 'better-sqlite3': '^12.0.0' }, devDependencies: {} }),
      );
      const result = checkNoExternalDbDependencies(repo);
      expect(result.passed).toBe(true);
    });

    it('fails when package.json declares a forbidden dependency', () => {
      const repo = newTempRepo(tempDirs);
      fs.writeFileSync(
        path.join(repo, 'package.json'),
        JSON.stringify({ dependencies: { 'better-sqlite3': '^12.0.0' }, devDependencies: { prisma: '^5.0.0' } }),
      );
      const result = checkNoExternalDbDependencies(repo);
      expect(result.passed).toBe(false);
      expect(result.message).toContain('prisma');
    });
  });

  describe('checkGlobalOKFSeedWired', () => {
    function writeWiredRepo(repo: string) {
      fs.mkdirSync(path.join(repo, 'resources/global_okf_seed'), { recursive: true });
      fs.writeFileSync(path.join(repo, 'resources/global_okf_seed/seed.md'), '# seed');
      fs.mkdirSync(path.join(repo, 'src/core/okf'), { recursive: true });
      fs.writeFileSync(
        path.join(repo, 'src/core/okf/global-seed.ts'),
        'export function bootstrapGlobalOKFSeed() {}\n',
      );
      fs.mkdirSync(path.join(repo, 'src/server'), { recursive: true });
      fs.writeFileSync(
        path.join(repo, 'src/server/index.ts'),
        "import { bootstrapGlobalOKFSeed } from '../core/okf/global-seed';\nbootstrapGlobalOKFSeed();\n",
      );
    }

    it('passes when the seed dir has markdown and server/index.ts imports + calls it', () => {
      const repo = newTempRepo(tempDirs);
      writeWiredRepo(repo);
      const result = checkGlobalOKFSeedWired(repo);
      expect(result.passed).toBe(true);
    });

    it('fails when server/index.ts imports bootstrapGlobalOKFSeed but never calls it', () => {
      const repo = newTempRepo(tempDirs);
      writeWiredRepo(repo);
      fs.writeFileSync(
        path.join(repo, 'src/server/index.ts'),
        "import { bootstrapGlobalOKFSeed } from '../core/okf/global-seed';\n// never called\n",
      );
      const result = checkGlobalOKFSeedWired(repo);
      expect(result.passed).toBe(false);
      expect(result.message).toContain('does not call bootstrapGlobalOKFSeed');
    });

    it('fails when the seed directory has no markdown files', () => {
      const repo = newTempRepo(tempDirs);
      writeWiredRepo(repo);
      fs.rmSync(path.join(repo, 'resources/global_okf_seed/seed.md'));
      const result = checkGlobalOKFSeedWired(repo);
      expect(result.passed).toBe(false);
      expect(result.message).toContain('no .md files');
    });
  });
});
