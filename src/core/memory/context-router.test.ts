import { describe, it, expect } from 'vitest';
import { classifyIntent, routeQuery } from './context-router';
import { CerebroVectorStore } from './cerebro/vector';
import { _getState } from './gitnexus-client';

// NOTE: under vitest, gitnexus-client.isDisabled() short-circuits (VITEST==='true'),
// so no `gitnexus eval-server` subprocess is ever spawned during these tests and
// the 'code' intent falls back to conversational memory.

describe('classifyIntent', () => {
  it('classifies code-structure questions as "code"', () => {
    expect(classifyIntent('Where is the CommandSandbox class defined?')).toBe('code');
    expect(classifyIntent('What calls the routeQuery function?')).toBe('code');
    expect(classifyIntent('How does the RouteSwitch engine work internally?')).toBe('code');
    expect(classifyIntent('Show me the imports in engine.ts')).toBe('code');
  });

  it('classifies preference/decision questions as "knowledge"', () => {
    expect(classifyIntent('What did we decide about the database?')).toBe('knowledge');
    expect(classifyIntent('Why did we choose better-sqlite3?')).toBe('knowledge');
    expect(classifyIntent("What's our convention for error handling?")).toBe('knowledge');
  });

  it('classifies generic chat as "conversational"', () => {
    expect(classifyIntent('Hello, can you help me today?')).toBe('conversational');
    expect(classifyIntent('Thanks, that was great!')).toBe('conversational');
  });
});

describe('routeQuery', () => {
  it('routes knowledge questions to OKF (block supplied downstream by the engine)', async () => {
    const routed = await routeQuery('Why did we choose this architecture?');
    expect(routed).toHaveLength(1);
    expect(routed[0]!.source).toBe('okf');
    expect(routed[0]!.contextBlock).toBe('');
  });

  it('does NOT return gitnexus while disabled, and never throws', async () => {
    const routed = await routeQuery('Where is the class DummyProvider defined?');
    expect(routed[0]!.source).not.toBe('gitnexus');
    // gitnexus client must stay disabled/idle under the test runner (no spawn).
    expect(['idle', 'unavailable']).toContain(_getState());
  });

  it('routes conversational questions to the vector store when a match exists', async () => {
    const marker = 'zzquantumcontextrouterprobe';
    CerebroVectorStore.insert(`This is a unique probe memory about ${marker} widgets`, 'fact');
    const routed = await routeQuery(`Tell me something about ${marker} widgets`);
    expect(routed[0]!.source).toBe('vector');
    expect(routed[0]!.contextBlock).toContain('CONVERSATIONAL MEMORY CONTEXT');
  });
});
