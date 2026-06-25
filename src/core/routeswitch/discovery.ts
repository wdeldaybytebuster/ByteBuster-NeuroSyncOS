export interface ModelInfo {
  id: string;
  name: string;
  context_length: number;
  pricing: any;
}

export class ModelDiscovery {
  private static cachedModels: ModelInfo[] = [];

  public static async fetchModels(): Promise<void> {
    try {
      const response = await fetch('https://openrouter.ai/api/v1/models');
      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      this.cachedModels = data.data.map((model: any) => ({
        id: model.id,
        name: model.name,
        context_length: model.context_length,
        pricing: model.pricing,
      }));
    } catch (error) {
      console.error('Error fetching OpenRouter models:', error);
    }
  }

  public static getAvailableModels(): ModelInfo[] {
    return this.cachedModels;
  }
}
