/**
 * AUDITOR ROUND 1 — independent adversarial negatives for V3 (egress gate).
 * Throwaway loopback server; proves SSRF + unbounded-read exploits fail.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { db, initDB } from '../../../src/core/basevault/db';
import { egressFetch } from '../../../src/core/routeswitch/egress';

let server: http.Server;
let base: string;
let hits = 0;

function setKillSwitch(v: string | null) {
  if (v === null) db.prepare("DELETE FROM system_settings WHERE key = 'external_calls_enabled'").run();
  else db.prepare("INSERT OR REPLACE INTO system_settings (key, value) VALUES ('external_calls_enabled', ?)").run(v);
}

describe('AUDIT-NEG-V3 egress gate fails closed', () => {
  beforeAll(async () => {
    initDB();
    server = http.createServer((req, res) => {
      hits++;
      if (req.url === '/huge') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('x'.repeat(5_000_000));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('hello-local');
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  beforeEach(() => { hits = 0; setKillSwitch(null); });
  afterAll(async () => {
    setKillSwitch(null);
    await new Promise((r) => server.close(r));
  });

  it('N1: file:// scheme blocked with zero wire bytes', async () => {
    const r = await egressFetch('file:///etc/passwd', {}, { action: 'fetch', owner: 'audit' });
    expect(r.ok).toBe(false);
    expect(r.blocked).toBe('scheme');
    expect(hits).toBe(0);
  });

  it('N2: loopback SSRF without internal flag blocked, server never hit', async () => {
    const r = await egressFetch(`${base}/`, {}, { action: 'fetch', owner: 'audit' });
    expect(r.ok).toBe(false);
    expect(r.blocked).toBe('private-address');
    expect(hits).toBe(0);
  });

  it('N3: cloud metadata IP blocked', async () => {
    const r = await egressFetch('http://169.254.169.254/latest/meta-data/', { timeoutMs: 2000 }, { action: 'fetch', owner: 'audit' });
    expect(r.ok).toBe(false);
    expect(r.blocked).toBe('private-address');
  });

  it('N4: kill switch off blocks even allowlisted-shape egress', async () => {
    setKillSwitch('false');
    const r = await egressFetch('https://example.com/', { timeoutMs: 2000 }, { action: 'fetch', owner: 'audit' });
    expect(r.ok).toBe(false);
    expect(r.blocked).toBe('kill-switch');
  });

  it('N5: 5MB body vs 1MB cap -> too-large, bytes bounded', async () => {
    // internal:true is the only way to reach loopback; cap must still hold
    const r2 = await egressFetch(`${base}/huge`, { maxBytes: 1_000_000, internal: true }, { action: 'fetch', owner: 'audit' });
    expect(r2.ok).toBe(false);
    expect(r2.blocked).toBe('too-large');
    expect(r2.bytes).toBeLessThanOrEqual(1_000_000 + 65536);
  });

  it('N6: internal:true loopback allowed (eval-server bridge keeps working)', async () => {
    const r = await egressFetch(`${base}/`, { internal: true }, { action: 'fetch', owner: 'audit' });
    expect(r.ok).toBe(true);
    expect(r.text).toBe('hello-local');
    expect(hits).toBeGreaterThan(0);
  });

  it('N7: malformed URL blocked', async () => {
    const r = await egressFetch('http://[::1:2:3:4:5:6:7:8:9]/', { timeoutMs: 1000 }, { action: 'fetch', owner: 'audit' });
    expect(r.ok).toBe(false);
    expect(r.blocked).toBeDefined();
  });
});
