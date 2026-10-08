/**
 * §2.2(i) — e2e auth bootstrap (C6).
 *
 * The Playwright suite drives the browser at the local UI, which now requires
 * an operator session (§4.2 forbids weakening the server for tests). This
 * globalSetup mints a real session against the loopback API using the REAL
 * credential flow — no back-door, no NEUROSYNC_AUTH_SETUP bypass:
 *
 *   1. POST /api/auth/setup  → 200 on a fresh box (first-run)
 *   2. POST /api/auth/login  → 200 once the credential exists (existing box)
 *
 * The token lands in process.env.NEUROSYNC_E2E_TOKEN and every spec injects it
 * into localStorage['neurosync.session'] via page.addInitScript (see the
 * beforeEach at the top of each spec file).
 *
 * Failure modes are loud, never silent-skip:
 *   - setup 403 + login 401 ⇒ wrong password or a closed boot window; the
 *     operator must set NEUROSYNC_E2E_PASSWORD or restart with
 *     NEUROSYNC_AUTH_SETUP=1 (§2.2(a)).
 */
import type { FullConfig } from '@playwright/test';

const API = process.env.NEUROSYNC_API ?? 'http://127.0.0.1:3743';
// A dedicated e2e credential — never a production one, and always ≥ 12 chars.
const PASSWORD = process.env.NEUROSYNC_E2E_PASSWORD ?? 'neurosync-e2e-operator-pw';

async function post(path: string, body: unknown): Promise<{ status: number; json: any }> {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as any;
  return { status: res.status, json };
}

async function tokenFrom(path: string): Promise<string | null> {
  try {
    const { status, json } = await post(path, { password: PASSWORD });
    if (status === 200 && typeof json.token === 'string' && json.token) return json.token;
    return null;
  } catch {
    return null;
  }
}

export default async function globalSetup(_config: FullConfig): Promise<void> {
  // Fresh box first: setup is permanently 404 once a credential exists.
  const token = (await tokenFrom('/api/auth/setup')) ?? (await tokenFrom('/api/auth/login'));

  if (!token) {
    throw new Error(
      `[e2e] Could not obtain a session token from ${API}.\n` +
        `  - Is the API running (npm run dev:server) and reachable on loopback?\n` +
        `  - Existing credential? export NEUROSYNC_E2E_PASSWORD=<operator password>.\n` +
        `  - Fresh box with a closed boot window? start the server with NEUROSYNC_AUTH_SETUP=1.`
    );
  }

  process.env.NEUROSYNC_E2E_TOKEN = token;
  console.log('[e2e] operator session established against the loopback API');
}
