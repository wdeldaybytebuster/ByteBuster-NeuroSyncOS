/**
 * Live reads of the 3 CoreExec scheduler/pool-tuning settings from
 * UnifiedMasterDashboard's Set-up view (Control A, "Global Polling &
 * Concurrency Limits"): polling_interval, max_concurrent, claim_batch_size.
 * These used to be saved to system_settings and never read by anything —
 * scheduler.ts hardcoded a 60s cron-refresh interval, engine.ts's dispatch
 * loop had no separate per-tick claim cap, and systemConfig.maxWorkers was
 * always `cpus-1` regardless of what was saved.
 *
 * Each getter re-reads system_settings fresh (a single indexed SQLite
 * SELECT — microseconds on better-sqlite3) rather than caching, so a saved
 * change takes effect on the very next scheduler tick / dispatch loop
 * iteration without a server restart. Every getter falls back to the exact
 * pre-existing hardcoded value when the key has never been saved, so an
 * unconfigured install behaves identically to before this feature existed.
 */
import { db } from '../basevault/db';

function readIntSetting(key: string, fallback: number, min: number): number {
  try {
    const row = db.prepare('SELECT value FROM system_settings WHERE key = ?').get(key) as
      | { value: string }
      | undefined;
    if (!row) return fallback;
    const n = Number(row.value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, n);
  } catch {
    return fallback;
  }
}

/** CoreExec's cron-refresh (`refreshJobs`) polling cadence, ms. Default 60000
 * reproduces scheduler.ts's pre-existing hardcoded `setInterval(refreshJobs, 60000)`.
 * Floored at 1000ms so a bad/zero saved value can never spin the refresh loop. */
export function getPollingIntervalMs(): number {
  return readIntSetting('polling_interval', 60000, 1000);
}

/** Max concurrent DAG tasks executing at once (engine.ts's `systemConfig.maxWorkers`
 * gate). `defaultValue` is the caller's pre-existing hardware-safe default
 * (`Math.max(1, cpus-1)`) so an unset setting changes nothing. */
export function getConfiguredMaxConcurrent(defaultValue: number): number {
  return readIntSetting('max_concurrent', defaultValue, 1);
}

/** Max tasks claimed off the eligible queue per engine.ts dispatch tick.
 * Defaults to HARDWARE_SAFE_MAX_WORKERS (Axiom-6 ceiling: cpus-1, min 1) so
 * an unset setting can never claim an unbounded batch and saturate the
 * libuv threadpool / heap on a constrained edge node. Previously unbounded
 * (Number.MAX_SAFE_INTEGER — capped only by availableSlots); a saved value
 * still overrides explicitly. Floored at 1. */
export function getClaimBatchSize(): number {
  return readIntSetting('claim_batch_size', HARDWARE_SAFE_MAX_WORKERS, 1);
}

import os from 'os';
export const HARDWARE_SAFE_MAX_WORKERS = Math.max(1, os.cpus().length - 1);

// In-memory config state. `maxWorkers` is CoreExec's real live concurrency
// gate (engine.ts's dispatch loop reads it every tick).
export const systemConfig = {
  maxWorkers: getConfiguredMaxConcurrent(HARDWARE_SAFE_MAX_WORKERS),
};
