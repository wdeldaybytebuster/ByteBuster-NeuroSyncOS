import { describe, it, expect, vi, afterEach } from 'vitest';
import { OpenAICompatibleProvider } from './openai-compatible';
import { OpenCodeProvider } from './opencode';

/**
 * Regression + repro suite for the live-testing finding documented in
 * docs/implementation-plan-and-progress-tracker.md ("OpenCode Zen" entries):
 * a short Cerebro chat prompt succeeded against OpenCode Zen's free catalog,
 * but a longer/more complex prompt consistently failed with "LLM API returned
 * no content in response" (3/3 reproductions), cascading through the full
 * RouteSwitch fallback chain instead of answering from OpenCode Zen.
 *
 * IMPORTANT: none of these tests hit a real network endpoint. `fetch` is
 * mocked with response shapes modeled on documented OpenAI-compatible /
 * DeepSeek-style reasoning-model conventions (`message.reasoning_content`,
 * `finish_reason: 'length'`). This proves the adapter's request-building and
 * response-parsing logic handles the failure mode correctly; it does NOT
 * constitute a live re-test against the real OpenCode Zen endpoint (no API
 * key is available in this environment) — that still needs a human with a
 * real key, consistent with how this project has flagged every other
 * unverifiable-without-keys finding.
 */

function jsonResponse(body: any, ok = true) {
  return {
    ok,
    status: ok ? 200 : 500,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as any;
}

describe('reasoning-model empty-content handling (openai-compatible adapters)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('regression: a normal short-prompt response is returned unchanged', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(
      jsonResponse({ choices: [{ message: { content: 'A DAG is a Directed Acyclic Graph.' }, finish_reason: 'stop' }] })
    );

    const p = new OpenAICompatibleProvider({ baseUrl: 'http://localhost:1234/v1', modelId: 'auto' });
    const res = await p.generate('what is a DAG?', 150);

    expect(res).toBe('A DAG is a Directed Acyclic Graph.');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('raises the max_tokens floor from 512 to 1024 for low estimatedTokens call sites', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(
      jsonResponse({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] })
    );

    const p = new OpenAICompatibleProvider({ baseUrl: 'http://localhost:1234/v1', modelId: 'auto' });
    // Cerebro reflection extractor's real value (index.ts): 150.
    await p.generate('extract preferences', 150);

    const [, init] = fetchMock.mock.calls[0]!;
    const sentBody = JSON.parse((init as RequestInit).body as string);
    expect(sentBody.max_tokens).toBe(1024);
  });

  it('reproduces the failure mode: empty content + finish_reason length + reasoning_content -> retries with a larger budget and succeeds', async () => {
    const exhaustedResponse = jsonResponse({
      choices: [
        {
          message: {
            content: '',
            reasoning_content: 'Let me think step by step about DAGs and their applications in workflow engines...'.repeat(20),
          },
          finish_reason: 'length',
        },
      ],
    });
    const successResponse = jsonResponse({
      choices: [
        {
          message: { content: 'A DAG (Directed Acyclic Graph) models tasks with dependencies and no cycles.' },
          finish_reason: 'stop',
        },
      ],
    });

    const fetchMock = vi
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(exhaustedResponse)
      .mockResolvedValueOnce(successResponse);

    const p = new OpenCodeProvider({ apiKey: 'fake-key-not-real', modelId: 'deepseek-v4-flash-free' });
    const res = await p.generate(
      'Explain in detail how DAG-based workflow orchestration compares to imperative scripting, with examples.',
      300,
    );

    expect(res).toBe('A DAG (Directed Acyclic Graph) models tasks with dependencies and no cycles.');
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Retry must request a materially larger budget than the first attempt.
    const firstBody = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    const secondBody = JSON.parse((fetchMock.mock.calls[1]![1] as RequestInit).body as string);
    expect(secondBody.max_tokens).toBeGreaterThan(firstBody.max_tokens);
  });

  it('reasoning exhaustion that persists after the retry throws a clear, distinguishing error (not the generic one)', async () => {
    const exhaustedResponse = jsonResponse({
      choices: [
        {
          message: { content: '', reasoning: 'thinking forever...'.repeat(50) },
          finish_reason: 'length',
        },
      ],
    });

    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(exhaustedResponse);

    const p = new OpenAICompatibleProvider({ baseUrl: 'http://localhost:1234/v1', modelId: 'some-reasoning-model' });
    await expect(p.generate('a very long complex prompt', 300)).rejects.toThrow(/hidden reasoning/i);

    // One original attempt + one bounded retry, then give up — never loops forever.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('a genuinely empty response with no reasoning-field evidence still throws the original generic error (no false-positive budget diagnosis)', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(
      jsonResponse({ choices: [{ message: { content: '' }, finish_reason: 'stop' }] })
    );

    const p = new OpenAICompatibleProvider({ baseUrl: 'http://localhost:1234/v1', modelId: 'auto' });
    await expect(p.generate('hello', 150)).rejects.toThrow('LLM API returned no content in response');

    // No retry: this isn't the reasoning-exhaustion signature, so only one call is made.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('a real API error (non-2xx) still surfaces clearly and is not swallowed as a content issue', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(
      jsonResponse({ error: { message: 'invalid api key' } }, false)
    );

    const p = new OpenAICompatibleProvider({ baseUrl: 'http://localhost:1234/v1', modelId: 'auto' });
    await expect(p.generate('hello', 150)).rejects.toThrow(/LLM API error 500/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
