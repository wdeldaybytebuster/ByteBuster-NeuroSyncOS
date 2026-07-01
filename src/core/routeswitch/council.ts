import { LLMProvider } from './providers';

export interface ConsensusResult {
  content: string;
  /** Numeric confidence, 0.0-1.0. Derived from disagreementScore as 1 - min(disagreementScore, 1). */
  confidence: number;
  disagreementScore: number;
}

export class ConsensusSynthesizer {
  /**
   * Executes multiple providers in parallel and synthesizes a consensus response.
   */
  public static async executeCouncilMode(
    prompt: string, 
    estimatedTokens: number, 
    providers: LLMProvider[],
    schema?: any
  ): Promise<ConsensusResult> {
    
    // Execute all providers in parallel (limited by network/threads)
    const promises = providers.map(p => p.generate(prompt, estimatedTokens, schema).catch(e => null));
    const results = await Promise.all(promises);

    const validResults = results.filter((r): r is string => r !== null && r.trim() !== '');

    if (validResults.length === 0) {
      throw new Error('All council providers failed to generate a response.');
    }

    if (validResults.length === 1) {
      return { content: validResults[0]!, confidence: 0, disagreementScore: 1.0 };
    }

    // In a full implementation, we'd use another LLM call or structural AST diffing to compare the DAGs.
    // Here we do a basic length/keyword heuristic to pick the most robust one.
    
    // Simple heuristic: pick the longest valid response (often the most detailed DAG),
    // but check how much lengths vary to estimate "disagreement".
    const lengths = validResults.map(r => r.length);
    const avgLength = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    
    let maxDiff = 0;
    for (const len of lengths) {
      const diff = Math.abs(len - avgLength) / avgLength;
      if (diff > maxDiff) maxDiff = diff;
    }

    // Higher maxDiff -> Higher disagreement -> lower confidence
    const confidence = 1 - Math.min(maxDiff, 1);

    const chosenResponse = validResults.reduce((a, b) => a.length > b.length ? a : b);

    return {
      content: chosenResponse,
      confidence,
      disagreementScore: maxDiff
    };
  }
}
