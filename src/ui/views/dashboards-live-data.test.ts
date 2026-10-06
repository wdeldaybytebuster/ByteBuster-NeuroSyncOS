/**
 * AUDITOR (regression guard) — Sprint 2: "UI Theatre" must stay dead.
 *
 * The dashboards are required to natively consume real backend data (SQLite /
 * vitest aggregates) rather than static strings or random-number generators.
 * This is a node-env source+wiring guard (the jsdom environment is currently
 * broken repo-wide — see chat-backend-routing.test.ts) asserting:
 *   (a) no Math.random()-based fake latency/jitter anywhere in the widgets,
 *   (b) none of the formerly-hardcoded theatre strings return,
 *   (c) each metric widget is bound to a live endpoint + state variable.
 *
 * NOTE: these assertions PASS against the current code because the theatre was
 * already eradicated in a prior pass (commit e4f0caa, "Task 15 — honest
 * dashboards"). They exist to prevent regression, not to drive a red→green fix.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Load a component's source with comments stripped. The widgets carry
 * documentation comments that legitimately reference the theatre that was
 * removed (e.g. "was Math.random() jitter", "was hardcoded 0"); those must not
 * trip the guard. Assertions therefore run against CODE only, which is the
 * precise contract: the code must not generate random metrics or hardcode
 * theatre values. (Comment-stripping is line/block scoped so `http://` URLs in
 * real code are preserved.)
 */
function readCode(relPath: string): string {
  // Resolve from the repo root (vitest runs with cwd = repo root); avoids
  // `import.meta`, which tsc rejects under this repo's CommonJS module target.
  const raw = fs.readFileSync(path.join(process.cwd(), relPath), 'utf-8');
  return raw
    .replace(/\/\*[\s\S]*?\*\//g, '') // block comments
    .replace(/^\s*\/\/.*$/gm, ''); // full-line // comments
}

// Strings that used to be dressed up as live telemetry. None may reappear as
// literal, non-computed text in these widgets.
const THEATRE_LITERALS = ['398 Tests', 'PASSING (398', '98.4%', 'v3.2.1', 'Retry Rate 1.2%', 'Latency 42ms'];

describe('CoreExecDashboard (Orchestration Metrics) — live data', () => {
  const src = readCode('src/ui/views/CoreExecDashboard.tsx');

  it('has no Math.random()-generated numbers', () => {
    expect(src).not.toMatch(/Math\.random/);
  });

  it('has no fabricated orchestration-metrics strings', () => {
    for (const lit of THEATRE_LITERALS) {
      expect(src).not.toContain(lit);
    }
  });

  it('binds the orchestration widget to /api/coreexec/metrics state', () => {
    expect(src).toContain('/api/coreexec/metrics');
    expect(src).toContain('metrics?.successRate');
    expect(src).toContain('metrics?.avgLatencyMs');
  });
});

describe('CerebroDashboard — live data', () => {
  const src = readCode('src/ui/views/CerebroDashboard.tsx');

  it('has no Math.random()-generated numbers', () => {
    expect(src).not.toMatch(/Math\.random/);
  });

  it('does not hardcode the Pruned (30d) counter', () => {
    expect(src).not.toMatch(/Pruned \(30d\)[^<]*0/); // e.g. a literal "Pruned (30d): 0"
    expect(src).toContain('pruned30d'); // bound to fetched state instead
    expect(src).toContain('/api/cerebro/prune-history');
  });
});

describe('BaseVaultDashboard (Database Stats) — live data', () => {
  const src = readCode('src/ui/views/BaseVaultDashboard.tsx');

  it('has no Math.random() latency/checkpoint jitter', () => {
    expect(src).not.toMatch(/Math\.random/);
  });

  it('binds db stats to /api/system/db-health state', () => {
    expect(src).toContain('/api/system/db-health');
    expect(src).toContain('dbStats');
  });
});
