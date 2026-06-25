export interface LLMProvider {
  id: string;
  generate(prompt: string, estimatedTokens: number, schema?: any): Promise<string>;
}

export class MockProvider implements LLMProvider {
  id = 'mock';

  async generate(prompt: string, estimatedTokens: number, schema?: any): Promise<string> {
    if (schema) {
      return JSON.stringify({ nodes: [{ id: 'mock-1', dependencies: [], prompt: 'mock node' }] });
    }
    return `[MOCK RESPONSE] Acknowledged prompt: "${prompt.substring(0, 50)}...". Generated structural fallback payload.`;
  }
}
