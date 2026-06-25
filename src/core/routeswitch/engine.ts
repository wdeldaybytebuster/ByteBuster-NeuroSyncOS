import { FreeModeGovernor } from './governor';
import { LLMProvider, MockProvider } from './providers';
import { TriageClassifier } from './triage';
import { ConsensusSynthesizer } from './council';

export interface RouteRequest {
  prompt: string;
  estimatedTokens: number;
  responseSchema?: any;
}

export interface RouteResponse {
  content: string;
  provider: string;
  tokensUsed: number;
  confidence?: 'High' | 'Medium' | 'Low';
  isCouncilMode?: boolean;
}

export class RouteSwitchEngine {
  private governor: FreeModeGovernor;
  private provider: LLMProvider;
  private councilProviders: LLMProvider[] = [];

  constructor(governor?: FreeModeGovernor, provider?: LLMProvider) {
    this.governor = governor || new FreeModeGovernor();
    this.provider = provider || new MockProvider();
  }

  public setProvider(provider: LLMProvider) {
    this.provider = provider;
  }

  public setCouncilProviders(providers: LLMProvider[]) {
    this.councilProviders = providers;
  }

  public async execute(request: RouteRequest): Promise<RouteResponse> {
    if (!this.governor.canProceed(request.estimatedTokens)) {
      throw new Error(`Governor blocked execution: Estimated tokens (${request.estimatedTokens}) exceeds available free tier quota.`);
    }

    // Check if Council Mode should be triggered
    const isCouncilTriggered = TriageClassifier.isHighRisk(request.prompt) && this.councilProviders.length >= 2;

    let responseContent: string;
    let finalProvider = this.provider.id;
    let confidence: 'High' | 'Medium' | 'Low' = 'High';

    if (isCouncilTriggered) {
      console.log('High-risk prompt detected. Triggering Council Mode.');
      const allProviders = [this.provider, ...this.councilProviders];
      // Note: Council mode consumes tokens across all models. We attribute the
      // multiplied token count to a synthetic 'council' provider id so the
      // 24h dashboard can show council-mode share separately from single calls.
      const consensus = await ConsensusSynthesizer.executeCouncilMode(request.prompt, request.estimatedTokens, allProviders, request.responseSchema);
      responseContent = consensus.content;
      confidence = consensus.confidence;
      finalProvider = 'Council Consensus';
      this.governor.recordUsage(request.estimatedTokens * allProviders.length, 'council');
    } else {
      responseContent = await this.provider.generate(request.prompt, request.estimatedTokens, request.responseSchema);
      this.governor.recordUsage(request.estimatedTokens, this.provider.id);
    }
    
    // Simulate token usage based on request
    const actualTokens = isCouncilTriggered ? request.estimatedTokens * (this.councilProviders.length + 1) : request.estimatedTokens;

    return {
      content: responseContent,
      provider: finalProvider,
      tokensUsed: actualTokens,
      confidence,
      isCouncilMode: isCouncilTriggered
    };
  }
}
