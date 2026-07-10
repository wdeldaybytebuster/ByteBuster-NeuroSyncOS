import { GenerationStreamHooks, LLMProvider } from '../providers';

export class MockProvider implements LLMProvider {
  id = 'mock';

  // Synthetic offline provider: no real inference, so no real per-token
  // confidence. `streamHooks` is intentionally ignored (heuristic fallback).
  async generate(
    prompt: string,
    estimatedTokens: number,
    schema?: any,
    _streamHooks?: GenerationStreamHooks,
  ): Promise<string> {
    // Simulate realistic delay based on requested token size
    const delayMs = Math.min(Math.max(estimatedTokens * 0.5, 50), 2000);
    await new Promise(resolve => setTimeout(resolve, delayMs));

    if (schema) {
      // Return a valid empty DAG structure if schema resembles our DAG requirements
      if (schema.type === 'object' && schema.properties?.nodes) {
        return JSON.stringify({ nodes: [{ id: 'mock-1', dependencies: [], prompt: 'mock node' }] });
      }
      // Array-shaped schemas (e.g. OKF concept extraction) must get an array
      // back — returning '{}' here always failed the caller's Array.isArray()
      // check downstream, silently producing zero concepts every time.
      if (schema.type === 'array') {
        return JSON.stringify([]);
      }
      // Generic object fallback for any other arbitrary schema shape
      return JSON.stringify({});
    }

    // Default structural fallback
    return `[MOCK RESPONSE] Acknowledged prompt: "${prompt.substring(0, 50)}...". Generated structural fallback payload offline.`;
  }
}
