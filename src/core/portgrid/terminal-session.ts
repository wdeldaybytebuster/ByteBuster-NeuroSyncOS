import * as pty from 'node-pty';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { CommandSandbox } from './sandbox';
import { scanProjectForDocs, computeProjectDocSignal } from '../okf/project-scanner';
import { scoutEmitter } from '../scoutdaemon/sse';
import { log } from '../observability/logger';

/**
 * Task 8 — Interactive Embedded Terminal (PortGrid).
 *
 * Spawns a REAL interactive shell (any command, no allowlist), confined to a
 * single project's directory (the ONLY writable path) by a hardened bubblewrap
 * (`bwrap`) invocation. FILESYSTEM CONFINEMENT is and remains the primary
 * security boundary of this terminal.
 *
 * ── Network is DELIBERATELY OPEN (not an oversight) ───────────────────────────
 * This terminal historically ran with `--unshare-net`, fully cutting the shell
 * off from the network. That was REMOVED by an explicit, documented product
 * decision (see the commit that introduced this comment). Rationale: the entire
 * point of this embedded terminal is that the user never has to leave NeuroSync
 * to drive their other CLI coding agents (claude, codex, opencode, freebuff,
 * agy, …). Those agents fundamentally require outbound access to their own APIs
 * to do real work — a network-cut sandbox lets them install and print
 * `--version` but never complete a single real request, which defeats the
 * feature. So a process inside this terminal now has UNRESTRICTED network
 * access, exactly as if run outside any sandbox. This is intentional and is NOT
 * a regression of the filesystem hardening below, which is unchanged.
 *
 * ── Why this does NOT reuse CommandSandbox's bwrap invocation ──────────────────
 * `CommandSandbox.execute()` spawns commands with:
 *     bwrap --unshare-net --dev-bind / / <cmd>
 * `--dev-bind / /` binds the ENTIRE host filesystem read-write into the sandbox,
 * so it provides ZERO filesystem containment. CommandSandbox is only safe because
 * it also (a) enforces a ~20-command read-only allowlist and (b) validates every
 * file argument with PathValidator.validateContainment(). Neither of those layers
 * is possible here: the user deliberately chose a full interactive shell (no
 * allowlist), and you cannot pre-validate arbitrary interactive keystrokes the way
 * you can validate one command's arguments. Therefore directory containment for the
 * terminal MUST come from bwrap itself doing real filesystem confinement — which the
 * CommandSandbox pattern does not do. This module uses a genuinely different, more
 * restrictive bwrap recipe (ro-bind of /usr + /etc only, a single read-write --bind
 * of the project directory, a fresh /proc /dev /tmp, --clearenv). Unlike
 * CommandSandbox it does NOT add `--unshare-net` (see the network note above).
 *
 * Empirically verified filesystem containment (see the empirical test suite at
 * the bottom of terminal-session.test.ts, which runs live where bwrap is
 * present): /etc/shadow → Permission denied; paths outside the project
 * (~/.ssh, /root, the NeuroSync repo itself) → No such file; writes/git inside
 * the project work. Network is open by design and a live test asserts that too.
 *
 * SECURITY: This is a human-only convenience tool. It must only ever be started by
 * an explicit human action in the UI — never auto-launched by any AI/agent code
 * path, consistent with the project's "AI actions stay draft-only" ground rule.
 */

// Idle timeout: kill a session after this long with no client input, so orphaned
// sessions (browser tab closed without a clean WS close, etc.) don't accumulate.
const IDLE_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

// Bounded fallback for dispose(): the bwrap child normally exits within a few ms
// of pty.kill(), and dispose() resolves the instant node-pty reports that exit.
// This cap only matters in the pathological case where the exit event never
// arrives, so teardown can't hang forever.
const DISPOSE_EXIT_TIMEOUT_MS = 5000;

const BWRAP_BIN = '/usr/bin/bwrap';

