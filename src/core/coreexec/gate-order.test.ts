/**
 * §4.3 V3 — gate-order tests (plan §2.3 C8-c). "Pure function, no worker
 * threads."
 *
 * THE BUG UNDER TEST (§0-V3 ordering): worker.ts dispatched `executePlugin`
 * (including okf_indexer's raw `fetch(url)`) at :291 and returned at :295 —
 * BEFORE the Phase-5 permission gate at :305 — so a network plugin's egress
 * fired with zero policy checks.
 *
 * The pure seam (`resolveGateAction` / `resolveGateActions`) plus the
 * gate-then-dispatch wrapper (`gateAndDispatch`) that worker.ts must call are
 * exercised here; the actual worker wiring is pinned by a node-env source
 * contract at the bottom (mirrors chat-backend-routing.test.ts — no worker
 * threads, no server-main import, §4.2).
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { db, initDB, dbPath } from '../basevault/db';

// ── Mocks (hoisted above the imports by vitest) ─────────────────────────────
// 1. permission-gate: wrap the REAL implementation so cases 5-7 run the actual
//    DB-backed policy, while case 2 injects a one-shot blocked verdict
//    (§4.3 test 2: "checkActionPermission a mocked blocked:true").
// 2. egress: a bare spy — a gate regression can never fire a real network call
//    from this suite, and "never called" stays a crisp assertion.
vi.mock('./permission-gate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./permission-gate')>();
  return { ...actual, checkActionPermission: vi.fn(actual.checkActionPermission) };
});
vi.mock('../routeswitch/egress', async () => ({ egressFetch: vi.fn() }));

import { checkActionPermission } from './permission-gate';
import { egressFetch } from '../routeswitch/egress';
import { pluginNeedsNetwork, resolveGateAction, resolveGateActions, gateAndDispatch } from './gate-order';
import type { NodeDirective } from './dispatch';

const shell: NodeDirective = { action: 'shell', payload: '', reason: 'test' };
const scrape: NodeDirective = { action: 'scrape', payload: '', reason: 'test' };
const generic: NodeDirective = { action: 'generic', payload: '', reason: 'test' };

function readSource(relPath: string): string {
  // Resolve from the repo root (vitest runs with cwd = repo root). Avoids
  // `import.meta`, which tsc rejects under this repo's CommonJS module target.
  return fs.readFileSync(path.join(process.cwd(), relPath), 'utf-8');
}

describe('gate-order (§2.3 C8-c / §4.3)', () => {
  const seedProject = (id: string, archetype: string | null): void => {
    db.prepare(
      'INSERT OR REPLACE INTO projects (id, name, permission_archetype, created_at) VALUES (?, ?, ?, ?)',
    ).run(id, 'Gate Order Project', archetype, Date.now());
  };

  beforeAll(() => {
    initDB();
  });

  beforeEach(() => {
    db.prepare('DELETE FROM projects').run();
    db.prepare("DELETE FROM system_settings WHERE key IN ('tool_registry','agent_permissions')").run();
    vi.clearAllMocks();
  });

  afterAll(() => {
    db.close();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    if (fs.existsSync(dbPath + '-wal')) fs.unlinkSync(dbPath + '-wal');
    if (fs.existsSync(dbPath + '-shm')) fs.unlinkSync(dbPath + '-shm');
  });

  // ── §4.3 case 1 ───────────────────────────────────────────────────────────
  it('1: network okf_indexer plugin resolves to "fetch"', () => {
    expect(resolveGateAction({ plugin: 'okf_indexer', params: { url: 'https://x' } })).toBe('fetch');
  });

  // ── §4.3 case 3 ───────────────────────────────────────────────────────────
  it('3: files / mockContent params resolve to null (no network)', () => {
    expect(resolveGateAction({ plugin: 'okf_indexer', params: { files: ['a.ts'], url: 'https://x' } })).toBeNull();
    expect(resolveGateAction({ plugin: 'okf_indexer', params: { mockContent: '<doc>', url: 'https://x' } })).toBeNull();
  });

  // ── §4.3 case 4 ───────────────────────────────────────────────────────────
  it('4: directive shell/scrape resolve to themselves; generic resolves to null', () => {
    expect(resolveGateAction({ directive: shell })).toBe('shell');
    expect(resolveGateAction({ directive: scrape })).toBe('scrape');
    expect(resolveGateAction({ directive: generic })).toBeNull();
  });

  // Deliberate strengthening over the plan sketch (documented in gate-order.ts):
  // executePlugin's file branch only short-circuits the fetch for ARRAY files,
  // so a truthy non-array `files` value still reaches `if (!content && url)` —
  // the gate must track the real fetch condition, fail-closed.
  it('formula: truthy non-array `files` still gates (executePlugin would fetch)', () => {
    expect(pluginNeedsNetwork({ plugin: 'okf_indexer', params: { files: 'not-an-array', url: 'https://x' } })).toBe(true);
    expect(pluginNeedsNetwork({ plugin: 'okf_indexer', params: { files: [], url: 'https://x' } })).toBe(false);
  });

  // ── §4.3 case 2 — THE REGRESSION ──────────────────────────────────────────
  it('2 [REGRESSION]: blocked policy -> dispatch / executePlugin / egressFetch never called', async () => {
    // The dispatch closure stands in for worker's plugin branch (the old
    // :291-:295 block: executePlugin + its egress). If the gate ever runs
    // after it — the pre-C8 ordering — egress fires unconditionally.
    vi.mocked(checkActionPermission).mockResolvedValueOnce({
      blocked: true,
      reason: "Blocked: archetype 'research_only' does not permit network/web access",
    });
    const dispatch = vi.fn(async () => {
      await egressFetch('https://example.invalid/doc', {}, { action: 'fetch', owner: 'coreexec/gate-order.test' });
      return 'plugin-output';
    });

    const outcome = await gateAndDispatch<string>(
      { plugin: 'okf_indexer', params: { url: 'https://example.invalid/doc' } },
      undefined,
      'proj-denied',
      dispatch,
    );

    expect(outcome.blocked).toBe(true);
    if (outcome.blocked) {
      expect(outcome.action).toBe('fetch');
      expect(outcome.reason).toBe("Blocked: archetype 'research_only' does not permit network/web access");
    }
    expect(dispatch).not.toHaveBeenCalled();
    expect(vi.mocked(egressFetch)).not.toHaveBeenCalled();
  });

  // ── worker wiring (source contract — proves worker.ts uses the seam) ──────
  describe('worker.ts wiring (node-env source contract)', () => {
    const src = readSource('src/core/coreexec/worker.ts');

    it('gates before plugin dispatch (gateAndDispatch call precedes the executePlugin call)', () => {
      const gateIdx = src.indexOf('gateAndDispatch(');
      const pluginIdx = src.indexOf('await executePlugin(');
      expect(gateIdx).toBeGreaterThan(-1);
      expect(pluginIdx).toBeGreaterThan(gateIdx);
    });

    it("routes okf_indexer's fetch through egressFetch — the raw fetch(url) is gone", () => {
      expect(src).toContain('egressFetch(');
      expect(src).not.toMatch(/await fetch\(url\)/);
    });
  });

  // ── §4.3 case 5 (extends permission-gate.test.ts, which covers shell/scrape)
  it('5: checkActionPermission(p, "fetch") is blocked when archetype.network is false', async () => {
    db.prepare("INSERT OR REPLACE INTO system_settings (key, value) VALUES ('agent_permissions', ?)").run(
      JSON.stringify({
        archetypes: [{ id: 'research_only', read: true, write: false, exec: false, git: true, network: false }],
      }),
    );
    seedProject('proj-fetch-deny', 'research_only');

    const denied = await checkActionPermission('proj-fetch-deny', 'fetch');
    expect(denied.blocked).toBe(true);
    if (denied.blocked) expect(denied.reason).toMatch(/does not permit network/);

    // Positive control: shipped DEFAULT_ARCHETYPES give research_only
    // network:true, so 'fetch' flips to allowed as soon as the override row is
    // gone (proves the block above came from network:false, not from 'fetch'
    // being an unknown action).
    db.prepare("DELETE FROM system_settings WHERE key = 'agent_permissions'").run();
    expect(await checkActionPermission('proj-fetch-deny', 'fetch')).toEqual({ blocked: false });

    // Tool-registry path applies to 'fetch' identically to 'scrape' (C8-b).
    db.prepare("INSERT OR REPLACE INTO system_settings (key, value) VALUES ('tool_registry', ?)").run(
      JSON.stringify([{ id: 'web_scrape', name: 'web_scrape', type: 'Network', status: 'Disabled' }]),
    );
    const toolDenied = await checkActionPermission('proj-fetch-deny', 'fetch');
    expect(toolDenied.blocked).toBe(true);
    if (toolDenied.blocked) expect(toolDenied.reason).toMatch(/web_scrape tool is disabled/);
  });

  // ── Combos: the singular resolver can't gate only one of two actions ──────
  it('6: network plugin + shell directive gates BOTH actions; dispatch runs once', async () => {
    const input = { plugin: 'okf_indexer', params: { url: 'https://x' } };
    // plan-literal singular resolver: the plugin's network action wins …
    expect(resolveGateAction(input, shell)).toBe('fetch');
    // … but the full set keeps BOTH, so the combo can't gate only one.
    expect(resolveGateActions(input, shell)).toEqual(['fetch', 'shell']);

    const dispatch = vi.fn(async () => 'plugin-output');
    const outcome = await gateAndDispatch<string>(input, shell, 'proj-combo', dispatch);

    expect(outcome.blocked).toBe(false);
    expect(vi.mocked(checkActionPermission).mock.calls).toEqual([
      ['proj-combo', 'fetch'],
      ['proj-combo', 'shell'],
    ]);
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it('7: combo hole closed — shell-denied project blocks before dispatch even though fetch is allowed', async () => {
    // shipped DEFAULT_ARCHETYPES: research_only = { exec:false, network:true }
    seedProject('proj-combo-deny', 'research_only');
    const dispatch = vi.fn(async () => 'plugin-output');

    const outcome = await gateAndDispatch<string>(
      { plugin: 'okf_indexer', params: { url: 'https://x' } },
      shell,
      'proj-combo-deny',
      dispatch,
    );

    expect(outcome.blocked).toBe(true);
    if (outcome.blocked) {
      expect(outcome.action).toBe('shell');
      expect(outcome.reason).toMatch(/does not permit command execution/);
    }
    expect(dispatch).not.toHaveBeenCalled();
  });
});
