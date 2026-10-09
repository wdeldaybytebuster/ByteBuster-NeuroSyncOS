import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  OpenAICompatibleProvider,
  DEFAULT_EMBEDDING_MODEL_ID,
  buildEmbeddingsUrl,
  buildEmbeddingRequestBody,
} from './openai-compatible';

/**
 * B (F7) — the embeddings path, pinned at the level it is actually decided.
 *
 * Two independent defects are covered:
 *   (a) the URL builder doubled the version segment, so the documented
 *       FreeLLMAPI base URL `http://host:3001/v1` produced a 404 from
 *       `/v1/v1/embeddings`;
 *   (b) the request reused the CHAT modelId, so an `auto`/`fusion` scope sent a
 *       chat id to an embeddings endpoint.
 *
 * This file deliberately never calls `initDB()`. `generateEmbedding` reads no
 * `llm_api_key` from the DB (unlike the chat path, which does), and every case
 * here supplies an `apiKey` or none at all, so no table is ever touched. `fetch`
 * is stubbed in every test that reaches the wire.
 */

function jsonResponse(body: any) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as any;
}

const EMBEDDING = { data: [{ embedding: [0.1, 0.2, 0.3] }] };

describe('B (F7) buildEmbeddingsUrl — pure URL rule', () => {
  const CASES: Array<{ baseUrl: string; expected: string; why: string }> = [
    {
      baseUrl: 'http://localhost:3001/v1',
      expected: 'http://localhost:3001/v1/embeddings',
      why: 'the documented FreeLLMAPI base URL — the reported /v1/v1/embeddings bug',
    },
    {
      baseUrl: 'http://localhost:3001/v1/',
      expected: 'http://localhost:3001/v1/embeddings',
      why: 'trailing slash must not re-introduce the doubled segment',
    },
    {
      baseUrl: 'http://localhost:3001',
      expected: 'http://localhost:3001/v1/embeddings',
      why: 'a bare origin still needs the version segment',
    },
    {
      baseUrl: 'https://openrouter.ai/api/v1',
      expected: 'https://openrouter.ai/api/v1/embeddings',
      why: 'a nested path ending in /v1 gains only /embeddings',
    },
    {
      baseUrl: 'https://example.com/api/v1/embeddings',
      expected: 'https://example.com/api/v1/embeddings',
      why: 'a full endpoint pasted by an operator is honoured, not doubled',
    },
  ];

  for (const { baseUrl, expected, why } of CASES) {
    it(`${baseUrl} -> ${expected} (${why})`, () => {
      expect(buildEmbeddingsUrl(baseUrl)).toBe(expected);
    });
  }

  it('never emits a doubled /v1/v1 for any of the shapes above', () => {
    for (const { baseUrl } of CASES) {
      expect(buildEmbeddingsUrl(baseUrl)).not.toContain('/v1/v1/');
    }
  });
});

describe('B (F7) buildEmbeddingRequestBody — deterministic model key check', () => {
  it('uses a configured embedding model verbatim', () => {
    expect(buildEmbeddingRequestBody('hi', 'my-embed-model')).toEqual({
      input: 'hi',
      model: 'my-embed-model',
    });
  });

  it('falls back to the default when no embedding model is configured', () => {
    expect(buildEmbeddingRequestBody('hi')).toEqual({ input: 'hi', model: DEFAULT_EMBEDDING_MODEL_ID });
    expect(buildEmbeddingRequestBody('hi', undefined).model).toBe(DEFAULT_EMBEDDING_MODEL_ID);
  });

  it('refuses the two chat ids this app actually uses (auto / fusion), case-insensitively', () => {
    for (const chatId of ['auto', 'AUTO', 'Auto', 'fusion', 'FUSION']) {
      expect(buildEmbeddingRequestBody('hi', chatId).model).toBe(DEFAULT_EMBEDDING_MODEL_ID);
    }
  });

  it('treats blank / whitespace-only as unconfigured rather than sending an empty model', () => {
    for (const blank of ['', '   ', '\t\n']) {
      expect(buildEmbeddingRequestBody('hi', blank).model).toBe(DEFAULT_EMBEDDING_MODEL_ID);
    }
  });

  it('emits exactly the two contract keys — no chat-only field can ride along', () => {
    const body = buildEmbeddingRequestBody('hi', 'm');
    expect(Object.keys(body).sort()).toEqual(['input', 'model']);
    expect(body).not.toHaveProperty('messages');
    expect(body).not.toHaveProperty('response_format');
    expect(body).not.toHaveProperty('max_tokens');
  });
});

describe('B (F7) generateEmbedding — the wire reflects both rules', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('posts to the single-/v1 URL and sends a real embedding model, not the chat auto id', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(jsonResponse(EMBEDDING));

    const provider = new OpenAICompatibleProvider({
      baseUrl: 'http://localhost:3001/v1',
      modelId: 'auto', // the chat id — must NOT reach the embeddings body
    });
    const embedding = await provider.generateEmbedding('hello');

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://localhost:3001/v1/embeddings');
    expect((init as RequestInit).body as string).not.toContain('"model":"auto"');

    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.model).toBe(DEFAULT_EMBEDDING_MODEL_ID);
    expect(body.input).toBe('hello');
    expect(embedding).toBeInstanceOf(Float32Array);
  });

  it('a configured embeddingModelId wins over the chat modelId', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(jsonResponse(EMBEDDING));

    const provider = new OpenAICompatibleProvider({
      baseUrl: 'http://localhost:3001/v1',
      modelId: 'fusion',
      embeddingModelId: 'nomic-embed-text',
    });
    await provider.generateEmbedding('hello');

    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.model).toBe('nomic-embed-text');
  });
});
