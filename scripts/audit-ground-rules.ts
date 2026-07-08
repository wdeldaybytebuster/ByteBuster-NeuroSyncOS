import fs from 'fs';
import path from 'path';

/**
 * NeuroSync Ground-Rule & Drift Audit
 * ====================================
 *
 * Static analysis of the repo checking that the hard ground rules recorded in
 * `docs/implementation-plan-and-progress-tracker.md` §0 still hold, plus one
 * wiring check for the GLOBAL-tier OKF seed mechanism. This never starts a
 * server or touches a real database — every check reads files off disk.
 *
 * This is a narrow instance of "agentic drift detection": comparing live
 * repo state against a recorded decision, so a future session/agent that
 * accidentally violates a ground rule (e.g. a new unguarded child_process
 * call, or merging the two dashboards) gets caught instead of silently
 * drifting.
 *
 * Run: `npx tsx scripts/audit-ground-rules.ts` (or `npm run audit:ground-rules`).
 * Exit code 0 if every check passes, 1 if any check fails — safe to wire into
 * CI/pre-commit later (not done as part of this script itself).
 */

const REPO_ROOT = path.resolve(__dirname, '..');

export interface CheckResult {
  passed: boolean;
  message: string;
}

// ---------------------------------------------------------------------------
// Check 1: PortGrid/CoreExec dashboards remain separate
// ---------------------------------------------------------------------------

/**
 * Ground rule: PortGrid and CoreExec dashboards must never be merged — they
 * stay two separate screens permanently. We don't attempt deep structural
 * equivalence detection; "both distinct dashboard files exist, and both
 * distinct core directories exist and each contains at least one .ts file"
 * is a reasonable, low-maintenance proxy for "the boundary hasn't collapsed".
 */
export function checkPortGridCoreExecSeparation(repoRoot: string = REPO_ROOT): CheckResult {
  const portGridDashboard = path.join(repoRoot, 'src/ui/views/PortGridDashboard.tsx');
  const coreExecDashboard = path.join(repoRoot, 'src/ui/views/CoreExecDashboard.tsx');
  const portGridDir = path.join(repoRoot, 'src/core/portgrid');
  const coreExecDir = path.join(repoRoot, 'src/core/coreexec');

  const missing: string[] = [];

  if (!fs.existsSync(portGridDashboard)) missing.push('src/ui/views/PortGridDashboard.tsx');
  if (!fs.existsSync(coreExecDashboard)) missing.push('src/ui/views/CoreExecDashboard.tsx');

  const dirHasTsFile = (dir: string): boolean => {
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return false;
    return fs.readdirSync(dir).some((f) => f.endsWith('.ts') || f.endsWith('.tsx'));
  };

  if (!dirHasTsFile(portGridDir)) missing.push('src/core/portgrid/ (missing or has no .ts files)');
  if (!dirHasTsFile(coreExecDir)) missing.push('src/core/coreexec/ (missing or has no .ts files)');

  if (missing.length > 0) {
    return {
      passed: false,
      message: `PortGrid/CoreExec dashboards remain separate (missing: ${missing.join(', ')})`,
    };
  }

  return {
    passed: true,
    message: 'PortGrid/CoreExec dashboards remain separate',
  };
}

// ---------------------------------------------------------------------------
// Check 2: no unapproved shell-exec surface
// ---------------------------------------------------------------------------

/**
 * Explicit, approved allowlist for `child_process` usage. Update this
 * (with justification) alongside any new deliberate exception — everything
 * else must go through CommandSandbox's allowlist pattern.
 */
export const CHILD_PROCESS_ALLOWLIST: readonly string[] = [
  // The approved CommandSandbox itself — the one place general command
  // execution is allowed, gated by ALLOWLIST + PathValidator.
  'src/core/portgrid/sandbox.ts',
  // The approved embedded-terminal exception (documented, one-off, hardened
  // via bubblewrap filesystem containment instead of the allowlist pattern).
  // Note: this file actually uses node-pty (`pty.spawn`), not child_process —
  // it is kept on the allowlist regardless because it is the documented
  // exception referenced by the ground rules, so it must never trip this
  // check even if a future edit does introduce direct child_process use.
  'src/core/portgrid/terminal-session.ts',
  // Spawns the `gitnexus` CLI with a fixed args array (never shell string
  // interpolation) to run the optional eval-server bridge.
  'src/core/memory/gitnexus-client.ts',
  // `spawnSync('which', [cmd], ...)` — a binary-existence probe for MCP
  // reachability checking, not a general command-execution surface.
  'src/server/routes/system.ts',
];

