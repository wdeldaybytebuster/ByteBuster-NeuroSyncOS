/**
 * P2-2 — centralized shutdown contract.
 *
 * NEVER imports server-main.ts (it binds a port and starts a scheduler).
 * All handles are fakes; exit is injected so the runner is never killed.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import {
  gracefulShutdown,
  installShutdownHandlers,
  isDraining,
  shutdownDrainingMiddleware,
  _resetShutdownForTests,
  type ShutdownHandles,
} from './shutdown';

function fakeServer() {
  return {
    closeAllConnectionsCalls: 0,
    closeCalls: 0,
    closeAllConnections() {
      this.closeAllConnectionsCalls++;
    },
    close(cb?: (err?: Error) => void) {
      this.closeCalls++;
      cb?.();
    },
  };
}

function trackingHandle() {
  const calls: string[] = [];
  const stop = (name: string) => () => {
    calls.push(name);
  };
  const handles: ShutdownHandles = {
    stopHeartbeat: stop('heartbeat'),
    stopMdns: stop('mdns'),
    stopTransport: stop('transport'),
    stopIdle: stop('idle'),
    stopReflection: stop('reflection'),
    stopScheduler: stop('scheduler'),
    stopGitnexusWorker: stop('gitnexus'),
    stopWorkerPool: stop('worker'),
    checkpointAndCloseDb: stop('db'),
  };
  return { calls, handles };
}

describe('shutdownDrainingMiddleware (draining flag → 503)', () => {
  beforeEach(() => _resetShutdownForTests());

  function scratchApp() {
    const app = new Hono();
    app.use('*', shutdownDrainingMiddleware);
    app.get('/api/ping', (c) => c.json({ ok: true }));
    return app;
  }

  it('passes requests through while not draining', async () => {
    expect(isDraining()).toBe(false);
    const res = await scratchApp().request('/api/ping');
    expect(res.status).toBe(200);
  });

  it('returns 503 for new work once shutdown has begun', async () => {
    const exits: number[] = [];
    await gracefulShutdown({}, { exit: (c) => exits.push(c) });
    expect(isDraining()).toBe(true);
    const res = await scratchApp().request('/api/ping');
    expect(res.status).toBe(503);
    expect(exits).toEqual([0]);
  });
});

describe('gracefulShutdown (single owner)', () => {
  beforeEach(() => _resetShutdownForTests());

  it('runs every stop, closes the server (connections first), checkpoints, then exits once', async () => {
    const server = fakeServer();
    const { calls, handles } = trackingHandle();
    const exits: number[] = [];

    await gracefulShutdown({ ...handles, server }, { exit: (c) => exits.push(c) });

    expect(calls).toEqual([
      'heartbeat', 'idle', 'reflection', 'scheduler', 'mdns',
      'transport', 'gitnexus', 'worker', 'db',
    ]);
    expect(server.closeAllConnectionsCalls).toBe(1);
    expect(server.closeCalls).toBe(1);
    expect(exits).toEqual([0]);
  });

  it('is re-entrant safe: a second signal collapses into the first run (single exit)', async () => {
    const server = fakeServer();
    const { handles } = trackingHandle();
    const exits: number[] = [];
    const exit = (c: number): void => {
      exits.push(c);
    };

    await Promise.all([
      gracefulShutdown({ ...handles, server }, { exit }),
      gracefulShutdown({ ...handles, server }, { exit }),
    ]);
    expect(exits).toEqual([0]);
    expect(server.closeCalls).toBe(1);
  });

  it('a throwing stop does not veto later stops, checkpoint, or exit', async () => {
    const { calls, handles } = trackingHandle();
    const exits: number[] = [];
    const noisy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      await gracefulShutdown(
        {
          ...handles,
          stopScheduler: () => {
            throw new Error('scheduler stuck');
          },
        },
        { exit: (c) => exits.push(c) },
      );
    } finally {
      noisy.mockRestore();
    }
    // scheduler threw mid-sequence but everything after it still ran.
    expect(calls).toEqual([
      'heartbeat', 'idle', 'reflection',
      'mdns', 'transport', 'gitnexus', 'worker', 'db',
    ]);
    expect(exits).toEqual([0]);
  });

  it('works with no handles at all (defaults: real terminal dispose no-ops, real exit injected)', async () => {
    const exits: number[] = [];
    await gracefulShutdown({}, { exit: (c) => exits.push(c) });
    expect(exits).toEqual([0]);
    expect(isDraining()).toBe(true);
  });
});

describe('installShutdownHandlers (single SIGINT/SIGTERM owner)', () => {
  beforeEach(() => _resetShutdownForTests());

  it('registers exactly one listener per signal', () => {
    const beforeInt = process.listeners('SIGINT');
    const beforeTerm = process.listeners('SIGTERM');
    installShutdownHandlers({});
    installShutdownHandlers({});
    const addedInt = process.listeners('SIGINT').filter((l) => !beforeInt.includes(l));
    const addedTerm = process.listeners('SIGTERM').filter((l) => !beforeTerm.includes(l));
    expect(addedInt).toHaveLength(1);
    expect(addedTerm).toHaveLength(1);
    // Clean up exactly what this module added so other suites are unaffected.
    for (const l of addedInt) process.removeListener('SIGINT', l);
    for (const l of addedTerm) process.removeListener('SIGTERM', l);
  });
});
