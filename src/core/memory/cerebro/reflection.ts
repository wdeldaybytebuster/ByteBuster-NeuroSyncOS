import { db } from '../../basevault/db';
import { CerebroVectorStore } from './vector';

export class ReflectionExecutor {
  private static lastActivityTime: number = Date.now();
  private static timer: NodeJS.Timeout | null = null;
  private static readonly IDLE_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

  /**
   * Called by PortGrid / ScopeLogic on every user action to reset the idle timer.
   */
  public static pingActivity() {
    this.lastActivityTime = Date.now();
  }

  /**
   * Starts the background reflection loop.
   */
  public static startDaemon() {
    if (this.timer) clearInterval(this.timer);

    // Check every 5 minutes if we have reached the 30-minute idle threshold
    this.timer = setInterval(async () => {
      const idleTime = Date.now() - this.lastActivityTime;
      if (idleTime >= this.IDLE_THRESHOLD_MS) {
        await this.runReflectionCycle();
      }
    }, 5 * 60 * 1000);
  }

  public static stopDaemon() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * The core learning logic. Safe to call manually for tests.
   */
  public static async runReflectionCycle(mockChatHistory?: string[]) {
    console.log('Cerebro: Starting Async Reflection Cycle...');
    
    // In a real implementation, we'd fetch actual chat logs from BaseVault.
    // Here we use mock data or the provided test array.
    const historyToProcess = mockChatHistory || [
      'User: I want a workflow to scrape data.',
      'ScopeLogic: Ok, generating Python scraper.',
      'User: No, do not use Python. I prefer Node.js for everything.'
    ];

    // Simulate LLM extraction of preferences from chat logs
    // A real implementation would pass this history to RouteSwitch to extract facts.
    const extractedFacts = this._mockExtractPreferences(historyToProcess);

    for (const fact of extractedFacts) {
      // Pre-Consolidation Validation: Check for semantic drift/contradictions
      // Search memory for existing facts similar to the new one
      const existing = CerebroVectorStore.search(fact, 'preference', undefined, 1);
      
      let isContradiction = false;
      if (existing.length > 0 && existing[0]!.similarity! > 0.85) {
        // High similarity means we already know this or something very close to it.
        // We could implement contradiction logic here. For now, we skip duplicates to prevent bloat.
        isContradiction = true;
      }

      if (!isContradiction) {
        CerebroVectorStore.insert(fact, 'preference');
        console.log(`Cerebro: Consolidated new preference: "${fact}"`);
      } else {
        console.log(`Cerebro: Ignored duplicate/contradictory fact: "${fact}"`);
      }
    }

    // Reset timer so it doesn't loop instantly
    this.pingActivity();
  }

  private static _mockExtractPreferences(history: string[]): string[] {
    const joined = history.join(' ').toLowerCase();
    const facts: string[] = [];

    if (joined.includes('prefer node.js') || joined.includes('use node.js')) {
      facts.push('User strongly prefers Node.js over Python for workflow scripting.');
    }

    if (joined.includes('dark mode')) {
      facts.push('User prefers dark mode UI elements.');
    }

    return facts;
  }
}
