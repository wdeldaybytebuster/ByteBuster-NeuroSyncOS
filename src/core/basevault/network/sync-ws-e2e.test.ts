import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Hono } from 'hono';
import { createNodeWebSocket } from '@hono/node-ws';
import { serve } from '@hono/node-server';
import type { ServerType } from '@hono/node-server';
import WebSocket from 'ws';
import { db, initDB } from '../db';
import { NodeTransport } from './transport';
import { loadSyncSecret, syncMac } from './sync-handshake';

// §2.1-C3: keep the test secret off the real .data/.sync.secret.
process.env.NEUROSYNC_SYNC_SECRET_PATH ??= '/tmp/opencode/neurosync/test-sync.secret';

/**
 * §4.1 — "the negative end-to-end shape (once, integration-style)".
 *
 * A real HTTP server on 127.0.0.1:<ephemeral> exposing /api/sync wired
 * EXACTLY like server-main.ts:236-256 (same upgradeWebSocket pattern), with a
 * real NodeTransport behind it. An unauthenticated client sends the literal
 * §0-V1 exploit frame — a SYNC_DELTA naming os_todos — and we assert:
 *   1. os_todos is byte-identical afterwards,
 *   2. the server closes the socket with 4401 (handshake never completed).
 *
 * Deliberately does NOT import server-main.ts (binds a port, starts the
 * scheduler, resumes runs — forbidden by §4.2 preamble for test isolation).
 */

let transport: NodeTransport;
let server: ServerType;
let port: number;

beforeAll(async () => {
  initDB();
  transport = new NodeTransport();

  const app = new Hono();
  const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });
  app.get(
    '/api/sync',
    upgradeWebSocket((c) => {
      const peerId = `incoming-${Math.random().toString(36).substring(7)}`;
      return {
        onOpen(_evt, ws) {
          transport.addIncomingConnection(peerId, ws);
        },
        onMessage(evt, ws) {
          const raw = typeof evt.data === 'string' ? evt.data : evt.data?.toString?.() ?? '';
          transport.handleIncomingMessage(raw, peerId, ws as any);
        },
        onClose() { /* peer gone */ },
        onError() { /* peer gone */ },
      };
    }),
  );

  server = serve({ fetch: app.fetch, port: 0, hostname: '127.0.0.1' });
  injectWebSocket(server); // same wiring as server-main.ts:561
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  const addr = server.address();
  port = typeof addr === 'object' && addr ? addr.port : 0;
});

afterAll(async () => {
  transport?.dispose();
  await new Promise<void>((resolve) => {
    if (server) server.close(() => resolve());
    else resolve();
  });
  db.close();
});

describe('sync WS end-to-end (integration)', () => {
  it('an unauthenticated SYNC_DELTA naming os_todos changes nothing and gets 4401', async () => {
    const before = db.prepare('SELECT * FROM os_todos ORDER BY id').all();

    const ws = new WebSocket(`ws://127.0.0.1:${port}/api/sync`);
    const closed = new Promise<number | null>((resolve) => {
      ws.on('close', (code) => resolve(code));
      ws.on('error', () => resolve(null));
    });

    await new Promise<void>((resolve, reject) => {
      ws.once('open', () => resolve());
      ws.once('error', reject);
    });

    // The literal exploit from §0-V1: peer-controlled table_name reaching SQL.
    ws.send(JSON.stringify({
      type: 'SYNC_DELTA',
      lastSyncTimestamp: Date.now(),
      deltas: [{
        id: 1,
        table_name: 'os_todos',
        action: 'INSERT',
        timestamp: Date.now(),
        payload: JSON.stringify({ id: 'pwned-by-sync', title: 'pwned', status: 'pending', created_at: Date.now() }),
      }],
    }));

    // Server never receives a valid handshake → closes with 4401 after 5 s.
    const closeCode = await closed;
    expect(closeCode).toBe(4401);

    const after = db.prepare('SELECT * FROM os_todos ORDER BY id').all();
    expect(after).toEqual(before);
    expect(db.prepare(`SELECT * FROM os_todos WHERE id = 'pwned-by-sync'`).get()).toBeUndefined();
  }, 15000);

  it('a second, correctly-handshaken client IS accepted (positive control)', async () => {
    // Positive control: proves the 4401 above is authentication, not breakage.
    const ws = new WebSocket(`ws://127.0.0.1:${port}/api/sync`);

    // Register listeners SYNCHRONOUSLY before awaiting anything: the 101 and
    // the challenge can arrive in one TCP chunk, so `message` may fire in the
    // same tick as `open` (a promise continuation would be too late).
    const challengePromise = new Promise<any>((resolve, reject) => {
      ws.once('message', (data) => {
        try { resolve(JSON.parse(data.toString())); } catch (e) { reject(e); }
      });
      ws.once('error', reject);
    });
    const closed = new Promise<number | null>((resolve) => ws.on('close', (code) => resolve(code)));
    await new Promise<void>((resolve, reject) => {
      ws.once('open', () => resolve());
      ws.once('error', reject);
    });

    const challenge = await challengePromise;
    expect(challenge.type).toBe('SYNC_CHALLENGE');

    ws.send(JSON.stringify({
      type: 'SYNC_AUTH',
      nonce: challenge.nonce,
      peerId: challenge.peerId,
      mac: syncMac(loadSyncSecret(), challenge.nonce, challenge.peerId),
    }));

    // Now a benign delta must be accepted (still subject to the C1 policy).
    await new Promise((r) => setTimeout(r, 150));
    ws.send(JSON.stringify({
      type: 'SYNC_DELTA',
      lastSyncTimestamp: Date.now(),
      deltas: [{
        id: 2,
        table_name: 'projects',
        action: 'INSERT',
        timestamp: Date.now(),
        payload: JSON.stringify({ id: 'e2e-auth-proj', name: 'E2E Authed', created_at: Date.now() }),
      }],
    }));

    await new Promise((r) => setTimeout(r, 300));
    const row = db.prepare(`SELECT * FROM projects WHERE id = ?`).get('e2e-auth-proj') as any;
    expect(row).toBeDefined();
    expect(row.name).toBe('E2E Authed');

    ws.close();
    await closed; // let the server side tear down cleanly
  }, 15000);
});
