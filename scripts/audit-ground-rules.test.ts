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
  // §4.4 checks 6-8 (C10):
  scanForSqlInterpolation,
  checkNoUntrustedSqlInterpolation,
  SQL_INTERPOLATION_ALLOWLIST,
  scanForRawFetch,
  checkNoRawEgress,
  RAW_EGRESS_ALLOWLIST,
  checkServerBindsLoopback,
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
      // §4.3: the fixture pins the OWNER of the wiring — server-main.ts, NOT
      // the index.ts bootstrapper (plan ARCHITECT-ci-gating-cleanup §4.1).
      fs.writeFileSync(
        path.join(repo, 'src/server/server-main.ts'),
        "import { bootstrapGlobalOKFSeed } from '../core/okf/global-seed';\nbootstrapGlobalOKFSeed();\n",
      );
    }

    it('passes when the seed dir has markdown and server/server-main.ts imports + calls it', () => {
      const repo = newTempRepo(tempDirs);
      writeWiredRepo(repo);
      const result = checkGlobalOKFSeedWired(repo);
      expect(result.passed).toBe(true);
    });

    it('fails when server-main.ts imports bootstrapGlobalOKFSeed but never calls it', () => {
      const repo = newTempRepo(tempDirs);
      writeWiredRepo(repo);
      fs.writeFileSync(
        path.join(repo, 'src/server/server-main.ts'),
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

    // §4.3.4 — bootstrapper-exclusion regression: pins that a correct tree
    // with NO OKF wiring in index.ts still passes, so a future edit cannot
    // silently re-point the check at the bootstrapper.
    it('passes when wiring lives in server-main.ts even though the index.ts bootstrapper lacks it', () => {
      const repo = newTempRepo(tempDirs);
      writeWiredRepo(repo);
      fs.writeFileSync(path.join(repo, 'src/server/index.ts'), "// bootstrapper — no OKF wiring here\n");
      expect(checkGlobalOKFSeedWired(repo).passed).toBe(true);
    });

    // §7 T1 N5-fixed — stale-tree detection: wiring in the bootstrapper and
    // ONLY there must FAIL, proving index.ts is not the target.
    it('fails when the wiring lives only in the index.ts bootstrapper and server-main.ts is bare', () => {
      const repo = newTempRepo(tempDirs);
      writeWiredRepo(repo);
      fs.writeFileSync(
        path.join(repo, 'src/server/index.ts'),
        "import { bootstrapGlobalOKFSeed } from '../core/okf/global-seed';\nbootstrapGlobalOKFSeed();\n",
      );
      fs.writeFileSync(path.join(repo, 'src/server/server-main.ts'), '// bare entry — no OKF wiring\n');
      const result = checkGlobalOKFSeedWired(repo);
      expect(result.passed).toBe(false);
      expect(result.message).toContain('does not call bootstrapGlobalOKFSeed');
    });
  });

  // ── §4.4 check 6 (C10): no untrusted SQL interpolation ────────────────────

  describe('scanForSqlInterpolation (pure)', () => {
    it('flags .prepare/.exec backtick templates containing ${', () => {
      const files = [
        { relPath: 'a.ts', content: 'db.prepare(`SELECT * FROM t WHERE id = ${id}`);' },
        { relPath: 'b.ts', content: 'db.exec(`UPDATE t SET x = 1${updates.join(",")}`);' },
      ];
      const findings = scanForSqlInterpolation(files);
      expect(findings.map((f) => f.relPath)).toEqual(['a.ts', 'b.ts']);
      expect(findings[0]?.matchedPatterns.length).toBeGreaterThan(0);
    });

    it('does not flag parameterised string literals, interpolation-free templates, or plain db.exec', () => {
      const files = [
        { relPath: 'c.ts', content: "db.prepare('SELECT * FROM t WHERE id = ?').get(id);" },
        { relPath: 'd.ts', content: 'db.prepare(`SELECT * FROM t WHERE id = ?`);' },
        { relPath: 'e.ts', content: "db.exec('BEGIN IMMEDIATE');" },
        { relPath: 'f.ts', content: "const sql = `SELECT ${x}`; // not passed to prepare/exec" },
      ];
      expect(scanForSqlInterpolation(files)).toEqual([]);
    });
  });

  describe('checkNoUntrustedSqlInterpolation', () => {
    it('passes when the only interpolating file is allowlisted', () => {
      const repo = newTempRepo(tempDirs);
      const allowed = 'src/server/routes/coreexec-router.ts';
      const fullPath = path.join(repo, allowed);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, 'db.prepare(`SELECT 1 WHERE a = ${runFilter}`);');
      const result = checkNoUntrustedSqlInterpolation(repo);
      expect(result.passed).toBe(true);
      expect(result.message).toContain(allowed);
    });

    it('fails when a non-allowlisted file interpolates into .prepare', () => {
      const repo = newTempRepo(tempDirs);
      const rogueFile = path.join(repo, 'src/core/some-new-feature/rogue.ts');
      fs.mkdirSync(path.dirname(rogueFile), { recursive: true });
      fs.writeFileSync(rogueFile, 'db.prepare(`DELETE FROM t WHERE id = ${req.query.id}`);');
      const result = checkNoUntrustedSqlInterpolation(repo);
      expect(result.passed).toBe(false);
      expect(result.message).toContain('src/core/some-new-feature/rogue.ts');
    });

    it('excludes .test.ts files from the scan', () => {
      const repo = newTempRepo(tempDirs);
      const testFile = path.join(repo, 'src/core/some-new-feature/rogue.test.ts');
      fs.mkdirSync(path.dirname(testFile), { recursive: true });
      fs.writeFileSync(testFile, 'db.prepare(`SELECT ${x}`);');
      const result = checkNoUntrustedSqlInterpolation(repo);
      expect(result.passed).toBe(true);
    });

    it('keeps transport.ts and sync.ts OFF the allowlist (C1/C2 removed their interpolation)', () => {
      const repo = newTempRepo(tempDirs);
      for (const rel of ['src/core/routeswitch/transport.ts', 'src/core/routeswitch/sync.ts']) {
        const full = path.join(repo, rel);
        fs.mkdirSync(path.dirname(full), { recursive: true });
        // Interpolating content proves the allowlist entry is absent (would
        // pass if the file had silently crept back onto the allowlist).
        fs.writeFileSync(full, 'db.prepare(`SELECT ${x}`);');
      }
      const result = checkNoUntrustedSqlInterpolation(repo);
      expect(result.passed).toBe(false);
    });

    it('pins the allowlist: plan §4.4 initial three + C10-discovered literal fragments + §5-17 deferral', () => {
      // Guards against SILENT allowlist growth/shrink — every entry must be
      // justified in a comment next to its definition (plan §4.4).
      expect([...SQL_INTERPOLATION_ALLOWLIST]).toEqual([
        'src/server/routes/coreexec-router.ts',
        'src/server/routes/llm.ts',
        'src/server/routes/projects.ts',
        'src/core/okf/graph-query.ts',
        'src/server/routes/okf.ts',
        'src/core/memory/cerebro/vector.ts', // §5-17 deferred — recorded, not fixed
      ]);
    });
  });

  // ── §4.4 check 7 (C10): no raw egress outside the governed door ──────────

  describe('scanForRawFetch (pure)', () => {
    it('flags bare fetch( calls', () => {
      const files = [
        { relPath: 'a.ts', content: 'const res = await fetch(url, { method: "GET" });' },
        { relPath: 'b.ts', content: 'fetch(url);' },
      ];
      const findings = scanForRawFetch(files);
      expect(findings.map((f) => f.relPath)).toEqual(['a.ts', 'b.ts']);
    });

    it('does not flag egressFetch( or method-style obj.fetch(', () => {
      const files = [
        { relPath: 'c.ts', content: 'const r = await egressFetch(url, {}, ctx);' },
        { relPath: 'd.ts', content: 'client.fetch(payload);' },
      ];
      expect(scanForRawFetch(files)).toEqual([]);
    });

    it('does not flag fetch( mentions that only appear in comments', () => {
      const files = [
        {
          relPath: 'e.ts',
          content: '/**\n * THE BUG: raw `fetch(url)` fired here.\n */\nexport const x = 1;',
        },
        { relPath: 'f.ts', content: '// we used to call fetch(url) here\nexport const y = 2;' },
      ];
      expect(scanForRawFetch(files)).toEqual([]);
    });
  });

  describe('checkNoRawEgress', () => {
    it('passes when the only raw fetches are allowlisted (gate, adapters, system, gitnexus, ui api)', () => {
      const repo = newTempRepo(tempDirs);
      const allowlisted = [
        'src/core/routeswitch/egress.ts',
        'src/core/routeswitch/adapters/openai-compatible.ts', // adapters/*.ts prefix entry
        'src/server/routes/system.ts',
        'src/core/memory/gitnexus-client.ts',
        'src/ui/lib/api.ts',
      ];
      for (const rel of allowlisted) {
        const full = path.join(repo, rel);
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, 'const r = await fetch(url);');
      }
      const result = checkNoRawEgress(repo);
      expect(result.passed).toBe(true);
    });

    it('fails when a non-allowlisted file calls raw fetch', () => {
      const repo = newTempRepo(tempDirs);
      const rogueFile = path.join(repo, 'src/core/some-new-feature/rogue.ts');
      fs.mkdirSync(path.dirname(rogueFile), { recursive: true });
      fs.writeFileSync(rogueFile, 'const r = await fetch("https://example.invalid");');
      const result = checkNoRawEgress(repo);
      expect(result.passed).toBe(false);
      expect(result.message).toContain('src/core/some-new-feature/rogue.ts');
    });

    it('excludes .test.ts files from the scan', () => {
      const repo = newTempRepo(tempDirs);
      const testFile = path.join(repo, 'src/core/some-new-feature/rogue.test.ts');
      fs.mkdirSync(path.dirname(testFile), { recursive: true });
      fs.writeFileSync(testFile, 'const r = await fetch(url);');
      const result = checkNoRawEgress(repo);
      expect(result.passed).toBe(true);
    });

    it('does not allowlist transport.ts/sync.ts (their raw fetches were C1/C2 conversions)', () => {
      const repo = newTempRepo(tempDirs);
      const full = path.join(repo, 'src/core/routeswitch/transport.ts');
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, 'const r = await fetch(url);');
      const result = checkNoRawEgress(repo);
      expect(result.passed).toBe(false);
    });

    it('pins the allowlist: gate + adapters (§5-14) + gitnexus + system (§5-3) + browser api', () => {
      // Guards against SILENT allowlist growth/shrink — mirrors the check-6
      // pin. Deferred entries (§5-14 adapters/, §5-3 system.ts) stay visible
      // here until their own reviewed change removes them; ANY addition needs
      // a justification comment at the entry site + a negative-test update
      // (plan ARCHITECT-ci-gating-cleanup §5, rules 1-2).
      expect([...RAW_EGRESS_ALLOWLIST]).toEqual([
        'src/core/routeswitch/egress.ts',
        'src/core/routeswitch/adapters/', // §5-14 DEFERRED prefix — recorded, not fixed
        'src/core/memory/gitnexus-client.ts',
        'src/server/routes/system.ts', // §5-3 DEFERRED MCP probe — recorded, not fixed
        'src/ui/lib/api.ts', // deliberate browser-side module (documented C10 deviation)
      ]);
    });
  });

  // ── §4.4 check 8 (C10): server binds loopback only ────────────────────────

  describe('checkServerBindsLoopback', () => {
    it('passes when server-main.ts declares hostname: inside the serve({ … }) literal', () => {
      const repo = newTempRepo(tempDirs);
      const file = path.join(repo, 'src/server/server-main.ts');
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(
        file,
        "const server = serve({\n  hostname: bindAddress,\n  port: 3000,\n  fetch(req) { return handle(req); },\n});\n",
      );
      const result = checkServerBindsLoopback(repo);
      expect(result.passed).toBe(true);
    });

    it('fails when the serve({ … }) literal has no hostname: entry (would bind 0.0.0.0)', () => {
      const repo = newTempRepo(tempDirs);
      const file = path.join(repo, 'src/server/server-main.ts');
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, "const server = serve({\n  port: 3000,\n  fetch(req) { return handle(req); },\n});\n");
      const result = checkServerBindsLoopback(repo);
      expect(result.passed).toBe(false);
      expect(result.message).toContain('hostname:');
    });

    it('fails when server-main.ts does not exist', () => {
      const repo = newTempRepo(tempDirs);
      const result = checkServerBindsLoopback(repo);
      expect(result.passed).toBe(false);
    });
  });
});
