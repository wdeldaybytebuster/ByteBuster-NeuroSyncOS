import { ProviderHealthState } from './interceptor.js';
import { ZenDiscoveryService } from './discovery';
import { log } from '../observability/logger';
import { egressFetch } from './egress';

/**
 * @deprecated DEAD CODE — do not import; kept for tests (router.test.ts) and
 * the operator script scripts/live-test.ts (§2.3 C9 — zero production callers
 * confirmed via grep + stale GitNexus impact). The live chat path no longer
 * runs through here. Still converted to governed egress so the kept callers
 * exercise the same single door as production traffic.
 */
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
    log.warn('[RouteSwitch] Failed to fetch dynamic free models:', e);
  }

  for (let i = 0; i < currentChain.length; i++) {
    const model = currentChain[i];
    if (!model) continue;
    const state = ProviderHealthState.getState(model);
    
    if (state.isExhausted) {
      log.info(`[RouteSwitch] Skipping ${model} due to exhaustion.`);
      continue; 
    }
    
    try {
      log.info(`[RouteSwitch] Routing request to ${model}...`);

      // §2.3 C9 — the completion request goes through the governed egress
      // door (RouteSwitch owns egress): address gates, kill switch, 15s
      // timeout and byte cap all apply. POST method/headers/body ride through
      // via EgressOptions (same values as the old raw fetch).
      const res = await egressFetch(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          allowPrivate: false,
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
          }),
        },
        { action: 'fetch', owner: 'routeswitch/router' },
      );

      // Rate-limit state is read BEFORE the ok-check so a 429 still lands
      // (and a blocked result's empty headers parse as a harmless no-op).
      ProviderHealthState.parseRateLimitHeaders(model, new Headers(res.headers));

      if (res.blocked) {
        // Security/limit gate verdict — distinct from an API failure.
        throw new Error(`Egress blocked (${res.blocked}) for ${model}`);
      }
      if (!res.ok) {
        if (res.status === 429) {
          const fakeHeaders = new Headers(res.headers);
          if (!fakeHeaders.has('x-ratelimit-remaining-tokens')) {
             fakeHeaders.set('x-ratelimit-remaining-tokens', '0');
          }
          ProviderHealthState.parseRateLimitHeaders(model, fakeHeaders);
          log.warn(`[RouteSwitch] 429 Too Many Requests on ${model}. Trying fallback.`);
          continue; 
        }
        // statusText no longer travels with EgressResult (§2.3 C9 deviation).
        throw new Error(`API error: ${res.status}`);
      }

      const data = JSON.parse(res.text);
      return data;
      
    } catch (error) {
      log.error(`[RouteSwitch] Error requesting ${model}:`, error);
    }
  }

  throw new Error('[RouteSwitch] All models in the fallback chain failed or are exhausted.');
}
