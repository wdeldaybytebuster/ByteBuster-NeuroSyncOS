import { db } from '../basevault/db';
import fs from 'fs';
import path from 'path';
import { format } from 'util';

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

// ---------------------------------------------------------------------------
// Boot-log file sink
// ---------------------------------------------------------------------------
// Every call that passes the level gate is *also* appended to
// .data/logs/boot-YYYY-MM-DD.log so a boot/crash leaves a durable trail even
// when stdout has scrolled away or the process was launched detached. The
// console output above is untouched and remains the primary sink.
//
// Deliberate constraints (Phase G):
//   - `appendFileSync` only. Never a rotating stream: no rotation, no
//     truncation, so the boot log is a complete append-only record.
//   - Any I/O failure (read-only .data, ENOSPC, a path hijacked by a test via
//     NEUROSYNC_LOG_DIR) is swallowed. A log sink must never be the reason a
//     boot fails, so `writeBootLog` is total: it cannot throw.
//   - No ANSI colours ever -- the file is a plain, greppable audit trail.
//   - No new dependencies: fs/path/util are Node built-ins.

/** Directory holding the boot logs. Overridable so tests can inject a tmpdir. */
function bootLogDir(): string {
  return process.env.NEUROSYNC_LOG_DIR ?? path.join(process.cwd(), '.data', 'logs');
}

/** `.data/logs/boot-YYYY-MM-DD.log` in local time, so a "boot day" matches the operator's day. */
function bootLogPath(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return path.join(bootLogDir(), `boot-${stamp}.log`);
}

/**
 * Append one line to today's boot log. Returns true if the line was written.
 * Total function: catches every error and returns false instead of throwing.
 */
export function writeBootLog(level: string, args: unknown[]): boolean {
  try {
    const dir = bootLogDir();
    fs.mkdirSync(dir, { recursive: true });
    const line = `${new Date().toISOString()} [${level}] ${format(...args)}\n`;
    fs.appendFileSync(bootLogPath(), line);
    return true;
  } catch {
    // A log sink must never take down the caller -- see the block comment above.
    return false;
  }
}

/** Mirror every console call through to the boot log. */
function emit(level: string, args: unknown[]): void {
  writeBootLog(level, args);
}

export const log = {
  debug: (...args: unknown[]): void => {
    if (shouldLog('debug')) {
      console.log(...args);
      emit('debug', args);
    }
  },
  info: (...args: unknown[]): void => {
    if (shouldLog('info')) {
      console.log(...args);
      emit('info', args);
    }
  },
  warn: (...args: unknown[]): void => {
    if (shouldLog('warn')) {
      console.warn(...args);
      emit('warn', args);
    }
  },
  error: (...args: unknown[]): void => {
    if (shouldLog('error')) {
      console.error(...args);
      emit('error', args);
    }
  },
};