// Note: exec/execSync/spawn/spawnSync are matched only as BARE calls (not
// preceded by a `.`), because this codebase's real child_process call sites
// always destructure/import the function and call it directly (e.g.
// `import { spawn } from 'child_process'; spawn(...)`). Excluding dot-prefixed
// calls avoids false positives on unrelated same-named methods already
// present elsewhere in the repo: better-sqlite3's `db.exec(...)`,
// `RegExp.prototype.exec` (`linkRegex.exec(...)`), and node-pty's
// `pty.spawn(...)`.
const CHILD_PROCESS_PATTERNS: RegExp[] = [
  /\bfrom\s+['"]child_process['"]/,
  /\brequire\(\s*['"]child_process['"]\s*\)/,
  /(?<!\.)\bexecSync\(/,
  /(?<!\.)\bexec\(/,
  /(?<!\.)\bspawnSync\(/,
  /(?<!\.)\bspawn\(/,
];

function walkFiles(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(full, out);
    } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
      if (entry.name.endsWith('.test.ts') || entry.name.endsWith('.test.tsx')) continue;
      out.push(full);
    }
  }
  return out;
}

interface ShellExecFinding {
  relPath: string;
  matchedPatterns: string[];
}

/**
 * Pure scan logic, factored out so it's testable against a synthetic file
 * list without touching the real filesystem.
 */
export function scanForChildProcessUsage(
  files: { relPath: string; content: string }[],
): ShellExecFinding[] {
  const findings: ShellExecFinding[] = [];
  for (const file of files) {
    const matched: string[] = [];
    for (const pattern of CHILD_PROCESS_PATTERNS) {
      if (pattern.test(file.content)) matched.push(pattern.source);
    }
    if (matched.length > 0) findings.push({ relPath: file.relPath, matchedPatterns: matched });
  }
  return findings;
}

export function checkShellExecSurface(repoRoot: string = REPO_ROOT): CheckResult {
  const srcDir = path.join(repoRoot, 'src');
  const files = walkFiles(srcDir).map((full) => ({
    relPath: path.relative(repoRoot, full).split(path.sep).join('/'),
    content: fs.readFileSync(full, 'utf8'),
  }));

  const findings = scanForChildProcessUsage(files);
  const allowlistSet = new Set(CHILD_PROCESS_ALLOWLIST);
  const unapproved = findings.filter((f) => !allowlistSet.has(f.relPath));
  const approvedFound = findings.filter((f) => allowlistSet.has(f.relPath));

  const describe = (f: ShellExecFinding) => `${f.relPath} [${f.matchedPatterns.join(', ')}]`;

  if (unapproved.length > 0) {
    return {
      passed: false,
      message:
        `No unapproved shell-exec surface — FOUND unapproved usage in: ${unapproved.map(describe).join('; ')}` +
        (approvedFound.length > 0
          ? ` (approved usage also found in: ${approvedFound.map((f) => f.relPath).join(', ')})`
          : ''),
    };
  }

  return {
    passed: true,
    message:
      approvedFound.length > 0
        ? `No unapproved shell-exec surface (${approvedFound.length} approved file(s) found: ${approvedFound
            .map((f) => f.relPath)
            .join(', ')})`
        : 'No unapproved shell-exec surface (no child_process usage found anywhere in src/)',
  };
}

// ---------------------------------------------------------------------------
// Check 3: tests never touch the real database
// ---------------------------------------------------------------------------

export function checkTestsUseInMemoryDb(repoRoot: string = REPO_ROOT): CheckResult {
  const dbFile = path.join(repoRoot, 'src/core/basevault/db.ts');
  if (!fs.existsSync(dbFile)) {
    return { passed: false, message: 'Tests never touch the real database (src/core/basevault/db.ts not found)' };
  }
  const content = fs.readFileSync(dbFile, 'utf8');
  const hasVitestBranch = /process\.env\.VITEST/.test(content);

  if (!hasVitestBranch) {
    return {
      passed: false,
      message: 'Tests never touch the real database (no process.env.VITEST branch found in db.ts)',
    };
  }

  return {
    passed: true,
    message: 'Tests never touch the real database (VITEST in-memory branch present)',
  };
}

// ---------------------------------------------------------------------------
// Check 4: no external database client dependencies
// ---------------------------------------------------------------------------

export const FORBIDDEN_DB_DEPENDENCIES: readonly string[] = [
  'mongodb',
  'mongoose',
  'mysql',
  'mysql2',
  'pg',
  'pg-promise',
  'sequelize',
  'redis',
  'ioredis',
  'prisma',
];

/**
 * Pure logic factored out for isolated testing: given a dependency map (as
 * read from package.json), which forbidden packages (if any) are present?
 */
export function findForbiddenDependencies(deps: Record<string, string>): string[] {
  return FORBIDDEN_DB_DEPENDENCIES.filter((name) => Object.prototype.hasOwnProperty.call(deps, name));
}

export function checkNoExternalDbDependencies(repoRoot: string = REPO_ROOT): CheckResult {
  const pkgPath = path.join(repoRoot, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    return { passed: false, message: 'No external database client dependencies (package.json not found)' };
  }
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const merged: Record<string, string> = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  const found = findForbiddenDependencies(merged);

  if (found.length > 0) {
    return {
      passed: false,
      message: `No external database client dependencies (found: ${found.join(', ')})`,
    };
  }

  return {
    passed: true,
    message: 'No external database client dependencies',
  };
}

// ---------------------------------------------------------------------------
// Check 5: Global OKF seed mechanism is wired up
// ---------------------------------------------------------------------------

export function checkGlobalOKFSeedWired(repoRoot: string = REPO_ROOT): CheckResult {
  const seedDir = path.join(repoRoot, 'resources/global_okf_seed');
  const serverIndex = path.join(repoRoot, 'src/server/index.ts');
  const seedModule = path.join(repoRoot, 'src/core/okf/global-seed.ts');

  const problems: string[] = [];

  if (!fs.existsSync(seedDir) || !fs.statSync(seedDir).isDirectory()) {
    problems.push('resources/global_okf_seed/ does not exist');
  } else {
    const hasMarkdown = (dir: string): boolean => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (hasMarkdown(full)) return true;
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          return true;
        }
      }
      return false;
    };
    if (!hasMarkdown(seedDir)) problems.push('resources/global_okf_seed/ contains no .md files');
  }

  if (!fs.existsSync(seedModule)) {
    problems.push('src/core/okf/global-seed.ts not found');
  } else {
    const seedModuleContent = fs.readFileSync(seedModule, 'utf8');
    if (!/export\s+function\s+bootstrapGlobalOKFSeed/.test(seedModuleContent)) {
      problems.push('src/core/okf/global-seed.ts does not export bootstrapGlobalOKFSeed');
    }
  }

  if (!fs.existsSync(serverIndex)) {
    problems.push('src/server/index.ts not found');
  } else {
    const serverContent = fs.readFileSync(serverIndex, 'utf8');
    const importsIt = /import\s*\{[^}]*\bbootstrapGlobalOKFSeed\b[^}]*\}\s*from\s*['"][^'"]*global-seed['"]/.test(
      serverContent,
    );
    const callsIt = /\bbootstrapGlobalOKFSeed\s*\(/.test(serverContent);
    if (!importsIt) problems.push('src/server/index.ts does not import bootstrapGlobalOKFSeed from global-seed');
    if (!callsIt) problems.push('src/server/index.ts does not call bootstrapGlobalOKFSeed()');
  }

  if (problems.length > 0) {
    return {
      passed: false,
      message: `Global OKF seed mechanism is wired up (problems: ${problems.join('; ')})`,
    };
  }

  return {
    passed: true,
    message: 'Global OKF seed mechanism is wired up',
  };
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

interface NamedCheck {
  label: string;
  run: () => CheckResult;
}

const CHECKS: NamedCheck[] = [
  { label: 'PortGrid/CoreExec dashboards remain separate', run: () => checkPortGridCoreExecSeparation() },
  { label: 'No unapproved shell-exec surface', run: () => checkShellExecSurface() },
  { label: 'Tests never touch the real database', run: () => checkTestsUseInMemoryDb() },
  { label: 'No external database client dependencies', run: () => checkNoExternalDbDependencies() },
  { label: 'Global OKF seed mechanism is wired up', run: () => checkGlobalOKFSeedWired() },
];

export function main(): number {
  console.log('NeuroSync Ground-Rule & Drift Audit');
  console.log('====================================');

  let passedCount = 0;
  for (const check of CHECKS) {
    const result = check.run();
    console.log(`[${result.passed ? 'PASS' : 'FAIL'}] ${result.message}`);
    if (result.passed) passedCount++;
  }

  console.log('');
  console.log(`${passedCount}/${CHECKS.length} checks passed.`);

  return passedCount === CHECKS.length ? 0 : 1;
}

if (require.main === module) {
  process.exit(main());
}