// Auto-scan-on-close (the "learning loop" gap): a coding agent run through this
// terminal can change project files with no automatic path back into OKF's
// memory system today -- /api/okf/scan-project is manual-click-only. Rather
// than build a new trigger mechanism, this reuses the same in-process scan
// function on the one lifecycle event every session (WS close, WS error, and
// shell exit -- see server/index.ts) already funnels through: dispose().
//
// The cooldown avoids re-scanning the same project on every rapid open/close,
// but it is CHANGE-AWARE, not purely time-based. The original implementation
// skipped any second close within 60s regardless of whether files had actually
// changed -- so two sessions for the same project closing inside that window
// meant the second session's real file changes were silently missed (confirmed
// in the 24-scenario reality test). Now a close is skipped ONLY when the
// project's doc-file fingerprint is unchanged since the last scan AND we're
// still inside the cooldown window; a changed fingerprint always forces a
// re-scan, even inside the window, which closes that failure mode.
const AUTO_SCAN_COOLDOWN_MS = 60 * 1000;
interface AutoScanRecord {
  at: number;
  signal: string | null;
}
const lastAutoScanByProject = new Map<string, AutoScanRecord>();

/**
 * Broadcasts a TERMINAL_AUTO_SCAN event over the existing ScoutDaemon SSE
 * channel (scoutEmitter -> /api/scout/events -> any open dashboard's
 * EventSource) so the frontend can show "Project scanned" feedback -- this
 * is NOT silent magic, and it doesn't depend on the terminal's own WebSocket
 * still being open (by the time dispose() runs, that socket may already be
 * closed/closing).
 */
// Exported (not called externally in production) so it's testable without
// needing a real bwrap-spawned pty session.
export function triggerAutoScan(projectId: string): void {
  const now = Date.now();

  try {
    // Cheap change-detection fingerprint of the project's doc files (null when
    // the project has no root path -- then we can't tell, so we don't skip).
    const signal = computeProjectDocSignal(projectId);
    const last = lastAutoScanByProject.get(projectId);

    // Skip ONLY when nothing has changed since the last successful scan AND we
    // are still inside the cooldown window. A changed fingerprint forces a
    // re-scan even within the window -- this is the fix for the "two rapid
    // closes, second one's real changes silently missed" bug (a time-based-only
    // cooldown had no way to notice the second close carried new changes).
    if (
      last &&
      signal !== null &&
      last.signal === signal &&
      now - last.at < AUTO_SCAN_COOLDOWN_MS
    ) {
      return;
    }

    const result = scanProjectForDocs(projectId);
    if (result.success) {
      // Record the fingerprint we just scanned, so the next close can tell
      // whether anything changed relative to this scan.
      lastAutoScanByProject.set(projectId, { at: now, signal });
      log.info(
        `[Terminal] auto-scan for project ${projectId}: ${result.totalFound} doc(s) found, ${result.unprocessedCount} unprocessed`,
      );
      scoutEmitter.emit('update', {
        type: 'TERMINAL_AUTO_SCAN',
        projectId,
        totalFound: result.totalFound,
        unprocessedCount: result.unprocessedCount,
      });
    }
    // If the project has no project_root_path configured, scanProjectForDocs
    // returns success:false -- not every project is scannable, and that's
    // not an error worth surfacing loudly on terminal close. We deliberately
    // do NOT record a cooldown entry in that case, so a project that later
    // gains a root path is scanned promptly on its next close.
  } catch (err) {
    // Best-effort only: never let a scan failure affect terminal teardown.
    log.warn(`[Terminal] auto-scan failed for project ${projectId}:`, err);
  }
}

export interface TerminalSessionOptions {
  cols?: number;
  rows?: number;
}

export function isBwrapAvailable(): boolean {
  try {
    return fs.existsSync(BWRAP_BIN);
  } catch {
    return false;
  }
}

function resolveShell(): string {
  const candidate = process.env.SHELL;
  if (candidate && fs.existsSync(candidate)) return candidate;
  if (fs.existsSync('/bin/bash')) return '/bin/bash';
  return '/bin/sh';
}

