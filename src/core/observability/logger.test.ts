import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { db, initDB } from '../basevault/db';
import { log, currentLogLevel, _resetLogLevelCache } from './logger';

beforeAll(() => {
  initDB();
});

function setLevel(level: string) {
  db.prepare("INSERT INTO system_settings (key, value) VALUES ('log_level', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(level);
  _resetLogLevelCache();
}

beforeEach(() => {
  setLevel('info');
});

describe('logger', () => {
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
