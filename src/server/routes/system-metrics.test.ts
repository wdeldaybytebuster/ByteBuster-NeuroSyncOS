import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { db, initDB } from '../../core/basevault/db';
import { systemRouter, systemConfig } from './system';

beforeAll(() => {
  initDB();
});

async function get(path: string): Promise<{ status: number; data: any }> {
  const res = await systemRouter.request(path);
  return { status: res.status, data: await res.json() };
}

async function post(path: string, body: any): Promise<{ status: number; data: any }> {
  const res = await systemRouter.request(path, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json() };
}

// Proves the polling-compatible plain-GET counterpart to the SSE
// `/metrics` stream exists and returns the same shape a single SSE
// `telemetry` tick would — ScoutDaemon's "polling" Sensory Modality
// (src/ui/views/scoutTelemetry.ts) depends on this instead of holding an
// EventSource open.
describe('GET /metrics/snapshot', () => {
  it('returns a single JSON snapshot with the telemetry shape (not a stream)', async () => {
    const res = await get('/metrics/snapshot');
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.metrics).toBeDefined();
    expect(typeof res.data.metrics.utilization).toBe('number');
    expect(typeof res.data.metrics.cores).toBe('number');
    expect(res.data.metrics.pool).toBeDefined();
    expect(typeof res.data.metrics.pool.workerNodes).toBe('number');
  });
});

// Proves UnifiedMasterDashboard's "Max Concurrent Tasks" setting genuinely
// changes CoreExec's live concurrency gate (systemConfig.maxWorkers, read by
// engine.ts's dispatch loop every tick) — previously saved to system_settings
// but never read by anything; systemConfig.maxWorkers always stayed at the
// hardware-safe cpus-1 default.
describe('POST /settings max_concurrent — live concurrency gate', () => {
  const originalMaxWorkers = systemConfig.maxWorkers;

  afterEach(() => {
    systemConfig.maxWorkers = originalMaxWorkers;
    db.prepare("DELETE FROM system_settings WHERE key = 'max_concurrent'").run();
  });

  it('immediately updates systemConfig.maxWorkers — no restart needed', async () => {
    const res = await post('/settings', { max_concurrent: 2 });
    expect(res.status).toBe(200);
    expect(systemConfig.maxWorkers).toBe(2);

    // And it's durably persisted for the next server boot too.
    const row = db.prepare("SELECT value FROM system_settings WHERE key = 'max_concurrent'").get() as any;
    expect(row.value).toBe('2');
  });

  it('ignores a non-numeric/zero/negative max_concurrent instead of corrupting the live gate', async () => {
    systemConfig.maxWorkers = 5;
    await post('/settings', { max_concurrent: 'not-a-number' });
    expect(systemConfig.maxWorkers).toBe(5);

    await post('/settings', { max_concurrent: 0 });
    expect(systemConfig.maxWorkers).toBe(5);
  });

  it('daemon/restart restores the saved max_concurrent (not always the raw hardware default)', async () => {
    await post('/settings', { max_concurrent: 3 });
    // Simulate a kill (parks everything), then restart.
    await post('/daemon/kill', {});
    expect(systemConfig.maxWorkers).toBe(0);

    const restartRes = await post('/daemon/restart', {});
    expect(restartRes.data.maxWorkers).toBe(3);
    expect(systemConfig.maxWorkers).toBe(3);
  });
});
