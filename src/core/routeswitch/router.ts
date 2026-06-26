import { ProviderHealthState } from './interceptor.js';
import { ZenDiscoveryService } from './discovery';

export async function executeWithFallback(
  prompt: string,
  fallbackChain: string[] = ['groq/llama3-8b-8192', 'google/gemini-1.5-pro']
): Promise<any> {
  const apiKey = process.env.OPENROUTER_API_KEY || '';

  let currentChain = [...fallbackChain];
  try {
    const freeModels = await ZenDiscoveryService.getFreeModels();
    if (freeModels && freeModels.length > 0) {
      currentChain = Array.from(new Set([...fallbackChain, ...freeModels.map(m => m.id)]));
    }
  } catch (e) {
    console.warn('[RouteSwitch] Failed to fetch dynamic free models:', e);
  }

  for (let i = 0; i < currentChain.length; i++) {
    const model = currentChain[i];
    if (!model) continue;
    const state = ProviderHealthState.getState(model);
    
    if (state.isExhausted) {
      console.log(`[RouteSwitch] Skipping ${model} due to exhaustion.`);
      continue; 
    }
    
    try {
      console.log(`[RouteSwitch] Routing request to ${model}...`);
      
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://github.com/williamdeldaymarketing/NeuroSyncMega', 
          'X-Title': 'NeuroSyncMega RouteSwitch',
        },
        body: JSON.stringify({
          model: model,
          messages: [{ role: 'user', content: prompt }]
        })
      });

      ProviderHealthState.parseRateLimitHeaders(model, response.headers);

      if (!response.ok) {
        if (response.status === 429) {
          const fakeHeaders = new Headers(response.headers);
          if (!fakeHeaders.has('x-ratelimit-remaining-tokens')) {
             fakeHeaders.set('x-ratelimit-remaining-tokens', '0');
          }
          ProviderHealthState.parseRateLimitHeaders(model, fakeHeaders);
          console.warn(`[RouteSwitch] 429 Too Many Requests on ${model}. Trying fallback.`);
          continue; 
        }
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return data;
      
    } catch (error) {
      console.error(`[RouteSwitch] Error requesting ${model}:`, error);
    }
  }

  throw new Error('[RouteSwitch] All models in the fallback chain failed or are exhausted.');
}