// System-only PATH: the value used when no extra Node toolchain bind applies.
// Kept identical to the terminal's historical PATH so the "nvm absent" shape is
// byte-for-byte today's behavior.
const SYSTEM_PATH = '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin';

/**
 * The directory containing the currently-running Node binary.
 *
 * On this host — and commonly for global npm installs — this same directory
 * also holds the CLI tools installed alongside Node (`npx`, `opencode`, and
 * `claude`), regardless of whether Node is nvm-managed, a distro package, or a
 * standalone install. Using `path.dirname(process.execPath)` resolves it
 * generically: no hardcoded nvm paths, usernames, or version numbers, and it
 * generalizes to non-nvm setups (a system Node with tools installed beside it
 * resolves to the right place too). On hosts where this yields a directory that
 * doesn't exist / isn't readable (nvm absent, unusual layout), buildBwrapArgs
 * treats it as absent and no-ops — no extra bind, PATH unchanged.
 */
export function currentNodeBinDir(): string {
  return path.dirname(process.execPath);
}

/**
 * The user's `~/.local/bin` directory.
 *
 * A common install location for directly-executable user CLI tools (e.g. `agy`)
 * that live as REAL files there, not as symlinks into a package dir. Resolved
 * generically from `os.homedir()` — never a hardcoded username. Like
 * `currentNodeBinDir()`, buildBwrapArgs treats it as absent and no-ops (no bind,
 * PATH unchanged) on hosts where it doesn't exist / isn't readable.
 */
export function currentLocalBinDir(): string {
  return path.join(os.homedir(), '.local', 'bin');
}

