import { describe, it, expect } from 'vitest';
import { classifyDirective, NodeDirective } from './dispatch';

/**
 * §2.1 — Unit tests for the prompt classifier.
 * The worker_threads ThreadWorker instance is not instantiated in tests —
 * we test the pure classifier function and the deterministic decision logic.
 */
describe('classifyDirective (§2.1 prompt classifier)', () => {
  it('returns generic for empty prompt', () => {
    expect(classifyDirective('')).toEqual({ action: 'generic', payload: '', reason: 'empty prompt' });
    expect(classifyDirective('   ').action).toBe('generic');
  });

  it('detects http/https URL anywhere in the prompt', () => {
    const r1 = classifyDirective('Fetch https://example.com/data');
    expect(r1.action).toBe('scrape');
    expect(r1.payload).toBe('https://example.com/data');

    const r2 = classifyDirective('plain http://api.test/page');
    expect(r2.action).toBe('scrape');
    expect(r2.payload).toBe('http://api.test/page');
  });

  it('extracts bash code-fence payload when root is allowlisted', () => {
    const prompt = 'Run this:\n```bash\nls -la /tmp\n```\nThanks.';
    const r = classifyDirective(prompt);
    expect(r.action).toBe('shell');
    expect(r.payload).toBe('ls -la /tmp');
  });

  it('falls back to generic when bash fence root is NOT in the allowlist', () => {
    const prompt = '```bash\nrm -rf /\n```';
    const r = classifyDirective(prompt);
    expect(r.action).toBe('generic');
    expect(r.reason).toMatch(/not in allowlist/);
  });

  it('dispatches a bare allowlisted command on the first line', () => {
    const r1 = classifyDirective('ls -la');
    expect(r1.action).toBe('shell');
    expect(r1.payload).toBe('ls -la');

    const r2 = classifyDirective('pwd');
    expect(r2.action).toBe('shell');
    expect(r2.payload).toBe('pwd');
  });

  it('falls back to generic when first-line root is non-allowlisted', () => {
    const r = classifyDirective('sudo rm everything');
    expect(r.action).toBe('generic');
  });

  it('routes a python3 invocation through shell so CommandSandbox.python3 hits the right executor', () => {
    const r = classifyDirective('python3 -c "print(2+2)"');
    expect(r.action).toBe('shell');
    expect(r.payload).toBe('python3 -c "print(2+2)"');
  });

  it('does NOT dispatch disallowed shells via sneaky wrapping', () => {
    const r = classifyDirective('hey do this: rm -rf /tmp');
    expect(r.action).toBe('generic');
  });

  it('returns generic for a benign prompt with no executable pattern', () => {
    const r = classifyDirective('summarize the latest CSV into a Markdown table');
    expect(r.action).toBe('generic');
    expect(r.reason).toMatch(/no executable pattern/);
  });

  it('preserves reason string for the audit trail', () => {
    const r = classifyDirective('https://example.com');
    expect(r.reason).toBeTruthy();
    expect(typeof r.reason).toBe('string');
  });

  it('NodeDirective interface exposes action/payload/reason', () => {
    const d: NodeDirective = { action: 'shell', payload: 'ls', reason: 'test' };
    expect(d.action).toBe('shell');
    expect(d.payload).toBe('ls');
    expect(d.reason).toBe('test');
  });
});
