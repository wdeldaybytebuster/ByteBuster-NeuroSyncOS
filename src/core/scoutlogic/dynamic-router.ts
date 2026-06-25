export interface Model {
  id: string;
  context_limit?: number;
  [key: string]: any;
}

export interface Benchmark {
  model_id: string;
  avg_latency_ms?: number;
  avg_tps?: number;
  failure_rate?: number;
  [key: string]: any;
}

export function selectOptimalModel(
  complexity: 'trivial' | 'logical' | 'complex',
  userPriority: 'speed' | 'cost' | 'intelligence',
  availableModels: Model[],
  benchmarks: Benchmark[]
): string {
  if (!availableModels || availableModels.length === 0) {
    throw new Error('No models available');
  }

  let bestModelId = availableModels[0].id;
  let maxScore = -Infinity;

  for (const model of availableModels) {
    let score = 0;
    const benchmark = benchmarks.find((b) => b.model_id === model.id);
    const avgTps = benchmark?.avg_tps || 0;

    const isFlagship = model.id.includes('gpt-4') || model.id.includes('claude-3-5');
    const isFast = model.id.includes('llama3') || model.id.includes('mixtral');
    const hasHighContext = model.context_limit && model.context_limit >= 32000;

    if (userPriority === 'intelligence' || complexity === 'complex') {
      if (isFlagship) {
        score += 10000;
      }
      if (hasHighContext) {
        score += 5000;
      }
    } else if (userPriority === 'speed' && complexity === 'trivial') {
      if (avgTps > 0) {
        // High TPS is heavily weighted
        score += avgTps * 100;
      } else if (isFast) {
        // Fallback to known fast models
        score += 5000;
      }
    } else if (userPriority === 'cost') {
      // Basic cost fallback if needed
      if (!isFlagship) {
        score += 1000;
      }
    } else {
      // General fallback 
      score += avgTps;
    }

    if (score > maxScore) {
      maxScore = score;
      bestModelId = model.id;
    }
  }

  return bestModelId;
}
