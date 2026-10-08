/**
 * P2-3 — NEUROSYNC_PORT contract.
 *
 * NEVER imports server-main.ts (it binds a port and starts a scheduler —
 * same rule as perimeter.test.ts / ws-upgrade-guard.test.ts). server-main
 * usage is asserted as a source contract via fs.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { NEUROSYNC_PORT, DEFAULT_NEUROSYNC_PORT, resolveNeurosyncPort } from './port';
import { ALLOWED_ORIGINS } from './perimeter';

describe('resolveNeurosyncPort validation (1–65535, else default)', () => {
  it('defaults to 3743 when unset, empty, or garbage', () => {
    expect(DEFAULT_NEUROSYNC_PORT).toBe(3743);
    expect(resolveNeurosyncPort(undefined)).toBe(3743);
    expect(resolveNeurosyncPort('')).toBe(3743);
    expect(resolveNeurosyncPort('   ')).toBe(3743);
    expect(resolveNeurosyncPort('abc')).toBe(3743);
    expect(resolveNeurosyncPort('3743abc')).toBe(3743);
    expect(resolveNeurosyncPort(null)).toBe(3743);
    expect(resolveNeurosyncPort(NaN)).toBe(3743);
  });

  it('rejects out-of-range and non-integer values', () => {
    for (const bad of [0, -1, 65536, 99999, 1.5, '0', '65536', '-1', '3.5']) {
      expect(resolveNeurosyncPort(bad), `raw ${String(bad)}`).toBe(3743);
    }
  });

  it('accepts legal ports at the edges and in the middle', () => {
    expect(resolveNeurosyncPort(1)).toBe(1);
    expect(resolveNeurosyncPort(65535)).toBe(65535);
    expect(resolveNeurosyncPort(3743)).toBe(3743);
    expect(resolveNeurosyncPort('8080')).toBe(8080);
    expect(resolveNeurosyncPort(' 3743 ')).toBe(3743);
  });

  it('NEUROSYNC_PORT is wired to the env through the validator', () => {
    expect(NEUROSYNC_PORT).toBe(resolveNeurosyncPort(process.env.NEUROSYNC_PORT));
    if (process.env.NEUROSYNC_PORT === undefined) {
      expect(NEUROSYNC_PORT).toBe(3743);
    }
  });
});

describe('single const feeds both MDNS and serve (source contract)', () => {
  const src = fs.readFileSync(path.join(__dirname, 'server-main.ts'), 'utf8');

  it('server-main imports NEUROSYNC_PORT from ./port', () => {
    expect(src).toMatch(/from '\.\/port'/);
  });

  it('MDNSDiscovery is constructed with NEUROSYNC_PORT (not a literal)', () => {
    expect(src).toMatch(/new MDNSDiscovery\(NEUROSYNC_PORT\)/);
    expect(src).not.toMatch(/new MDNSDiscovery\(3743\)/);
  });

  it('the serve port derives from NEUROSYNC_PORT (not a literal)', () => {
    expect(src).toMatch(/const port = NEUROSYNC_PORT/);
  });

  it('the serve({ … }) literal still declares hostname: (audit gate intact)', () => {
    const serveMatch = src.match(/serve\(\{[\s\S]*?\}\)/);
    expect(serveMatch).not.toBeNull();
    expect(serveMatch![0]).toMatch(/hostname:/);
  });
});

describe('ALLOWED_ORIGINS derives the static-UI pair from NEUROSYNC_PORT', () => {
  it('contains the derived PORT entries', () => {
    expect(ALLOWED_ORIGINS.has(`http://localhost:${NEUROSYNC_PORT}`)).toBe(true);
    expect(ALLOWED_ORIGINS.has(`http://127.0.0.1:${NEUROSYNC_PORT}`)).toBe(true);
  });

  it('keeps the 3742/5173/tauri entries static', () => {
    for (const origin of [
      'http://localhost:3742', 'http://127.0.0.1:3742',
      'http://localhost:5173', 'http://127.0.0.1:5173',
      'tauri://localhost', 'http://tauri.localhost',
    ]) {
      expect(ALLOWED_ORIGINS.has(origin), origin).toBe(true);
    }
  });
});

describe('GITNEXUS_PORT precedent untouched', () => {
  it('gitnexus-client still resolves its own port the same way', () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), 'src/core/memory/gitnexus-client.ts'),
      'utf8',
    );
    expect(src).toMatch(/NEUROSYNC_GITNEXUS_PORT/);
  });
});
