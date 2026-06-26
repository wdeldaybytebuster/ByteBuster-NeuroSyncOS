import { ZenDiscoveryService, ModelInfo } from '../routeswitch/discovery';

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

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY || ''}`
      },
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.choices?.[0]?.message?.content || "The quantum nexus is currently silent.";
  }
}
