/**
 * §2.2(h) / §4.2 — Argon2id memory budget (the Axiom-6 safety proof).
 *
 * Argon2id at memoryCost 2^16 allocates 64 MiB of NATIVE memory per verify,
 * which the `--max-old-space-size=512` guard does not bound. The only thing
 * keeping peak Argon2 RSS at exactly 1 × 64 MiB on this 6.3 GiB box is the
 * promise-chain mutex in credentials.ts — so this test launches 8 concurrent
 * verifies and asserts the instrumented counter never exceeds 1.
 *
 * Deleting the mutex (or wrapping it so verification runs eagerly) makes
 * `maxPending` > 1 and this test fails.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  hashPassword,
  verifyOperator,
  getVerifyBudget,
  invalidateCredentialCache,
  __resetAuthForTests,
} from './credentials';
import { db, initDB, dbPath } from '../../core/basevault/db';

const PASSWORD = 'budget-proof-passphrase';

describe('C6 Argon2id serialized verify budget (§2.2(h))', () => {
  beforeAll(async () => {
    initDB();
    const hash = await hashPassword(PASSWORD);
    db.prepare(
      "INSERT OR REPLACE INTO system_settings (key, value) VALUES ('operator_credential', ?)"
    ).run(hash);
    invalidateCredentialCache();
  });

  beforeEach(() => {
    __resetAuthForTests();
  });

  afterAll(() => {
    db.close();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    if (fs.existsSync(dbPath + '-wal')) fs.unlinkSync(dbPath + '-wal');
    if (fs.existsSync(dbPath + '-shm')) fs.unlinkSync(dbPath + '-shm');
  });

  it('8 concurrent verifyOperator() calls all resolve AND never exceed one in-flight Argon2 verify', async () => {
    const results = await Promise.all(
      Array.from({ length: 8 }, () => verifyOperator(PASSWORD))
    );
    expect(results).toEqual(Array(8).fill(true));

    const budget = getVerifyBudget();
    expect(budget.maxPending).toBe(1);
    expect(budget.pending).toBe(0);
  });

  it('a wrong password resolves false, still through the single-flight mutex', async () => {
    expect(await verifyOperator('not-the-password-at-all')).toBe(false);
    const budget = getVerifyBudget();
    expect(budget.maxPending).toBe(1);
    expect(budget.pending).toBe(0);
  });

  it('a missing credential short-circuits to false without ever entering the KDF', async () => {
    db.prepare("DELETE FROM system_settings WHERE key = 'operator_credential'").run();
    invalidateCredentialCache();
    expect(await verifyOperator(PASSWORD)).toBe(false);
    expect(getVerifyBudget().maxPending).toBe(0);
  });
});
