import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { db, initDB } from '../basevault/db';
import { getPollingIntervalMs, getConfiguredMaxConcurrent, getClaimBatchSize } from './settings';

const KEYS = ['polling_interval', 'max_concurrent', 'claim_batch_size'];

function setSetting(key: string, value: string | number) {
  db.prepare(
    "INSERT INTO system_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
  ).run(key, String(value));
}

describe('coreexec/settings — live system_settings reads for scheduler/pool tuning', () => {
  beforeAll(() => {
    initDB();
  });

  afterEach(() => {
    for (const key of KEYS) db.prepare('DELETE FROM system_settings WHERE key = ?').run(key);
  });

  describe('getPollingIntervalMs', () => {
    it('defaults to 60000 (the pre-existing hardcoded scheduler.ts interval) when unset', () => {
      expect(getPollingIntervalMs()).toBe(60000);
    });

    it('reflects a saved polling_interval', () => {
      setSetting('polling_interval', 5000);
      expect(getPollingIntervalMs()).toBe(5000);
    });

    it('floors an absurdly small/zero saved value at 1000ms so the loop can never spin', () => {
      setSetting('polling_interval', 0);
      expect(getPollingIntervalMs()).toBe(1000);
    });
  });

  describe('getConfiguredMaxConcurrent', () => {
    it('falls back to the caller-supplied default when unset', () => {
      expect(getConfiguredMaxConcurrent(7)).toBe(7);
    });

    it('reflects a saved max_concurrent, overriding the default', () => {
      setSetting('max_concurrent', 2);
      expect(getConfiguredMaxConcurrent(7)).toBe(2);
    });
  });

  describe('getClaimBatchSize', () => {
    it('defaults to unbounded when unset (pre-existing behavior: capped only by available slots)', () => {
      expect(getClaimBatchSize()).toBe(Number.MAX_SAFE_INTEGER);
    });

    it('reflects a saved claim_batch_size', () => {
      setSetting('claim_batch_size', 3);
      expect(getClaimBatchSize()).toBe(3);
    });
  });
});