// True only for a real, readable, executable-searchable directory. Used to
// decide whether the optional Node-toolchain bind applies; any failure (missing
// path, not a dir, permission error) degrades to `false` → graceful no-op.
function isBindableDir(dir: string): boolean {
  try {
    if (!fs.statSync(dir).isDirectory()) return false;
    fs.accessSync(dir, fs.constants.R_OK | fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Build the hardened bwrap argument vector.
 *
 * Ordering note: the fresh /proc, /dev and /tmp mounts are declared BEFORE the
 * project --bind so that, even if a project directory happens to live under /tmp,
 * the read-write project bind is layered last and always wins.
 *
 * ── Toolchain binds (opt-in per host shape) ───────────────────────────────────
 * Because PATH is cleared to system dirs only, CLI coding tools installed under
 * an nvm-managed (or otherwise non-system) Node — e.g. `claude`, `codex`, `npx`
 * — do not resolve inside the terminal even though the host has them. To fix
 * this WITHOUT widening filesystem containment more than strictly necessary, we
 * add up to THREE READ-ONLY (never writable) binds, each guarded by the same
 * existence/readability check and each a clean no-op when its dir is absent:
 *
 *   1. `nodeBinDir` (default `currentNodeBinDir()`): the dir holding the running
 *      `node` binary and the CLI tools installed beside it. Bound read-only and
 *      PREPENDED TO PATH, so its executables (real binaries like `node`, and
 *      directly-runnable tools) are found first.
 *   2. `<node-install-root>/lib/node_modules` — the sibling package dir derived
 *      generically as `path.join(path.dirname(nodeBinDir), 'lib', 'node_modules')`
 *      (standard nvm/Node layout: `<root>/bin/node` + `<root>/lib/node_modules/…`).
 *      nvm lays out its launchers as `bin/claude -> ../lib/node_modules/@…/bin/…`;
 *      without this bind those symlinks dangle inside the sandbox (only `bin/`
 *      would be reachable) and `claude`/`codex` fail to launch. Binding this dir
 *      read-only makes them resolve. It is NOT added to PATH — no executables
 *      live directly here; the `bin/` symlinks just need their targets reachable.
 *      This deliberately exposes globally-installed npm package CODE read-only:
 *      that is exactly the point (the user wants those agents runnable) and is an
 *      accepted, documented tradeoff — it is read-only, so nothing can be altered.
 *   3. `localBinDir` (default `currentLocalBinDir()` = `~/.local/bin`): where
 *      directly-executable user tools (e.g. `agy`, a real file — not a symlink)
 *      live. Bound read-only and PREPENDED TO PATH so those tools are found.
 *
 * We bind ONLY these specific dirs — never the whole nvm tree, NVM_DIR, or $HOME.
 * All three are read-only, so the shell cannot replace `node`/tools inside them.
 * When a dir is absent/unreadable (e.g. no nvm, no `~/.local/bin`) that bind
 * no-ops individually: no mount, and PATH is only prepended for dirs that exist.
 * Tools under `/usr/lib/node_modules` (e.g. `opencode`, `freebuff`) already work
 * because all of `/usr` is read-only bound; their derived lib dir de-dupes below.
 */
export function buildBwrapArgs(
  projectDir: string,
  shell: string,
  nodeBinDir: string | null = currentNodeBinDir(),
  localBinDir: string | null = currentLocalBinDir(),
): string[] {
  const username = (() => {
    try { return os.userInfo().username; } catch { return 'user'; }
  })();
  const lang = process.env.LANG || 'C.UTF-8';
  const term = process.env.TERM || 'xterm-256color';

  // Optional toolchain exposure (see the block comment above). Default: system-
  // only PATH and no extra binds — i.e. exactly today's behavior on a host that
  // has none of these dirs. Each bind is READ-ONLY and independently no-ops.
  const extraBinds: string[] = [];
  const pathPrefixes: string[] = [];

  // Bind `dir` read-only unless it's already reachable via an existing mount
  // (the read-write project bind, or the read-only /usr / /etc binds). Returns
  // true if `dir` exists and is usable (freshly bound OR already reachable), so
  // callers can decide whether to also surface it on PATH.
  const bindRoIfPresent = (dir: string | null): boolean => {
    if (!dir || !isBindableDir(dir)) return false;
    const alreadyBound =
      dir === projectDir || dir.startsWith(projectDir + path.sep) ||
      dir === '/usr' || dir.startsWith('/usr/') ||
      dir === '/etc' || dir.startsWith('/etc/');
    if (!alreadyBound) extraBinds.push('--ro-bind', dir, dir);
    return true;
  };

  // 1. Node toolchain bin dir → bind + PATH (its executables live here).
  if (bindRoIfPresent(nodeBinDir) && nodeBinDir) {
    pathPrefixes.push(nodeBinDir);
  }

  // 2. Sibling <node-root>/lib/node_modules → bind ONLY (no PATH): lets nvm's
  //    `bin/claude -> ../lib/node_modules/…` symlinks resolve. Derived from the
  //    same nodeBinDir; skipped entirely when nodeBinDir is null/absent.
  if (nodeBinDir) {
    const nodeLibModules = path.join(path.dirname(nodeBinDir), 'lib', 'node_modules');
    bindRoIfPresent(nodeLibModules);
  }

  // 3. ~/.local/bin → bind + PATH (holds directly-executable tools like `agy`).
  if (bindRoIfPresent(localBinDir) && localBinDir) {
    pathPrefixes.push(localBinDir);
  }

  // Prepend discovered dirs so their tools take precedence; system dirs remain.
  const pathValue = pathPrefixes.length ? `${pathPrefixes.join(':')}:${SYSTEM_PATH}` : SYSTEM_PATH;

  return [
    // Read-only OS: everything the shell and tools need to run, nothing writable.
    '--ro-bind', '/usr', '/usr',
    // Merged-/usr layout on this host (/bin, /lib, /lib64 are symlinks into /usr).
    '--symlink', 'usr/bin', '/bin',
    '--symlink', 'usr/lib', '/lib',
    '--symlink', 'usr/lib64', '/lib64',
    // Read-only /etc so the shell finds terminfo, passwd (for whoami/HOME), etc.
    // /etc/shadow remains unreadable because the session runs as the same
    // non-root uid — verified: `cat /etc/shadow` → Permission denied.
    '--ro-bind', '/etc', '/etc',
    // Fresh virtual filesystems (declared before the project bind — see above).
    '--proc', '/proc',
    '--dev', '/dev',
    '--tmpfs', '/tmp',
    // The ONLY writable host path: this project's directory.
    '--bind', projectDir, projectDir,
    '--chdir', projectDir,
    // Read-only binds for the current toolchain dirs, where applicable (empty
    // array = no-op when nvm / lib dir / ~/.local/bin are absent).
    ...extraBinds,
    // Wipe inherited environment (may contain server secrets / provider API keys)
    // and set only a clean, minimal env for the interactive shell.
    '--clearenv',
    '--setenv', 'HOME', projectDir,
    '--setenv', 'PWD', projectDir,
    '--setenv', 'PATH', pathValue,
    '--setenv', 'TERM', term,
    '--setenv', 'USER', username,
    '--setenv', 'LOGNAME', username,
    '--setenv', 'LANG', lang,
    '--setenv', 'SHELL', shell,
    // Isolation: own PID namespace, and die if the server process dies (guards
    // against orphaned bwrap/shell processes even on an abrupt server kill).
    // NOTE: `--unshare-net` is DELIBERATELY ABSENT — network is left fully open
    // by explicit product decision so the CLI coding agents the user drives from
    // this terminal (claude, codex, …) can reach their own APIs and actually
    // work end-to-end. See the "Network is DELIBERATELY OPEN" note at file top.
    // This does not weaken filesystem confinement, which is unchanged above.
    '--unshare-pid',
    '--die-with-parent',
    '--',
    shell,
  ];
}

export class TerminalSession {
  readonly id: string;
  readonly projectId: string;
  readonly pty: pty.IPty;
  readonly projectDir: string;
  private idleTimer: NodeJS.Timeout;
  private disposed = false;
  // Set once node-pty reports the bwrap process has actually exited. dispose()
  // uses this to know whether it still needs to wait for teardown or the child
  // is already gone (e.g. the user typed `exit`, so onExit fired before close).
  private ptyExited = false;

  constructor(id: string, projectId: string, projectDir: string, opts: TerminalSessionOptions) {
    this.id = id;
    this.projectId = projectId;
    this.projectDir = projectDir;

    const shell = resolveShell();
    const args = buildBwrapArgs(projectDir, shell);

    this.pty = pty.spawn(BWRAP_BIN, args, {
      name: process.env.TERM || 'xterm-256color',
      cols: opts.cols && opts.cols > 0 ? opts.cols : 80,
      rows: opts.rows && opts.rows > 0 ? opts.rows : 24,
      cwd: projectDir,
      // node-pty passes this to the bwrap process; --clearenv wipes it for the
      // shell, so this only affects bwrap itself. Kept minimal regardless.
      env: { TERM: process.env.TERM || 'xterm-256color', PATH: process.env.PATH || '/usr/bin:/bin' },
    });

    // node-pty's onExit supports multiple listeners; this internal one just
    // records that the child is truly gone (see dispose()'s wait logic). The
    // WS server registers its own onExit separately via session.onExit().
    this.pty.onExit(() => {
      this.ptyExited = true;
    });

    this.idleTimer = setTimeout(() => { void this.dispose('idle-timeout'); }, IDLE_TIMEOUT_MS);
    this.idleTimer.unref();

    // Track every session in the global registry so it is always reapable on
    // server shutdown, regardless of how it was constructed.
    terminalSessions.set(this.id, this);
  }

  onData(cb: (data: string) => void): void {
    this.pty.onData(cb);
  }

  onExit(cb: (code: number, signal?: number) => void): void {
    this.pty.onExit(({ exitCode, signal }) => cb(exitCode, signal));
  }

  write(data: string): void {
    if (this.disposed) return;
    this.bumpIdle();
    this.pty.write(data);
  }

  resize(cols: number, rows: number): void {
    if (this.disposed) return;
    if (!Number.isFinite(cols) || !Number.isFinite(rows) || cols <= 0 || rows <= 0) return;
    try {
      this.pty.resize(Math.floor(cols), Math.floor(rows));
    } catch {
      /* pty may already be gone */
    }
  }

  private bumpIdle(): void {
    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => { void this.dispose('idle-timeout'); }, IDLE_TIMEOUT_MS);
    this.idleTimer.unref();
  }

  /**
   * Tear the session down and RESOLVE ONLY once the bwrap child has actually
   * exited. This is intentionally async: `pty.kill()` merely sends a signal, and
   * the bwrap process (its own PID namespace via `--unshare-pid`, cwd + fresh
   * /proc /dev /tmp mounts layered under the project bind) takes a moment to
   * exit and release the project directory. A synchronous dispose returned while
   * the child was still tearing down, so any caller that then removed the
   * project dir raced live mounts/handles inside it -- the source of the
   * intermittent `ENOTEMPTY` failures in the empirical-containment tests.
   * Awaiting real exit (not a fixed sleep) closes that race; a bounded fallback
   * guarantees dispose never hangs if `onExit` somehow never fires.
   *
   * External callers (WS close/error, shell exit, server shutdown) fire-and-
   * forget it, which is fine -- `pty.kill()` is still issued synchronously below
   * so the signal goes out immediately regardless of whether anyone awaits.
   */
  async dispose(reason: string = 'closed'): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    clearTimeout(this.idleTimer);

    await this.killAndAwaitExit();

    terminalSessions.delete(this.id);
    log.info(`[Terminal] session ${this.id} disposed (${reason})`);
    triggerAutoScan(this.projectId);
  }

  // Send the kill signal (synchronously) and resolve once the child is confirmed
  // gone. Resolves immediately if it already exited; otherwise waits for the
  // node-pty exit event, with a bounded timeout fallback so teardown can never
  // block forever on a stuck child.
  private killAndAwaitExit(): Promise<void> {
    if (this.ptyExited) {
      try { this.pty.kill(); } catch { /* already dead */ }
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        clearTimeout(fallback);
        resolve();
      };
      const fallback = setTimeout(done, DISPOSE_EXIT_TIMEOUT_MS);
      fallback.unref();
      this.pty.onExit(() => done());
      try {
        this.pty.kill();
      } catch {
        // Already dead and onExit may never fire for this late listener --
        // resolve now rather than wait out the fallback.
        done();
      }
    });
  }
}

