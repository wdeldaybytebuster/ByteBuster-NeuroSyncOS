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

/**
 * Canonical server entrypoint that owns runtime wiring (NOT the index.ts
 * bootstrapper). `src/server/index.ts` only runs the Genesis `--profile`
 * probe or dynamic-imports server-main.js — it never touches OKF. Asserting
 * against the bootstrapper tests the wrong file: it fails on a correct tree
 * AND would pass on a broken tree that moved the call into the bootstrapper.
 * Do NOT "fix" a check-5 failure by pointing this back at index.ts — fix the
 * wiring in server-main.ts instead. Path drift fails LOUD (…not found), never
 * silently. Plan: docs/security/ARCHITECT-ci-gating-cleanup.md §4.
 */
const SERVER_ENTRY = 'src/server/server-main.ts';

export function checkGlobalOKFSeedWired(repoRoot: string = REPO_ROOT): CheckResult {
  const seedDir = path.join(repoRoot, 'resources/global_okf_seed');
  const serverEntry = path.join(repoRoot, SERVER_ENTRY);
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

  if (!fs.existsSync(serverEntry)) {
    problems.push(`${SERVER_ENTRY} not found`);
  } else {
    const serverContent = fs.readFileSync(serverEntry, 'utf8');
    const importsIt = /import\s*\{[^}]*\bbootstrapGlobalOKFSeed\b[^}]*\}\s*from\s*['"][^'"]*global-seed['"]/.test(
      serverContent,
    );
    const callsIt = /\bbootstrapGlobalOKFSeed\s*\(/.test(serverContent);
    if (!importsIt) problems.push(`${SERVER_ENTRY} does not import bootstrapGlobalOKFSeed from global-seed`);
    if (!callsIt) problems.push(`${SERVER_ENTRY} does not call bootstrapGlobalOKFSeed()`);
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
// Check 6 (§4.4, C10): no untrusted SQL interpolation
// ---------------------------------------------------------------------------

/**
 * Explicit, approved allowlist for backtick templates passed to
 * `.prepare(` / `.exec(` that contain `${…}` interpolation. Update this
 * (with a written justification) alongside any new deliberate exception.
 * These three are the COMPLETE set of server-controlled fragment sites today:
 * all build `updates`/`filters` fragments from code literals, never from
 * request-supplied keys (plan §4.4 check 6).
 */
export const SQL_INTERPOLATION_ALLOWLIST: readonly string[] = [
  // ${runFilter}, ${taskFilter} — literal fragments built by the route itself.
  'src/server/routes/coreexec-router.ts',
  // ${updates.join()} — push()ed literals only (never request keys).
  'src/server/routes/llm.ts',
  // ${updates.join()} — push()ed literals only (never request keys).
  'src/server/routes/projects.ts',
  // ── C10 discovery: the plan's §4.4 "complete set of 3" grep missed these
  // (its pattern didn't span multi-line .prepare(` templates). Verified
  // 2026-10-07 to be the SAME literal-fragment pattern as the entries above:
  // WHERE/fragment strings are code literals and every request value is
  // bound via `?` + params.push (graph-query.ts:55-77, okf.ts:378-394).
  'src/core/okf/graph-query.ts',
  'src/server/routes/okf.ts',
  // §5-17 DEFERRED — `filterSQL = \`AND m.type = '${typeFilter}'\`` (vector.ts:130).
  // Not exploitable today (every production call site passes a literal or
  // undefined — plan §5-17), and the fix is a §5 item this plan forbids
  // folding in. Allowlisted as a RECORDED deferral: the plan expected Check 6
  // to miss this file entirely; catching it here keeps the exception visible
  // rather than silent.
  'src/core/memory/cerebro/vector.ts',
  // NOTE: transport.ts and sync.ts are DELIBERATELY absent — C1/C2 removed
  // their interpolation, and they leave this list by staying converted.
];

// Backtick template passed to .prepare( / .exec( AND containing ${
// (`[^`]` also crosses newlines, but stops at the closing backtick so a
// later unrelated template can't be matched by an earlier .prepare().
const SQL_INTERPOLATION_PATTERNS: RegExp[] = [
  /\.prepare\(\s*`[^`]*\$\{/,
  /\.exec\(\s*`[^`]*\$\{/,
];

interface SqlInterpolationFinding {
  relPath: string;
  matchedPatterns: string[];
}

/** Pure scan logic — testable against a synthetic file list (no filesystem). */
export function scanForSqlInterpolation(
  files: { relPath: string; content: string }[],
): SqlInterpolationFinding[] {
  const findings: SqlInterpolationFinding[] = [];
  for (const file of files) {
    const matched: string[] = [];
    for (const pattern of SQL_INTERPOLATION_PATTERNS) {
      if (pattern.test(file.content)) matched.push(pattern.source);
    }
    if (matched.length > 0) findings.push({ relPath: file.relPath, matchedPatterns: matched });
  }
  return findings;
}

export function checkNoUntrustedSqlInterpolation(repoRoot: string = REPO_ROOT): CheckResult {
  const files = walkFiles(path.join(repoRoot, 'src')).map((full) => ({
    relPath: path.relative(repoRoot, full).split(path.sep).join('/'),
    content: fs.readFileSync(full, 'utf8'),
  }));

  const findings = scanForSqlInterpolation(files);
  const allowlistSet = new Set(SQL_INTERPOLATION_ALLOWLIST);
  const unapproved = findings.filter((f) => !allowlistSet.has(f.relPath));
  const approvedFound = findings.filter((f) => allowlistSet.has(f.relPath));

  const describe = (f: SqlInterpolationFinding) => `${f.relPath} [${f.matchedPatterns.join(', ')}]`;

  if (unapproved.length > 0) {
    return {
      passed: false,
      message:
        `No untrusted SQL interpolation — FOUND unapproved interpolation in: ${unapproved
          .map(describe)
          .join('; ')}` +
        (approvedFound.length > 0
          ? ` (approved usage also found in: ${approvedFound.map((f) => f.relPath).join(', ')})`
          : ''),
    };
  }

  return {
    passed: true,
    message:
      approvedFound.length > 0
        ? `No untrusted SQL interpolation (${approvedFound.length} approved file(s) found: ${approvedFound
            .map((f) => f.relPath)
            .join(', ')})`
        : 'No untrusted SQL interpolation (no interpolated .prepare/.exec found in src/)',
  };
}

// ---------------------------------------------------------------------------
// Check 7 (§4.4, C10): no raw egress outside the governed door
// ---------------------------------------------------------------------------

/**
 * Explicit, approved allowlist for BARE `fetch(` outside `egressFetch`.
 * Mirrors CHILD_PROCESS_ALLOWLIST: every entry needs a written justification.
 * Entries ending in `/` are directory prefixes (the adapters wildcard).
 */
export const RAW_EGRESS_ALLOWLIST: readonly string[] = [
  // The governed door itself — the one place raw fetch is allowed (§2.3 C8-a).
  'src/core/routeswitch/egress.ts',
  // Provider adapters — raw-with-timeout is the PERMANENT provider contract
  // (P3-S4 D12: keep, never a lane build), NOT a deferred migration. Prefix entry.
  'src/core/routeswitch/adapters/',
  // Plan §4.4 lists this file; C9 converted all three eval-server sites to
  // egressFetch — entry retained per the plan (matches nothing today, and
  // documents the deliberate exception if raw fetch ever returns).
  'src/core/memory/gitnexus-client.ts',
  // §5-3 deferred MCP probe — raw fetch kept on purpose with a post-C9
  // deferral comment (see system.ts probeMcpReachability).
  'src/server/routes/system.ts',
  // Deliberate BROWSER-side module: it intentionally re-issues the user's own
  // request (including their headers) against the local API from inside the
  // page — the browser is the trust boundary there, not this server process.
  // Deviation from the plan's allowlist (documented in the C10 report).
  'src/ui/lib/api.ts',
];

// Bare fetch( — not `egressFetch(` (word char before) and not `obj.fetch(`
// (dot before). Same rationale as CHILD_PROCESS_PATTERNS' lookbehinds.
const RAW_EGRESS_PATTERN = /(?<![.\w])fetch\s*\(/;

/**
 * Strip block + line comments so prose that merely MENTIONS `fetch(url)`
 * (e.g. gate-order.ts's bug description) doesn't trip the control —
 * allowlisting such a file instead would mask a real future violation.
 * The line-comment lookbehind keeps `https://…` / `'//…'` string content
 * intact (they are not comments).
 */
export function stripComments(content: string): string {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(?<![:'"\\])\/\/[^\n]*/g, '');
}

interface RawEgressFinding {
  relPath: string;
  matchedPatterns: string[];
}

function isRawEgressAllowed(relPath: string): boolean {
  return RAW_EGRESS_ALLOWLIST.some((entry) =>
    entry.endsWith('/') ? relPath.startsWith(entry) : relPath === entry,
  );
}

/** Pure scan logic — testable against a synthetic file list (no filesystem). */
export function scanForRawFetch(files: { relPath: string; content: string }[]): RawEgressFinding[] {
  const findings: RawEgressFinding[] = [];
  for (const file of files) {
    if (RAW_EGRESS_PATTERN.test(stripComments(file.content))) {
      findings.push({ relPath: file.relPath, matchedPatterns: [RAW_EGRESS_PATTERN.source] });
    }
  }
  return findings;
}

export function checkNoRawEgress(repoRoot: string = REPO_ROOT): CheckResult {
  const files = walkFiles(path.join(repoRoot, 'src')).map((full) => ({
    relPath: path.relative(repoRoot, full).split(path.sep).join('/'),
    content: fs.readFileSync(full, 'utf8'),
  }));

  const findings = scanForRawFetch(files);
  const unapproved = findings.filter((f) => !isRawEgressAllowed(f.relPath));
  const approvedFound = findings.filter((f) => isRawEgressAllowed(f.relPath));

  const describe = (f: RawEgressFinding) => `${f.relPath} [${f.matchedPatterns.join(', ')}]`;

  if (unapproved.length > 0) {
    return {
      passed: false,
      message:
        `No raw egress outside the governed door — FOUND unapproved fetch( in: ${unapproved
          .map(describe)
          .join('; ')}` +
        (approvedFound.length > 0
          ? ` (approved usage also found in: ${approvedFound.map((f) => f.relPath).join(', ')})`
          : ''),
    };
  }

  return {
    passed: true,
    message:
      approvedFound.length > 0
        ? `No raw egress outside the governed door (${approvedFound.length} approved file(s) found: ${approvedFound
            .map((f) => f.relPath)
            .join(', ')})`
        : 'No raw egress outside the governed door (no bare fetch( found in src/)',
  };
}

// ---------------------------------------------------------------------------
// Check 8 (§4.4, C10): server binds loopback only
// ---------------------------------------------------------------------------

/**
 * C5 moved the HTTP server onto an explicit bind address. This asserts the
 * `serve({ … })` literal in server-main.ts still declares `hostname:` —
 * dropping it would silently regress the loopback-only bind (Bun/Node would
 * default to all interfaces). Cheap structural proxy, per plan §4.4.
 */
export function checkServerBindsLoopback(repoRoot: string = REPO_ROOT): CheckResult {
  const file = path.join(repoRoot, 'src/server/server-main.ts');
  const label = 'Server binds loopback only';

  if (!fs.existsSync(file)) {
    return { passed: false, message: `${label} (src/server/server-main.ts not found)` };
  }

  const stripped = stripComments(fs.readFileSync(file, 'utf8'));
  const m = /\bserve\s*\(\s*\{/.exec(stripped);
  if (!m) {
    return { passed: false, message: `${label} (no serve({ … }) literal found in server-main.ts)` };
  }

  // Walk the braces of the serve({ … }) literal to find its true extent, so
  // an unrelated hostname: elsewhere in the file can't satisfy the check.
  const braceStart = stripped.indexOf('{', m.index);
  let depth = 0;
  let braceEnd = -1;
  for (let i = braceStart; i < stripped.length; i++) {
    const ch = stripped[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        braceEnd = i;
        break;
      }
    }
  }
  const block = stripped.slice(braceStart, braceEnd === -1 ? stripped.length : braceEnd + 1);

  if (!/\bhostname\s*:/.test(block)) {
    return {
      passed: false,
      message: `${label} (serve({ … }) literal in server-main.ts has no hostname: entry)`,
    };
  }

  return { passed: true, message: `${label} (serve({ … }) literal declares hostname:)` };
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
  // §4.4 checks 6-8 (C10):
  { label: 'No untrusted SQL interpolation', run: () => checkNoUntrustedSqlInterpolation() },
  { label: 'No raw egress outside the governed door', run: () => checkNoRawEgress() },
  { label: 'Server binds loopback only', run: () => checkServerBindsLoopback() },
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
