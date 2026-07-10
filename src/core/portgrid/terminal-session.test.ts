import { describe, it, expect, afterEach, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import crypto from 'crypto';
import {
  buildBwrapArgs,
  currentNodeBinDir,
  currentLocalBinDir,
  isBwrapAvailable,
  TerminalSession,
  terminalSessions,
  triggerAutoScan,
} from './terminal-session';
import { db, initDB } from '../basevault/db';
import { scoutEmitter } from '../scoutdaemon/sse';

// ─── Task 8 — Embedded Terminal sandbox ──────────────────────────────────────
// The terminal spawns a REAL interactive shell (no allowlist), so DIRECTORY
// containment MUST come from bwrap itself. These tests prove the hardened bwrap
// recipe differs from CommandSandbox's unsafe `--dev-bind / /` invocation, and
// (where bwrap is present) empirically prove filesystem containment.
//
// NETWORK is intentionally NOT contained: `--unshare-net` was removed by an
// explicit product decision so the CLI coding agents driven from this terminal
// can reach their own APIs. These tests assert `--unshare-net` is ABSENT and, on
// hosts with bwrap, that outbound network actually works inside a live session.
// ─────────────────────────────────────────────────────────────────────────────

describe('terminal-session — hardened bwrap recipe', () => {
  const args = buildBwrapArgs('/tmp/proj', '/bin/bash');
  const joined = args.join(' ');

  it('does NOT bind the whole host filesystem (no --dev-bind / /)', () => {
    // This is the exact CommandSandbox flag that provides ZERO fs containment.
    expect(joined).not.toContain('--dev-bind / /');
    expect(args).not.toContain('--dev-bind');
  });

  it('read-only binds /usr and /etc only, not writable', () => {
    expect(joined).toContain('--ro-bind /usr /usr');
    expect(joined).toContain('--ro-bind /etc /etc');
  });

  it('makes exactly the project dir the single writable host bind', () => {
    expect(joined).toContain('--bind /tmp/proj /tmp/proj');
    expect(joined).toContain('--chdir /tmp/proj');
  });

  it('leaves network OPEN (no --unshare-net) but still wipes inherited env', () => {
    // FLIPPED (was: expect --unshare-net present). Network isolation was removed
    // by explicit product decision — the CLI agents driven from this terminal
    // need outbound access to their own APIs. Filesystem confinement (below) is
    // unchanged; only the network boundary was dropped. See the file-top note.
    expect(args).not.toContain('--unshare-net');
    // Env wipe and lifecycle guards are unaffected by the network change.
    expect(args).toContain('--clearenv');
    expect(args).toContain('--die-with-parent');
    expect(args).toContain('--unshare-pid');
  });

  it('sets HOME to the project dir (not the real host home)', () => {
    expect(joined).toContain('--setenv HOME /tmp/proj');
  });

  it('ends by exec-ing the requested shell', () => {
    expect(args[args.length - 1]).toBe('/bin/bash');
  });
});

// ─── Node toolchain bin bind (opt-in per host shape) ─────────────────────────
// The terminal clears PATH to system dirs only, which hides CLI tools installed
// under an nvm-managed / non-system Node (claude, codex, npx, …). We add a
// read-only bind of the current Node bin dir and prepend it to PATH — and it
// must no-op cleanly (no bind, unchanged PATH) when that dir is absent. These
// tests pass localBinDir=null to isolate the node-bin axis (the ~/.local/bin
// bind is covered by its own describe block below).
const SYSTEM_PATH = '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin';

function pathValueOf(args: string[]): string {
  const i = args.indexOf('PATH');
  // The value immediately follows the 'PATH' key in the flattened --setenv list.
  return args[i + 1] ?? '';
}

describe('terminal-session — Node toolchain bin bind', () => {
  it('currentNodeBinDir() returns the dir of the running node binary', () => {
    expect(currentNodeBinDir()).toBe(path.dirname(process.execPath));
  });

  it('adds a READ-ONLY bind for an existing node bin dir and prepends it to PATH', () => {
    // Use a real, guaranteed-existing directory so the readability check passes.
    const bin = path.dirname(process.execPath);
    const args = buildBwrapArgs('/tmp/proj', '/bin/bash', bin, null);
    const joined = args.join(' ');
    expect(joined).toContain(`--ro-bind ${bin} ${bin}`);
    // Must NOT be a writable --bind of the toolchain dir (shell can't replace node).
    expect(joined).not.toContain(`--bind ${bin} ${bin}`);
    // PATH is prepended with the bin dir; system dirs are retained after it.
    expect(pathValueOf(args)).toBe(`${bin}:${SYSTEM_PATH}`);
  });

  it('no-ops (no extra bind, unchanged PATH) when the dir does not exist', () => {
    const missing = '/definitely/not/a/real/node/bin/xyzzy';
    const args = buildBwrapArgs('/tmp/proj', '/bin/bash', missing, null);
    expect(args.join(' ')).not.toContain(missing);
    expect(pathValueOf(args)).toBe(SYSTEM_PATH);
  });

  it('no-ops when both toolchain dirs are null (nvm-absent / non-nvm host shape)', () => {
    // Both optional dirs null → the truly-minimal recipe: only /usr and /etc
    // are ro-bound, PATH is system-only, exactly today's no-toolchain behavior.
    const args = buildBwrapArgs('/tmp/proj', '/bin/bash', null, null);
    expect(pathValueOf(args)).toBe(SYSTEM_PATH);
    // Only /usr and /etc are ro-bound; no third ro-bind was introduced.
    const roBinds = args.filter((a) => a === '--ro-bind').length;
    expect(roBinds).toBe(2);
  });

  it('does NOT create a duplicate bind when the dir is already covered by /usr, but still surfaces it on PATH', () => {
    const args = buildBwrapArgs('/tmp/proj', '/bin/bash', '/usr/bin', null);
    expect(args.join(' ')).not.toContain('--ro-bind /usr/bin /usr/bin');
    expect(pathValueOf(args)).toBe(`/usr/bin:${SYSTEM_PATH}`);
  });

  it('preserves every other containment property when the bind is added', () => {
    const bin = path.dirname(process.execPath);
    const args = buildBwrapArgs('/tmp/proj', '/bin/bash', bin, null);
    expect(args).toContain('--clearenv');
    // Network is intentionally OPEN now — assert --unshare-net is ABSENT while
    // every *filesystem*/lifecycle containment property is still intact.
    expect(args).not.toContain('--unshare-net');
    expect(args).toContain('--unshare-pid');
    expect(args).toContain('--die-with-parent');
    expect(args.join(' ')).toContain('--bind /tmp/proj /tmp/proj'); // single writable bind intact
    expect(args.join(' ')).not.toContain('--dev-bind');
  });
});

// ─── nvm lib/node_modules sibling bind + ~/.local/bin bind ───────────────────
// Two additional read-only binds make ALL the user's CLI agents resolve:
//   • <node-root>/lib/node_modules — target of nvm's `bin/claude -> ../lib/...`
//     symlinks (bound, NOT on PATH: no executables live directly there).
//   • ~/.local/bin — holds directly-executable tools like `agy` (bound + PATH).
// Both mirror the node-bin bind: read-only, existence/readability-guarded, and
// a clean no-op when absent. Fixtures use temp dirs so results are host-agnostic.
describe('terminal-session — nvm lib/node_modules + ~/.local/bin binds', () => {
  const scratch: string[] = [];
  afterEach(() => {
    for (const d of scratch.splice(0)) {
      if (fs.existsSync(d)) fs.rmSync(d, { recursive: true, force: true });
    }
  });

  // Build a fake nvm-style install root: <root>/bin (holds node) and
  // <root>/lib/node_modules (holds package code that bin/ symlinks point into).
  function fakeNodeRoot(withLib: boolean): { binDir: string; libModules: string } {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ns-noderoot-'));
    scratch.push(root);
    const binDir = path.join(root, 'bin');
    fs.mkdirSync(binDir);
    const libModules = path.join(root, 'lib', 'node_modules');
    if (withLib) fs.mkdirSync(libModules, { recursive: true });
    return { binDir, libModules };
  }

  it('currentLocalBinDir() resolves to ~/.local/bin under the real home dir', () => {
    expect(currentLocalBinDir()).toBe(path.join(os.homedir(), '.local', 'bin'));
  });

  it('read-only binds <node-root>/lib/node_modules and does NOT add it to PATH', () => {
    const { binDir, libModules } = fakeNodeRoot(true);
    const args = buildBwrapArgs('/tmp/proj', '/bin/bash', binDir, null);
    const joined = args.join(' ');
    // Bound read-only (never writable) so `bin/*` symlinks resolve into it.
    expect(joined).toContain(`--ro-bind ${libModules} ${libModules}`);
    expect(joined).not.toContain(`--bind ${libModules} ${libModules}`);
    // The bin dir is on PATH; the lib dir is deliberately NOT (no exes live there).
    expect(pathValueOf(args)).toBe(`${binDir}:${SYSTEM_PATH}`);
    expect(pathValueOf(args)).not.toContain(libModules);
  });

  it('no-ops the lib bind when <node-root>/lib/node_modules is absent', () => {
    const { binDir, libModules } = fakeNodeRoot(false); // lib/node_modules NOT created
    const args = buildBwrapArgs('/tmp/proj', '/bin/bash', binDir, null);
    expect(args.join(' ')).not.toContain(libModules);
    // The bin dir itself still binds + surfaces on PATH.
    expect(args.join(' ')).toContain(`--ro-bind ${binDir} ${binDir}`);
    expect(pathValueOf(args)).toBe(`${binDir}:${SYSTEM_PATH}`);
  });

  it('read-only binds ~/.local/bin and prepends it to PATH when present', () => {
    const localBin = fs.mkdtempSync(path.join(os.tmpdir(), 'ns-localbin-'));
    scratch.push(localBin);
    // nodeBinDir=null to isolate the localBin axis.
    const args = buildBwrapArgs('/tmp/proj', '/bin/bash', null, localBin);
    const joined = args.join(' ');
    expect(joined).toContain(`--ro-bind ${localBin} ${localBin}`);
    expect(joined).not.toContain(`--bind ${localBin} ${localBin}`); // never writable
    expect(pathValueOf(args)).toBe(`${localBin}:${SYSTEM_PATH}`);   // on PATH: real exes live here
  });

  it('no-ops (no bind, unchanged PATH) when ~/.local/bin is absent', () => {
    const missing = '/definitely/not/a/real/local/bin/xyzzy';
    const args = buildBwrapArgs('/tmp/proj', '/bin/bash', null, missing);
    expect(args.join(' ')).not.toContain(missing);
    expect(pathValueOf(args)).toBe(SYSTEM_PATH);
  });

  it('prepends node bin then ~/.local/bin (in that order) when both are present', () => {
    const { binDir } = fakeNodeRoot(true);
    const localBin = fs.mkdtempSync(path.join(os.tmpdir(), 'ns-localbin-'));
    scratch.push(localBin);
    const args = buildBwrapArgs('/tmp/proj', '/bin/bash', binDir, localBin);
    expect(pathValueOf(args)).toBe(`${binDir}:${localBin}:${SYSTEM_PATH}`);
  });
});

describe('terminal-session — availability guard', () => {
  it('isBwrapAvailable returns a boolean', () => {
    expect(typeof isBwrapAvailable()).toBe('boolean');
  });
});

// Empirical containment — only runs where bwrap is actually installed.
const bwrap = isBwrapAvailable();
const maybe = bwrap ? describe : describe.skip;

maybe('terminal-session — empirical containment (bwrap present)', () => {
  let tmpDir: string;
  let session: TerminalSession | null = null;

  afterEach(async () => {
    // MUST await: dispose() now resolves only once the bwrap child has actually
    // exited and released the project dir. Removing tmpDir before that (as the
    // old synchronous dispose allowed) raced live mounts/handles inside it and
    // caused the intermittent `ENOTEMPTY` cleanup failures this suite was known
    // for. Awaiting real exit is the fix, not a sleep.
    await session?.dispose('test-cleanup');
    session = null;
    if (tmpDir && fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function collect(s: TerminalSession, ms: number): Promise<string> {
    return new Promise((resolve) => {
      let out = '';
      s.onData((d) => { out += d; });
      setTimeout(() => resolve(out), ms);
    });
  }

  // Like collect(), but resolves as soon as `done(buf)` is satisfied (robust to
  // slow shell startup), falling back to the max timeout otherwise.
  function collectUntil(s: TerminalSession, done: (buf: string) => boolean, maxMs: number): Promise<string> {
    return new Promise((resolve) => {
      let out = '';
      let settled = false;
      const finish = () => { if (!settled) { settled = true; resolve(out); } };
      s.onData((d) => { out += d; if (done(out)) finish(); });
      setTimeout(finish, maxMs);
    });
  }

  it('confines to project dir and blocks /etc/shadow', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ns-term-'));
    // NOTE: constructs TerminalSession directly to bypass the DB-backed
    // resolveCwd() — the sandbox behaviour under test is independent of it.
    session = new TerminalSession('test-1', 'test-project', tmpDir, { cols: 80, rows: 24 });
    const outP = collect(session, 2500);
    session.write('pwd\n');
    session.write('cat /etc/shadow; echo SHADOW_EXIT=$?\n');
    const out = await outP;

    expect(out).toContain(tmpDir);           // pwd is inside the project dir
    expect(out).toMatch(/Permission denied|SHADOW_EXIT=1/); // shadow unreadable
    expect(terminalSessions.has('test-1')).toBe(true);
  }, 8000);

  it('resolves the bound Node bin dir via PATH inside the sandbox', async () => {
    // Positive-case proof that the ro-bind + PATH prepend actually works
    // end-to-end: the `node` binary in the bound dir must resolve and run.
    // Resolve as soon as the expected marker appears (robust to slow shell
    // startup under load), with a hard timeout fallback.
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ns-term-'));
    session = new TerminalSession('test-node', 'test-project', tmpDir, { cols: 80, rows: 24 });
    const expectedNode = path.join(currentNodeBinDir(), 'node');
    // Match the RESULT ('NODE_EXIT=0'), not the pty's echo of the typed command
    // (which contains the literal 'NODE_EXIT=$?').
    const p = collectUntil(session, (buf) => /NODE_EXIT=\d/.test(buf), 9000);
    session.write('command -v node; echo NODE_EXIT=$?\n');
    const settled = await p;

    expect(settled).toContain(expectedNode);   // resolves to the bound node, via PATH
    expect(settled).toMatch(/NODE_EXIT=0/);    // and it actually executes
  }, 12000);

  it('leaves the host network reachable inside the sandbox (no netns isolation)', async () => {
    // Positive proof that `--unshare-net` was removed. Deterministic and with NO
    // dependency on any external host being reachable (so it can't flake on DNS
    // or egress policy in CI): with `--unshare-net` the sandbox gets a fresh,
    // EMPTY network namespace whose only interface is a down `lo`, so
    // /proc/net/dev lists nothing but `lo`. WITHOUT it, the shell shares the
    // host netns and its real interfaces are visible. We assert ≥1 non-loopback
    // interface appears — which is true iff network isolation is off.
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ns-term-'));
    session = new TerminalSession('test-net', 'test-project', tmpDir, { cols: 80, rows: 24 });
    const p = collectUntil(session, (buf) => /NETDEV_DONE/.test(buf), 9000);
    // Emit each non-loopback interface name from /proc/net/dev, then a marker.
    session.write(
      "awk -F: 'NR>2{gsub(/ /,\"\",$1); if($1!=\"lo\") print \"IFACE=\" $1}' /proc/net/dev; echo NETDEV_DONE\n",
    );
    const out = await p;
    expect(out).toContain('NETDEV_DONE');   // command ran to completion
    expect(out).toMatch(/IFACE=\S+/);        // ≥1 real (non-lo) host interface visible
  }, 12000);

  it('dispose() kills the session and removes it from the registry', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ns-term-'));
    session = new TerminalSession('test-2', 'test-project', tmpDir, {});
    expect(terminalSessions.has('test-2')).toBe(true);
    // dispose() is now async (resolves once the child has truly exited); the
    // registry entry is removed as part of that, so await it before asserting.
    await session.dispose('test');
    expect(terminalSessions.has('test-2')).toBe(false);
  });
});

// ─── Auto-scan-on-close (the "learning loop" gap) ────────────────────────────
// Tests triggerAutoScan directly rather than via a real pty session -- the
// scan-trigger logic is independent of bwrap/pty and shouldn't need either.
describe('terminal-session — auto-scan-on-close', () => {
  beforeAll(() => {
    initDB();
  });

  function makeScannableProject(): { projectId: string; rootPath: string } {
    const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), 'ns-term-autoscan-'));
    const projectId = crypto.randomUUID();
    db.prepare('INSERT INTO projects (id, name, project_root_path, created_at) VALUES (?, ?, ?, ?)').run(
      projectId,
      'Auto-scan Test Project',
      rootPath,
      Date.now(),
    );
    fs.writeFileSync(path.join(rootPath, 'agent-made-change.md'), '# a change');
    return { projectId, rootPath };
  }

  it('broadcasts a TERMINAL_AUTO_SCAN event over scoutEmitter with real scan results', async () => {
    const { projectId, rootPath } = makeScannableProject();
    const received: any[] = [];
    const onUpdate = (data: any) => received.push(data);
    scoutEmitter.on('update', onUpdate);

    try {
      triggerAutoScan(projectId);
    } finally {
      scoutEmitter.off('update', onUpdate);
      fs.rmSync(rootPath, { recursive: true, force: true });
    }

    const event = received.find((d) => d.type === 'TERMINAL_AUTO_SCAN' && d.projectId === projectId);
    expect(event).toBeDefined();
    expect(event.totalFound).toBe(1);
    expect(event.unprocessedCount).toBe(1);
  });

  it('does not re-scan the same project within the cooldown window', async () => {
    const { projectId, rootPath } = makeScannableProject();
    const received: any[] = [];
    const onUpdate = (data: any) => received.push(data);
    scoutEmitter.on('update', onUpdate);

    try {
      triggerAutoScan(projectId);
      triggerAutoScan(projectId); // immediate second call -- should be a no-op
    } finally {
      scoutEmitter.off('update', onUpdate);
      fs.rmSync(rootPath, { recursive: true, force: true });
    }

    const events = received.filter((d) => d.type === 'TERMINAL_AUTO_SCAN' && d.projectId === projectId);
    expect(events.length).toBe(1);
  });

  it('re-scans within the cooldown window when files actually changed (change-aware)', () => {
    // Regression test for the "two rapid closes, second one's real changes
    // silently missed" bug. Two triggerAutoScan calls happen well inside the
    // 60s cooldown window (no fake timers, no sleeps -- back to back), but a new
    // doc file is written between them, exactly as a second terminal session's
    // coding agent would. The OLD purely-time-based cooldown skipped the second
    // call outright, so this asserted length would have been 1 (the new file
    // silently missed). The change-aware cooldown detects the changed
    // fingerprint and re-scans, so it is 2 and the second scan sees the new file.
    const { projectId, rootPath } = makeScannableProject(); // starts with 1 doc
    const received: any[] = [];
    const onUpdate = (data: any) => received.push(data);
    scoutEmitter.on('update', onUpdate);

    try {
      triggerAutoScan(projectId); // scan #1: sees the 1 initial doc
      // A second session's agent writes a brand-new doc, still inside the 60s
      // cooldown window relative to scan #1.
      fs.writeFileSync(path.join(rootPath, 'second-session-change.md'), '# new agent work');
      triggerAutoScan(projectId); // must NOT be skipped: real changes exist
    } finally {
      scoutEmitter.off('update', onUpdate);
      fs.rmSync(rootPath, { recursive: true, force: true });
    }

    const events = received.filter((d) => d.type === 'TERMINAL_AUTO_SCAN' && d.projectId === projectId);
    expect(events.length).toBe(2); // OLD BUG: was 1 (blind time-based skip)
    expect(events[0].totalFound).toBe(1); // first scan saw the initial doc
    expect(events[1].totalFound).toBe(2); // second scan picked up the new file
  });

  it('does not throw or emit when the project has no project_root_path', () => {
    const projectId = crypto.randomUUID();
    db.prepare('INSERT INTO projects (id, name, created_at) VALUES (?, ?, ?)').run(
      projectId,
      'No Root Path Terminal Project',
      Date.now(),
    );
    const received: any[] = [];
    const onUpdate = (data: any) => received.push(data);
    scoutEmitter.on('update', onUpdate);

    expect(() => triggerAutoScan(projectId)).not.toThrow();
    scoutEmitter.off('update', onUpdate);

    expect(received.some((d) => d.type === 'TERMINAL_AUTO_SCAN' && d.projectId === projectId)).toBe(false);
  });
});
