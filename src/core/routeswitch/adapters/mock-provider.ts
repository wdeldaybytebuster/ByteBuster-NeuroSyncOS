import { LLMProvider } from '../providers';

export class MockProvider implements LLMProvider {
  id = 'mock';

  async generate(prompt: string, estimatedTokens: number, schema?: any): Promise<string> {
    // Simulate realistic delay based on requested token size
    const delayMs = Math.min(Math.max(estimatedTokens * 0.5, 50), 2000);
    await new Promise(resolve => setTimeout(resolve, delayMs));

    if (schema) {
      // Return a valid empty DAG structure if schema resembles our DAG requirements
      // Or a generic JSON object if it's an arbitrary schema
      if (schema.type === 'object' && schema.properties?.nodes) {
        return JSON.stringify({ nodes: [{ id: 'mock-1', dependencies: [], prompt: 'mock node' }] });
      }
      return JSON.stringify({});
    }

    // Default structural fallback
    return `[MOCK RESPONSE] Acknowledged prompt: "${prompt.substring(0, 50)}...". Generated structural fallback payload offline.`;
  }
}
