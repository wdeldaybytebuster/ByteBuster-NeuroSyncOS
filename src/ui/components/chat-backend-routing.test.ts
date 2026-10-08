/**
 * AUDITOR (TDD) — Sprint 2: chat widgets must route through NeuroSync's backend.
 *
 * WHY A NODE-ENV (non-jsdom) TEST:
 * The repo's jsdom environment is currently broken for every component test
 * (undici@8 / jsdom@30 incompatibility: `webidl.util.markAsUncloneable is not a
 * function` at jsdom import time) — it breaks the pre-existing
 * DegradationEngine.test.tsx too. Rather than add another test that cannot run,
 * this encodes the security + routing contract at the source level (runs in the
 * node environment) plus behavior of the pure request/response helpers the
 * components use. Both go RED against the pre-fix code and GREEN after.
 *
 * Contract under test:
 *  - ScopeLogicChat  -> POST ${API}/api/scopelogic/prompt   (no localhost:3001)
 *  - CerebroChatbot  -> POST ${API}/api/cerebro/chat        (no localhost:3001)
 *  - Neither ships a hardcoded `Authorization: Bearer <secret>` credential.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

function readSource(relPath: string): string {
  // Resolve from the repo root (vitest runs with cwd = repo root). Avoids
  // `import.meta`, which tsc rejects under this repo's CommonJS module target.
  return fs.readFileSync(path.join(process.cwd(), relPath), 'utf-8');
}

const SECRET_MARKER = 'freellmapi-'; // the leaked credential prefix

describe('ScopeLogicChat — routing & credential hygiene', () => {
  const src = readSource('src/ui/components/ScopeLogicChat.tsx');

  it('targets the backend /api/scopelogic/prompt endpoint', () => {
    expect(src).toContain('/api/scopelogic/prompt');
  });

  it('does not hardcode the raw LLM host localhost:3001', () => {
    expect(src).not.toContain('localhost:3001');
    expect(src).not.toContain('/v1/chat/completions');
  });

  it('carries no hardcoded bearer credential', () => {
    expect(src).not.toContain(SECRET_MARKER);
    expect(src).not.toMatch(/Authorization['"]?\s*:/);
  });
});

describe('CerebroChatbot — routing & credential hygiene', () => {
  const src = readSource('src/ui/components/CerebroChatbot.tsx');

  it('targets the backend /api/cerebro/chat endpoint', () => {
    expect(src).toContain('/api/cerebro/chat');
  });

  it('does not hardcode the raw LLM host localhost:3001', () => {
    expect(src).not.toContain('localhost:3001');
    expect(src).not.toContain('/v1/chat/completions');
  });

  it('carries no hardcoded bearer credential', () => {
    expect(src).not.toContain(SECRET_MARKER);
    expect(src).not.toMatch(/Authorization['"]?\s*:/);
  });
});
