import { db } from '../basevault/db';

// UnifiedMasterDashboard's "Log Level" control (system_settings.log_level) used
// to save a value that nothing in the backend ever read -- it looked like a
// real setting but had zero effect. This module is what makes it real: every
// call site migrated to use `log` below is gated by the currently-configured
// level instead of always printing via a bare console.* call.
const LEVELS = ['debug', 'info', 'warn', 'error', 'silent'] as const;
export type LogLevel = (typeof LEVELS)[number];

const DEFAULT_LEVEL: LogLevel = 'info';
const CACHE_TTL_MS = 2000;

let cachedLevel: LogLevel = DEFAULT_LEVEL;
let cachedAt = 0;

function isLogLevel(value: unknown): value is LogLevel {
  return typeof value === 'string' && (LEVELS as readonly string[]).includes(value);
}

/**
 * Current log level, re-read from system_settings at most once per
 * CACHE_TTL_MS so a level change made via the UI takes effect within a
 * couple of seconds without a DB read on every single log call.
 */
export function currentLogLevel(): LogLevel {
  const now = Date.now();
  if (now - cachedAt > CACHE_TTL_MS) {
    cachedAt = now;
    try {
      const row = db.prepare("SELECT value FROM system_settings WHERE key = 'log_level'").get() as
        | { value: string }
        | undefined;
      if (row && isLogLevel(row.value)) cachedLevel = row.value;
    } catch {
      // DB not initialized yet (e.g. very early boot) -- keep the default.
    }
  }
  return cachedLevel;
}

/** Test-only: force the cache to re-read on the next call. */
export function _resetLogLevelCache(): void {
  cachedAt = 0;
}

function shouldLog(messageLevel: Exclude<LogLevel, 'silent'>): boolean {
  const threshold = currentLogLevel();
  if (threshold === 'silent') return false;
  return LEVELS.indexOf(messageLevel) >= LEVELS.indexOf(threshold);
}

export const log = {
  debug: (...args: unknown[]): void => {
    if (shouldLog('debug')) console.log(...args);
  },
  info: (...args: unknown[]): void => {
    if (shouldLog('info')) console.log(...args);
  },
  warn: (...args: unknown[]): void => {
    if (shouldLog('warn')) console.warn(...args);
  },
  error: (...args: unknown[]): void => {
    if (shouldLog('error')) console.error(...args);
  },
};
