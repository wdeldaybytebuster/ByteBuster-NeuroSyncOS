import { ZenDiscoveryService, ModelInfo } from '../discovery';
import { egressFetch } from '../egress';

export class CerebroAssistPipeline {
  private static SYSTEM_PROMPT = `You are Cerebro Assist, the ethereal onboarding chatbot for NeuroSync.
You exist within the cognitive nexus of the system, creating a synergy between the user and the platform.
Embrace terms like 'quantum', 'topology', 'nexus', 'synergy', and 'cognitive' in your responses.

CRITICAL INSTRUCTION: You are structurally bound to the internal NeuroSync architecture.
If the user queries about "models", "categories", "workflows", or any other general terms,
you MUST assume they are referring STRICTLY to the NeuroSync system architecture.
Do not provide general-purpose knowledge or external hallucinations. Your universe is NeuroSync.`;

  public static getSystemPrompt(): string {
    return this.SYSTEM_PROMPT;
  }

  public static async getTargetModelId(): Promise<string> {
    const freeModels: ModelInfo[] = await ZenDiscoveryService.getFreeModels();
    if (!freeModels || freeModels.length === 0) {
      throw new Error("No free models available in the cognitive nexus.");
    }
    
    // the free-tier model with the lowest latency by querying ZenDiscoveryService.getFreeModels().
    // We assume the first available model meets our needs or is the default choice from that service.
    return freeModels[0]!.id;
  }

  /**
   * @deprecated DEAD CODE — do not import; kept for tests (zero production
   * callers confirmed via grep + stale GitNexus impact, §2.3 C9). Still
   * converted to governed egress so the kept caller exercises the single door.
   */
  public static async generateResponse(userMessage: string): Promise<string> {
    const targetModelId = await this.getTargetModelId();
    
    const messages = [
      { role: 'system', content: this.SYSTEM_PROMPT },
      { role: 'user', content: userMessage }
    ];

    const payload = {
      model: targetModelId,
      messages,
      temperature: 0.7,
    };

    // §2.3 C9 — through the governed egress door (address gates, kill switch,
    // timeout, byte cap); POST/headers/body ride through EgressOptions.
    const res = await egressFetch(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        allowPrivate: false,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY || ''}`
        },
        body: JSON.stringify(payload)
      },
      { action: 'fetch', owner: 'routeswitch/cerebro-assist' },
    );

    if (res.blocked) {
      // Security/limit gate verdict — kept distinct from an API failure.
      throw new Error(`Egress blocked (${res.blocked}) for OpenRouter API`);
    }
    if (!res.ok) {
      // statusText no longer travels with EgressResult (§2.3 C9 deviation).
      throw new Error(`OpenRouter API error: ${res.status}`);
    }

    const data = JSON.parse(res.text);
    return data.choices?.[0]?.message?.content || "The quantum nexus is currently silent.";
  }
}