// Global registry so every live session can be reaped on server shutdown.
export const terminalSessions = new Map<string, TerminalSession>();

let seq = 0;

/**
 * Create a project-scoped interactive terminal session.
 * Throws if bwrap is unavailable or the project cannot be resolved to a directory.
 */
export function createTerminalSession(projectId: string, opts: TerminalSessionOptions = {}): TerminalSession {
  if (!isBwrapAvailable()) {
    throw new Error('Terminal unavailable: bubblewrap (bwrap) is not installed on this host.');
  }

  // Reuse the existing, audited project-path resolver — do NOT reimplement.
  const projectDir = CommandSandbox.resolveCwd(projectId);
  if (!projectDir || !fs.existsSync(projectDir)) {
    throw new Error(`Terminal unavailable: project directory does not exist for project ${projectId}.`);
  }

  const id = `${Date.now().toString(36)}-${(++seq).toString(36)}`;
  const session = new TerminalSession(id, projectId, projectDir, opts); // self-registers
  log.info(`[Terminal] session ${id} started for project ${projectId} → ${projectDir}`);
  return session;
}

/** Kill every live session. Registered on server shutdown. */
export function disposeAllTerminalSessions(): void {
  for (const session of [...terminalSessions.values()]) {
    session.dispose('server-shutdown');
  }
}

let shutdownHooked = false;
export function installTerminalShutdownHooks(): void {
  if (shutdownHooked) return;
  shutdownHooked = true;
  const bye = () => disposeAllTerminalSessions();
  process.on('exit', bye);
  process.on('SIGINT', () => { bye(); process.exit(0); });
  process.on('SIGTERM', () => { bye(); process.exit(0); });
}
