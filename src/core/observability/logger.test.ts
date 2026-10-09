import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { db, initDB } from '../basevault/db';
import { log, currentLogLevel, writeBootLog, _resetLogLevelCache } from './logger';

// Every file-sink test redirects NEUROSYNC_LOG_DIR at a fresh tmpdir so the
// suite never touches the real .data/logs directory.
let tmpDir: string;

beforeAll(() => {
  initDB();
});

beforeEach(() => {
  setLevel('info');
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neurosync-bootlog-'));
  vi.stubEnv('NEUROSYNC_LOG_DIR', tmpDir);
});

afterAll(() => {
  vi.unstubAllEnvs();
});

function setLevel(level: string) {
  db.prepare("INSERT INTO system_settings (key, value) VALUES ('log_level', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(level);
  _resetLogLevelCache();
}

/** The single boot log file created inside the injected tmpdir. */
function bootFiles(): string[] {
  return fs.readdirSync(tmpDir).filter((f) => /^boot-\d{4}-\d{2}-\d{2}\.log$/.test(f));
}

function readBootLog(): string {
  const files = bootFiles();
  expect(files).toHaveLength(1);
  const file = files[0];
  if (file === undefined) throw new Error('expected exactly one boot log file');
  return fs.readFileSync(path.join(tmpDir, file), 'utf8');
}

/** Matches the required shape: ISO-8601 timestamp, space, "[level]" tag. */
const LINE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z \[(debug|info|warn|error)\] /;

describe('logger level gate', () => {
  it('reads the configured level from system_settings', () => {
    setLevel('warn');
    expect(currentLogLevel()).toBe('warn');
  });

  it('defaults to info when no setting exists', () => {
    // Flush the cache to a known 'info' baseline (from beforeEach's setLevel)
    // before deleting the row, so this test doesn't depend on whatever level
    // a previous test happened to leave cached.
    expect(currentLogLevel()).toBe('info');
    db.prepare("DELETE FROM system_settings WHERE key = 'log_level'").run();
    _resetLogLevelCache();
    expect(currentLogLevel()).toBe('info');
  });

  it('ignores an invalid stored value and keeps the previous cached level', () => {
    setLevel('debug');
    expect(currentLogLevel()).toBe('debug');
    db.prepare("UPDATE system_settings SET value = 'not-a-real-level' WHERE key = 'log_level'").run();
    _resetLogLevelCache();
    expect(currentLogLevel()).toBe('debug');
  });

  it('at level "warn": debug/info are suppressed, warn/error still print', () => {
    setLevel('warn');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    log.debug('debug message');
    log.info('info message');
    log.warn('warn message');
    log.error('error message');

    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith('warn message');
    expect(errorSpy).toHaveBeenCalledWith('error message');

    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('at level "silent": nothing prints, not even error', () => {
    setLevel('silent');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    log.debug('x');
    log.info('x');
    log.warn('x');
    log.error('x');

    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();

    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('at level "debug": everything prints', () => {
    setLevel('debug');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    log.debug('a');
    log.info('b');

    expect(logSpy).toHaveBeenCalledWith('a');
    expect(logSpy).toHaveBeenCalledWith('b');

    logSpy.mockRestore();
  });
});

describe('logger boot-log file sink', () => {
  // writeBootLog short-circuits to `false` under Vitest (mirroring the
  // db.ts:19 data-dir guard), so every test below that exercises the real file
  // sink must opt back in by unsetting VITEST. Empty string is falsy, so
  // `!!process.env.VITEST` is false and the mkdir/append path runs normally;
  // the fully-stubbed DB stays in-memory either way (db.ts read VITEST once at
  // module load), and afterAll's vi.unstubAllEnvs() restores the real value.
  beforeEach(() => {
    vi.stubEnv('VITEST', '');
  });

  it('writes a boot-YYYY-MM-DD.log line in ISO [level] format', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    log.info('boot line one');

    const content = readBootLog();
    const line = content.trimEnd();
    expect(LINE_RE.test(line)).toBe(true);
    expect(line.endsWith('boot line one')).toBe(true);
    // No ANSI colour codes anywhere in the file.
    expect(content).not.toMatch(/\u001b\[/);
  });

  it('appends rather than truncating, one line per call', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    log.info('first');
    log.warn('second');

    const lines = readBootLog().trimEnd().split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/\[info\] first$/);
    expect(lines[1]).toMatch(/\[warn\] second$/);
    expect(bootFiles()).toHaveLength(1);
  });

  it('respects the level gate: suppressed calls write no file line', () => {
    setLevel('warn');
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    log.debug('should not be written');
    log.info('also not written');
    log.warn('written');

    const lines = readBootLog().trimEnd().split('\n');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/\[warn\] written$/);
  });

  it('writes nothing at all when the level is silent', () => {
    setLevel('silent');
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    log.debug('x');
    log.info('x');
    log.warn('x');
    log.error('x');

    expect(bootFiles()).toHaveLength(0);
  });

  it('creates the log directory recursively when it does not exist', () => {
    const nested = path.join(tmpDir, 'deep', 'nested', 'logs');
    vi.stubEnv('NEUROSYNC_LOG_DIR', nested);
    vi.spyOn(console, 'log').mockImplementation(() => {});

    expect(fs.existsSync(nested)).toBe(false);
    log.info('nested write');

    expect(fs.existsSync(nested)).toBe(true);
    expect(fs.readdirSync(nested)).toHaveLength(1);
  });

  it('never throws when the target path is unwritable', () => {
    // Point the sink at a path that cannot be a directory (a regular file), so
    // mkdirSync fails. The sink must swallow the error, not propagate it.
    const blocker = path.join(tmpDir, 'blocker');
    fs.writeFileSync(blocker, 'not a directory');
    vi.stubEnv('NEUROSYNC_LOG_DIR', blocker);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    expect(() => log.info('boom')).not.toThrow();
    // The console sink still ran -- the file failure did not suppress stdout.
    expect(logSpy).toHaveBeenCalledWith('boom');
  });

  it('formats multiple args and objects the way console does', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    writeBootLog('info', ['count', 42, { a: 1 }]);

    const line = readBootLog().trimEnd();
    expect(LINE_RE.test(line)).toBe(true);
    expect(line).toContain('count 42 { a: 1 }');
  });
});

// ---------------------------------------------------------------------------
// VITEST guard on the file sink (mirrors db.ts:19)
// ---------------------------------------------------------------------------
// Under Vitest the boot-log sink is bypassed before any fs call, exactly like
// the data-dir guard in basevault/db.ts. Each test pins the VITEST state it
// needs explicitly, so the block does not depend on execution order, and the
// outer beforeEach has already aimed NEUROSYNC_LOG_DIR at a fresh tmpdir.
describe('writeBootLog VITEST guard', () => {
  it('returns false and creates no file when VITEST is set', () => {
    vi.stubEnv('VITEST', '1');

    expect(writeBootLog('info', ['never hits disk'])).toBe(false);
    expect(bootFiles()).toHaveLength(0);
    // The guard runs before mkdirSync, so even the tmpdir stays empty.
    expect(fs.readdirSync(tmpDir)).toHaveLength(0);
  });

  it('returns true and writes the file when VITEST is unset (prod path)', () => {
    vi.stubEnv('VITEST', '');

    expect(writeBootLog('info', ['prod path'])).toBe(true);
    const line = readBootLog().trimEnd();
    expect(LINE_RE.test(line)).toBe(true);
    expect(line.endsWith('prod path')).toBe(true);
  });

  it('still prints to the console when VITEST suppresses the file sink', () => {
    vi.stubEnv('VITEST', '1');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    log.info('console only');

    // stdout is the primary sink and must be unaffected by the file guard.
    expect(logSpy).toHaveBeenCalledWith('console only');
    expect(bootFiles()).toHaveLength(0);

    logSpy.mockRestore();
  });
});
