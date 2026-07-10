import { describe, it, expect, beforeAll } from 'vitest';
import { initDB } from '../../core/basevault/db';
import { systemRouter } from './system';

beforeAll(() => {
  initDB();
});

async function get(path: string): Promise<{ status: number; data: any }> {
  const res = await systemRouter.request(path);
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
