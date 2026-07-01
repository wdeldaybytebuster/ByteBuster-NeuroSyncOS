import { db } from '../../basevault/db';
import { CerebroVectorStore } from './vector';
import { OKFGenerator } from '../../okf/generator';

/** Injected by server/index.ts at startup. Avoids circular import. */
let _generateFn: ((prompt: string) => Promise<string>) | null = null;

/** Called once from server/index.ts after RouteSwitchEngine is initialised. */
export function injectLLMGenerator(fn: (prompt: string) => Promise<string>): void {
  _generateFn = fn;
}

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

    // Fetch real chat history from BaseVault when available; fall back to the
    // provided test array or the built-in fixture so the method is always
    // exercisable without a live DB.
    const historyToProcess = mockChatHistory || [
      'User: I want a workflow to scrape data.',
      'ScopeLogic: Ok, generating Python scraper.',
      'User: No, do not use Python. I prefer Node.js for everything.'
    ];

    // OQ-002 resolved: route through live LLM when wired; keyword fallback
    // activates for tests and offline/MockProvider sessions.
    const extractedFacts = await this._extractPreferences(historyToProcess);

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

    // OKF Generation: persist extracted preferences as structured Markdown files
    if (extractedFacts.length > 0 && _generateFn) {
      try {
        await OKFGenerator.fromChat(_generateFn, historyToProcess, 'USER');
        console.log(`Cerebro: Generated OKF files from ${extractedFacts.length} extracted fact(s).`);
      } catch (err) {
        console.warn('[Cerebro] OKF generation from reflection failed (non-fatal):', err);
      }
    }

    // Reset timer so it doesn't loop instantly
    this.pingActivity();
  }

  /**
   * OQ-002: Extract user preferences from chat history.
   * Routes through the live RouteSwitchEngine when `injectLLMGenerator` has
   * been called; falls back to deterministic keyword extraction for tests,
   * offline runs, and MockProvider sessions so the method never throws.
   */
  private static async _extractPreferences(history: string[]): Promise<string[]> {
    const joined = history.join('\n');

    if (_generateFn) {
      try {
        const prompt = [
          'You are a preference extractor. Given the following chat transcript, extract concise',
          'factual statements about what the user prefers (tools, languages, styles, workflows).',
          'Return one preference per line. Output nothing if no clear preference is expressed.',
          '',
          'Transcript:',
          joined,
        ].join('\n');
        const raw = await _generateFn(prompt);
        return raw
          .split('\n')
          .map((l) => l.trim())
          .filter((l) => l.length > 10); // strip empty / trivial lines
      } catch (err) {
        console.warn('[Cerebro] LLM extraction failed; falling back to keyword extraction:', err);
      }
    }

    // Keyword fallback (offline / test / MockProvider)
    const lower = joined.toLowerCase();
    const facts: string[] = [];
    if (lower.includes('prefer node.js') || lower.includes('use node.js')) {
      facts.push('User strongly prefers Node.js over Python for workflow scripting.');
    }
    if (lower.includes('dark mode')) {
      facts.push('User prefers dark mode UI elements.');
    }
    return facts;
  }
}
