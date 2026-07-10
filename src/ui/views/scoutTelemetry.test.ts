import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { normalizeSensoryMode, startTelemetrySubscription, TelemetryEventSourceLike } from './scoutTelemetry';

describe('normalizeSensoryMode', () => {
  it('passes through known modes', () => {
    expect(normalizeSensoryMode('sse')).toBe('sse');
    expect(normalizeSensoryMode('polling')).toBe('polling');
    expect(normalizeSensoryMode('manual')).toBe('manual');
  });

  it('defaults to sse for unset/unknown values (today\'s only real behavior)', () => {
    expect(normalizeSensoryMode(undefined)).toBe('sse');
    expect(normalizeSensoryMode(null)).toBe('sse');
    expect(normalizeSensoryMode('bogus')).toBe('sse');
    expect(normalizeSensoryMode(true)).toBe('sse');
  });
});

describe('startTelemetrySubscription', () => {
  let onUpdate: (data: any) => void;
  let fetchSnapshot: () => Promise<unknown>;

  beforeEach(() => {
    onUpdate = vi.fn((_data: any) => {});
    fetchSnapshot = vi.fn(async () => ({ utilization: 42 }));
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("sse mode: opens exactly one EventSource and never polls (today's behavior)", () => {
    const close = vi.fn();
    let telemetryHandler: ((evt: { data: string }) => void) | null = null;
    const fakeEs: TelemetryEventSourceLike = {
      addEventListener: (_evt, cb) => { telemetryHandler = cb; },
      close,
    };
    const openEventSource = vi.fn().mockReturnValue(fakeEs);

    const sub = startTelemetrySubscription('sse', { openEventSource, fetchSnapshot, onUpdate });

    expect(openEventSource).toHaveBeenCalledTimes(1);
    expect(fetchSnapshot).not.toHaveBeenCalled();

    // Simulate a server push.
    telemetryHandler!({ data: JSON.stringify({ utilization: 77 }) });
    expect(onUpdate).toHaveBeenCalledWith({ utilization: 77 });

    // No automatic polling ever happens in sse mode, even after time passes.
    vi.advanceTimersByTime(60000);
    expect(fetchSnapshot).not.toHaveBeenCalled();

    sub.stop();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('polling mode: never opens an EventSource, polls fetchSnapshot on an interval', async () => {
    const openEventSource = vi.fn();

    const sub = startTelemetrySubscription('polling', {
      openEventSource, fetchSnapshot, onUpdate, pollIntervalMs: 5000,
    });

    expect(openEventSource).not.toHaveBeenCalled();
    expect(fetchSnapshot).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchSnapshot).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledWith({ utilization: 42 });

    await vi.advanceTimersByTimeAsync(10000);
    expect(fetchSnapshot).toHaveBeenCalledTimes(3);

    sub.stop();
    await vi.advanceTimersByTimeAsync(20000);
    expect(fetchSnapshot).toHaveBeenCalledTimes(3); // stopped — no further polls
  });

  it('manual mode: NO automatic update ever happens without an explicit refreshNow() call', async () => {
    const openEventSource = vi.fn();

    const sub = startTelemetrySubscription('manual', { openEventSource, fetchSnapshot, onUpdate });

    expect(openEventSource).not.toHaveBeenCalled();

    // Let a long time pass — nothing should fire automatically.
    await vi.advanceTimersByTimeAsync(120000);
    expect(fetchSnapshot).not.toHaveBeenCalled();
    expect(onUpdate).not.toHaveBeenCalled();

    // Explicit trigger IS the only way telemetry updates in manual mode.
    await sub.refreshNow();
    expect(fetchSnapshot).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledWith({ utilization: 42 });

    // stop() is a harmless no-op in manual mode.
    expect(() => sub.stop()).not.toThrow();
  });
});
