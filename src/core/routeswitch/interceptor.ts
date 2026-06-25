export interface ProviderHealth {
  tokensRemaining: number;
  isExhausted: boolean;
  resetTimeoutId?: ReturnType<typeof setTimeout> | null;
}

export class ProviderHealthState {
  private static states: Map<string, ProviderHealth> = new Map();
  private static readonly EXHAUST_THRESHOLD = 1500;

  public static getState(providerModel: string): ProviderHealth {
    if (!this.states.has(providerModel)) {
      this.states.set(providerModel, {
        tokensRemaining: Number.MAX_SAFE_INTEGER,
        isExhausted: false,
        resetTimeoutId: null,
      });
    }
    return this.states.get(providerModel)!;
  }

  public static parseRateLimitHeaders(providerModel: string, headers: Headers): void {
    const state = this.getState(providerModel);
    
    const remainingTokensStr = 
      headers.get('x-ratelimit-remaining-tokens') || 
      headers.get('anthropic-ratelimit-tokens-remaining') ||
      headers.get('x-ratelimit-remaining-requests');
      
    if (remainingTokensStr) {
      const remainingTokens = parseInt(remainingTokensStr, 10);
      if (!isNaN(remainingTokens)) {
        state.tokensRemaining = remainingTokens;
        
        if (remainingTokens < this.EXHAUST_THRESHOLD) {
          this.markExhausted(providerModel, headers);
        }
      }
    }
  }

  private static markExhausted(providerModel: string, headers: Headers): void {
    const state = this.getState(providerModel);
    if (state.isExhausted) return;
    
    state.isExhausted = true;
    console.warn(`[RouteSwitch] Model ${providerModel} is exhausted. Tokens: ${state.tokensRemaining}`);
    
    let resetDelayMs = 60000;
    const resetHeaderStr = 
      headers.get('x-ratelimit-reset-tokens') || 
      headers.get('x-ratelimit-reset-requests') ||
      headers.get('anthropic-ratelimit-tokens-reset') ||
      headers.get('-reset');
      
    if (resetHeaderStr) {
      const resetVal = parseInt(resetHeaderStr, 10);
      if (!isNaN(resetVal)) {
        if (resetVal < 1000000) {
           resetDelayMs = resetVal * 1000;
        } else if (resetVal > Date.now()) {
           resetDelayMs = resetVal - Date.now();
        } else if (resetVal * 1000 > Date.now()) {
           resetDelayMs = (resetVal * 1000) - Date.now();
        }
      }
    }
    
    if (state.resetTimeoutId) {
      clearTimeout(state.resetTimeoutId);
    }
    
    state.resetTimeoutId = setTimeout(() => {
      state.isExhausted = false;
      state.tokensRemaining = Number.MAX_SAFE_INTEGER;
      state.resetTimeoutId = null;
      console.log(`[RouteSwitch] Model ${providerModel} is back online.`);
    }, Math.max(resetDelayMs, 1000));
  }
}
