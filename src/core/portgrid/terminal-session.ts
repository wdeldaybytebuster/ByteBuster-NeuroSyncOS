import * as pty from 'node-pty';
import * as fs from 'fs';
import * as os from 'os';
import { CommandSandbox } from './sandbox';
import { scanProjectForDocs } from '../okf/project-scanner';
import { scoutEmitter } from '../scoutdaemon/sse';

/**
 * Task 8 — Interactive Embedded Terminal (PortGrid).
 *
 * Spawns a REAL interactive shell (any command, no allowlist) but confines it to
 * a single project's directory with network access removed, using a hardened
 * bubblewrap (`bwrap`) invocation.
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
 * of the project directory, a fresh /proc /dev /tmp, --clearenv, --unshare-net).
 *
 * Empirically verified containment (see the Task 8 section of the implementation
 * tracker for the pasted command output): /etc/shadow → Permission denied; paths
 * outside the project (~/.ssh, /root, the NeuroSync repo itself) → No such file;
 * writes/git inside the project work; network resolution fails.
 *
 * SECURITY: This is a human-only convenience tool. It must only ever be started by
 * an explicit human action in the UI — never auto-launched by any AI/agent code
 * path, consistent with the project's "AI actions stay draft-only" ground rule.
 */

// Idle timeout: kill a session after this long with no client input, so orphaned
// sessions (browser tab closed without a clean WS close, etc.) don't accumulate.
const IDLE_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

const BWRAP_BIN = '/usr/bin/bwrap';

// Auto-scan-on-close (the "learning loop" gap): a coding agent run through this
// terminal can change project files with no automatic path back into OKF's
// memory system today -- /api/okf/scan-project is manual-click-only. Rather
// than build a new trigger mechanism, this reuses the same in-process scan
// function on the one lifecycle event every session (WS close, WS error, and
// shell exit -- see server/index.ts) already funnels through: dispose().
// Cooldown avoids re-scanning the same project on every rapid open/close.
const AUTO_SCAN_COOLDOWN_MS = 60 * 1000;
const lastAutoScanAtByProject = new Map<string, number>();

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
  const last = lastAutoScanAtByProject.get(projectId) ?? 0;
  const now = Date.now();
  if (now - last < AUTO_SCAN_COOLDOWN_MS) return;
  lastAutoScanAtByProject.set(projectId, now);

  try {
    const result = scanProjectForDocs(projectId);
    if (result.success) {
      console.log(
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
    // not an error worth surfacing loudly on terminal close.
  } catch (err) {
    // Best-effort only: never let a scan failure affect terminal teardown.
    console.warn(`[Terminal] auto-scan failed for project ${projectId}:`, err);
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

/**
 * Build the hardened bwrap argument vector.
 *
 * Ordering note: the fresh /proc, /dev and /tmp mounts are declared BEFORE the
 * project --bind so that, even if a project directory happens to live under /tmp,
 * the read-write project bind is layered last and always wins.
 */
export function buildBwrapArgs(projectDir: string, shell: string): string[] {
  const username = (() => {
    try { return os.userInfo().username; } catch { return 'user'; }
  })();
  const lang = process.env.LANG || 'C.UTF-8';
  const term = process.env.TERM || 'xterm-256color';

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
    // Wipe inherited environment (may contain server secrets / provider API keys)
    // and set only a clean, minimal env for the interactive shell.
    '--clearenv',
    '--setenv', 'HOME', projectDir,
    '--setenv', 'PWD', projectDir,
    '--setenv', 'PATH', '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
    '--setenv', 'TERM', term,
    '--setenv', 'USER', username,
    '--setenv', 'LOGNAME', username,
    '--setenv', 'LANG', lang,
    '--setenv', 'SHELL', shell,
    // Isolation: no network, own PID namespace, and die if the server process dies
    // (guards against orphaned bwrap/shell processes even on an abrupt server kill).
    '--unshare-net',
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

    this.idleTimer = setTimeout(() => this.dispose('idle-timeout'), IDLE_TIMEOUT_MS);
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
    this.idleTimer = setTimeout(() => this.dispose('idle-timeout'), IDLE_TIMEOUT_MS);
    this.idleTimer.unref();
  }

  dispose(reason: string = 'closed'): void {
    if (this.disposed) return;
    this.disposed = true;
    clearTimeout(this.idleTimer);
    try {
      this.pty.kill();
    } catch {
      /* already dead */
    }
    terminalSessions.delete(this.id);
    console.log(`[Terminal] session ${this.id} disposed (${reason})`);
    triggerAutoScan(this.projectId);
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
  console.log(`[Terminal] session ${id} started for project ${projectId} → ${projectDir}`);
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
