export interface LLMProvider {
  id: string;
  generate(prompt: string, estimatedTokens: number, schema?: any): Promise<string>;
}

export { MockProvider } from './adapters/mock-provider';
