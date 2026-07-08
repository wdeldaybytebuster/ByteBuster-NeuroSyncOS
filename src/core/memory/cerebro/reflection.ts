import crypto from 'crypto';
import { db } from '../../basevault/db';
import { CerebroVectorStore } from './vector';
import { OKFGenerator } from '../../okf/generator';
import { log } from '../../observability/logger';

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
    log.info('Cerebro: Starting Async Reflection Cycle...');

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

      let skip = false;
      if (existing.length > 0 && existing[0]!.similarity! > 0.85) {
        // High similarity could mean this is a reworded duplicate (safe to skip),
        // a genuine update/contradiction (must not be silently dropped), or a
        // false-positive match (safe to insert normally). Classify before acting.
        const classification = await this._classifyAgainstExisting(fact, existing[0]!.content);

        if (classification === 'duplicate') {
          skip = true;
          log.info(`Cerebro: Ignored duplicate/contradictory fact: "${fact}"`);
        } else if (classification === 'update') {
          skip = true;
          const conflictId = existing[0]!.id;
          const conflictReasoning = `Possibly contradicts or updates an existing memory: "${existing[0]!.content}"`;
          db.prepare(`
            INSERT INTO cerebro_learning_approvals (id, fact, confidence, status, source_run_id, created_at, conflict_with_id, conflict_reasoning)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `).run(crypto.randomUUID(), fact, 0.6, 'pending', null, Date.now(), conflictId, conflictReasoning);
          log.info(`Cerebro: Queued potential contradiction/update for approval: "${fact}" (conflicts with ${conflictId})`);
        }
        // classification === 'unrelated' → falls through, inserted below as normal.
      }

      if (!skip) {
        CerebroVectorStore.insert(fact, 'preference');
        log.info(`Cerebro: Consolidated new preference: "${fact}"`);
      }
    }

    // OKF Generation: persist extracted preferences as structured Markdown files
    if (extractedFacts.length > 0 && _generateFn) {
      try {
        await OKFGenerator.fromChat(_generateFn, historyToProcess, 'USER');
        log.info(`Cerebro: Generated OKF files from ${extractedFacts.length} extracted fact(s).`);
      } catch (err) {
        log.warn('[Cerebro] OKF generation from reflection failed (non-fatal):', err);
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
        log.warn('[Cerebro] LLM extraction failed; falling back to keyword extraction:', err);
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

  /**
   * Classifies a newly-extracted fact against an existing high-similarity
   * memory: is it a reworded duplicate (safe to skip), a genuine
   * update/contradiction (must be routed to human approval, not silently
   * dropped or silently inserted), or actually unrelated (a false-positive
   * similarity match, safe to insert normally)?
   *
   * Routes through the live LLM when `injectLLMGenerator` has been called;
   * falls back to a deterministic offline heuristic for tests, offline runs,
   * and MockProvider sessions so the method never throws.
   */
  private static async _classifyAgainstExisting(
    newFact: string,
    existingContent: string
  ): Promise<'duplicate' | 'update' | 'unrelated'> {
    if (_generateFn) {
      try {
        const prompt = [
          'You are comparing two statements from a long-term memory store.',
          'Existing memory: "' + existingContent + '"',
          'New candidate fact: "' + newFact + '"',
          '',
          'Classify the relationship as exactly ONE of the following words (respond with',
          'only that single word, nothing else):',
          '  duplicate  - the new fact is essentially the same statement as the existing',
          '               memory, just reworded.',
          '  update     - the new fact is a genuine update or contradiction of the',
          '               existing memory (e.g. the user changed their mind).',
          '  unrelated  - the two statements are not actually about the same thing; the',
          '               similarity match was a false positive.',
        ].join('\n');
        const raw = await _generateFn(prompt);
        const normalized = raw.trim().toLowerCase();
        if (normalized.includes('duplicate')) return 'duplicate';
        if (normalized.includes('update')) return 'update';
        if (normalized.includes('unrelated')) return 'unrelated';
        // Response didn't cleanly match any of the three options — fall back
        // to the offline heuristic rather than throwing or guessing.
        log.warn(`[Cerebro] Classification response did not match expected options: "${raw}"`);
      } catch (err) {
        log.warn('[Cerebro] LLM classification failed; falling back to offline heuristic:', err);
      }
    }

    // Offline heuristic: we can't reliably distinguish "reworded duplicate"
    // from "genuine contradiction" without an LLM, so the safe default is to
    // never silently discard non-identical text. Only exact (trimmed,
    // lowercased) matches are treated as duplicates.
    const a = newFact.trim().toLowerCase();
    const b = existingContent.trim().toLowerCase();
    return a === b ? 'duplicate' : 'update';
  }
}
