import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { MDNSDiscovery } from './mdns-discovery';
import { db, initDB } from '../db';
import { setSyncEnabled } from './sync-consent';

/**
 * §2.1-C4 — mDNS must not auto-trust (or even beacon) when sync is off.
 *
 * The DNS socket factory is injectable so these tests never open a real UDP
 * socket: gating, beacon interval lifecycle and stop() are all verified on a
 * fake.
 */

type Handler = (...args: any[]) => void;

function makeFakeDns() {
  const handlers = new Map<string, Handler[]>();
  const fake = {
    on(evt: string, cb: Handler) {
      const list = handlers.get(evt) ?? [];
      list.push(cb);
      handlers.set(evt, list);
      return fake;
    },
    respond: vi.fn(),
    query: vi.fn(),
    destroy: vi.fn(),
    emit(evt: string, data: any) {
      for (const cb of handlers.get(evt) ?? []) cb(data);
    },
    handlerCount(evt: string) {
      return (handlers.get(evt) ?? []).length;
    },
  };
  return fake;
}

let factoryCalls: ReturnType<typeof makeFakeDns>[];
const factory = () => {
  const fake = makeFakeDns();
  factoryCalls.push(fake);
  return fake;
};

beforeAll(() => { initDB(); });

beforeEach(() => {
  factoryCalls = [];
  db.prepare(`DELETE FROM system_settings WHERE key IN ('sync_enabled','sync_allow_public')`).run();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('MDNSDiscovery — §2.1-C4 gating', () => {
  it('sync DISABLED (absent sync_enabled): start() is a total no-op — no socket, no beacon', () => {
    const disc = new MDNSDiscovery(3743, factory);
    const before = vi.getTimerCount();
    disc.start();
    expect(factoryCalls).toHaveLength(0); // the 5 s beacon + answer path never exist
    expect(vi.getTimerCount()).toBe(before);
    expect(disc.getDiscoveredNodes()).toEqual([]);
    expect(() => disc.stop()).not.toThrow(); // null-safe stop
  });

  it('sync ENABLED: start() opens the socket and beacons every 5 s; stop() clears the interval', () => {
    setSyncEnabled(db, true);
    const disc = new MDNSDiscovery(3743, factory);
    disc.start();
    expect(factoryCalls).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(1);

    vi.advanceTimersByTime(5000);
    expect(factoryCalls[0]!.query).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(5000);
    expect(factoryCalls[0]!.query).toHaveBeenCalledTimes(2);

    // start() twice must not stack listeners or intervals (registry-style idempotency)
    disc.start();
    expect(factoryCalls).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(1);

    disc.stop();
    expect(factoryCalls[0]!.destroy).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    expect(() => disc.stop()).not.toThrow(); // idempotent
  });

  it('a query for our service is answered (enabled only)', () => {
    setSyncEnabled(db, true);
    const disc = new MDNSDiscovery(3743, factory);
    disc.start();
    factoryCalls[0]!.emit('query', {
      questions: [{ name: 'neurosync._webrtc._udp.local', type: 'SRV' }],
    });
    expect(factoryCalls[0]!.respond).toHaveBeenCalledTimes(1);
    disc.stop();
  });

  it('peer-discovered emits once per node (deduped), and only while enabled', () => {
    setSyncEnabled(db, true);
    const disc = new MDNSDiscovery(3743, factory);
    const seen: any[] = [];
    disc.on('peer-discovered', (n) => seen.push(n));
    disc.start();

    const response = {
      answers: [
        { type: 'SRV', name: 'neurosync._webrtc._udp.local', data: { port: 3743, target: 'node-b' } },
        { type: 'A', name: 'node-b', data: '192.168.1.50' },
      ],
    };
    factoryCalls[0]!.emit('response', response);
    factoryCalls[0]!.emit('response', response); // duplicate advertisement
    expect(seen).toHaveLength(1);
    expect(seen[0]).toEqual({ hostname: 'node-b', ip: '192.168.1.50', port: 3743 });
    expect(disc.getDiscoveredNodes()).toHaveLength(1);

    disc.stop();

    // After stop() (sync flipped off), further responses are ignored entirely.
    setSyncEnabled(db, false);
    const disc2 = new MDNSDiscovery(3743, factory);
    const seen2: any[] = [];
    disc2.on('peer-discovered', (n) => seen2.push(n));
    disc2.start();
    expect(factoryCalls).toHaveLength(1); // disc2 never opened a socket
    expect(seen2).toEqual([]);
  });
});
