import { LLMProvider } from '../providers';
import { db } from '../../basevault/db';
import { decrypt } from '../../basevault/crypto';

export interface OpenAICompatibleConfig {
  baseUrl: string;
  apiKey?: string;
  modelId: string;
  /** Extra static headers merged into every request (e.g. OpenRouter's HTTP-Referer/X-Title). */
  extraHeaders?: Record<string, string>;
}

export class OpenAICompatibleProvider implements LLMProvider {
  id: string;

  constructor(protected config: OpenAICompatibleConfig, customId?: string) {
    this.id = customId || 'openai-compatible';
  }

  /**
   * Hook for subclasses that front a fixed platform (e.g. OpenCode Zen,
   * OpenRouter) to resolve a placeholder modelId ('auto'/blank) into a real
   * model id before the request goes out — those platforms don't understand
   * a literal "auto" the way a smart local proxy does. Default: no-op.
   */
  protected async _resolveEffectiveConfig(): Promise<OpenAICompatibleConfig> {
    return this.config;
  }

  async generate(prompt: string, estimatedTokens: number, schema?: any): Promise<string> {
    const effectiveConfig = await this._resolveEffectiveConfig();
    return this._generateWithConfig(prompt, estimatedTokens, schema, effectiveConfig);
  }

  /**
   * The actual request logic, parameterized on an explicit resolved config
   * rather than reading `this.config`/`_resolveEffectiveConfig()` directly.
   * Lets subclasses (OpenCodeProvider, OpenRouterProvider) retry against a
   * *different* candidate model on rate-limit without any shared mutable
   * state or re-triggering discovery.
   */
  protected async _generateWithConfig(
    prompt: string,
    estimatedTokens: number,
    schema: any,
    effectiveConfig: OpenAICompatibleConfig
  ): Promise<string> {
    const { baseUrl, apiKey, modelId, extraHeaders } = effectiveConfig;

    // Graceful offline fallback if no baseUrl is configured
    if (!baseUrl) {
      return `[MOCK OFFLINE] No provider configured. Prompt received: "${prompt.substring(0, 40)}..."`;
    }

    const isAuto = modelId.toLowerCase() === 'auto';

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    let finalApiKey = apiKey || process.env.OPENAI_API_KEY;
    if (!finalApiKey) {
      try {
        const row = db.prepare('SELECT value FROM system_settings WHERE key = ?').get('llm_api_key') as {value: string} | undefined;
        if (row) {
          finalApiKey = decrypt(row.value);
        }
      } catch (e) {
        console.error('Failed to get llm_api_key from db', e);
      }
    }

    if (finalApiKey) {
      headers['Authorization'] = `Bearer ${finalApiKey}`;
    }

    if (extraHeaders) {
      Object.assign(headers, extraHeaders);
    }

    const body: Record<string, any> = {
      messages: [{ role: 'user', content: prompt }],
      max_tokens: Math.max(estimatedTokens, 512),
      // Lower temperature for schema-constrained requests: not every
      // OpenAI-compatible backend actually enforces json_schema/strict at
      // the token level, so a high temperature on those still risks
      // malformed JSON (unescaped quotes, trailing commas, truncated
      // structure). Free-form prompts keep the more creative default.
      temperature: schema ? 0.2 : 0.7,
      enable_thinking: false, // Prevent syntax crashes
    };

    if (schema) {
      // Support for structured outputs
      body.response_format = {
        type: 'json_schema',
        json_schema: {
          name: 'dag_response',
          strict: true,
          schema: schema
        }
      };
    }

    // When modelId is 'auto', omit the field — FreeLLMAPI/proxy will choose
    if (!isAuto) {
      body.model = modelId;
    }

    let url = baseUrl.replace(/\/$/, '');
    if (!url.endsWith('/v1/chat/completions')) {
      if (url.endsWith('/v1')) {
        url += '/chat/completions';
      } else {
        url += '/v1/chat/completions';
      }
    }

    let response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'unknown error');

      // Some backends 400 specifically on the response_format/json_schema
      // parameter even though the rest of the request is fine — live-observed
      // on OpenCode Zen's 'big-pickle' free model (proxies to DeepSeek):
      // "This response_format type is unavailable now". Retry once without
      // it rather than failing outright; the prompt already instructs
      // "output ONLY a valid JSON array" and OKFGenerator's parser strips
      // markdown fences/preamble, so best-effort JSON still usually works.
      if (response.status === 400 && body.response_format && /response_format/i.test(errorText)) {
        const { response_format: _unused, ...bodyWithoutSchema } = body;
        response = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(bodyWithoutSchema),
        });
        if (!response.ok) {
          const retryErrorText = await response.text().catch(() => 'unknown error');
          throw new Error(`LLM API error ${response.status}: ${retryErrorText}`);
        }
      } else {
        throw new Error(`LLM API error ${response.status}: ${errorText}`);
      }
    }

    const data = await response.json() as any;
    const content = data?.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('LLM API returned no content in response');
    }

    return content;
  }
}
