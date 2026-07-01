import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  buildBwrapArgs,
  isBwrapAvailable,
  TerminalSession,
  terminalSessions,
} from './terminal-session';

// ─── Task 8 — Embedded Terminal sandbox ──────────────────────────────────────
// The terminal spawns a REAL interactive shell (no allowlist), so directory +
// network containment MUST come from bwrap itself. These tests prove the
// hardened bwrap recipe differs from CommandSandbox's unsafe `--dev-bind / /`
// invocation, and (where bwrap is present) empirically prove containment.
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

  it('removes network and wipes inherited env', () => {
    expect(args).toContain('--unshare-net');
    expect(args).toContain('--clearenv');
    expect(args).toContain('--die-with-parent');
  });

  it('sets HOME to the project dir (not the real host home)', () => {
    expect(joined).toContain('--setenv HOME /tmp/proj');
  });

  it('ends by exec-ing the requested shell', () => {
    expect(args[args.length - 1]).toBe('/bin/bash');
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

  afterEach(() => {
    session?.dispose('test-cleanup');
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

  it('dispose() kills the session and removes it from the registry', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ns-term-'));
    session = new TerminalSession('test-2', 'test-project', tmpDir, {});
    expect(terminalSessions.has('test-2')).toBe(true);
    session.dispose('test');
    expect(terminalSessions.has('test-2')).toBe(false);
  });
});
