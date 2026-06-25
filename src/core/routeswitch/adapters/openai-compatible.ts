import { LLMProvider } from '../providers';
import { db } from '../../basevault/db';
import { decrypt } from '../../basevault/crypto';

export interface OpenAICompatibleConfig {
  baseUrl: string;
  apiKey?: string;
  modelId: string;
}

export class OpenAICompatibleProvider implements LLMProvider {
  id = 'openai-compatible';
  
  constructor(private config: OpenAICompatibleConfig) {}

  async generate(prompt: string, _estimatedTokens: number, schema?: any): Promise<string> {
    const { baseUrl, apiKey, modelId } = this.config;

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

    const body: Record<string, any> = {
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 512,
      temperature: 0.7,
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

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'unknown error');
      throw new Error(`LLM API error ${response.status}: ${errorText}`);
    }

    const data = await response.json() as any;
    const content = data?.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('LLM API returned no content in response');
    }

    return content;
  }
}
