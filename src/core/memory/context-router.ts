import { CerebroVectorStore } from './cerebro/vector';
import { queryCodeStructure } from './gitnexus-client';

/**
 * Tri-Modal Context Router.
 *
 * NeuroSync has three sources of contextual knowledge it can inject into an LLM
 * prompt:
 *   - OKF        — the curated project-knowledge graph (decisions, conventions).
 *   - GitNexus   — code structure / AST (functions, classes, call graphs).
 *   - Vector     — raw conversational memory (CerebroVectorStore).
 *
 * Instead of always consulting the same store, this router does a lightweight
 * keyword/intent classification (ML-grade routing is explicitly NOT required for
 * v1) and consults only the store(s) that match the question.
 *
 * IMPORTANT design note on OKF:
 *   RouteSwitchEngine.execute() ALREADY unconditionally injects OKF context into
 *   every prompt over 20 chars (see engine.ts). Cerebro chat goes through that
 *   same engine, so OKF is already prepended downstream. To avoid double-fetching
 *   and double-injecting the same OKF text, this router does NOT re-query OKF
 *   itself; for a "knowledge" intent it simply records that OKF is the intended
 *   source (contextBlock stays empty — the engine supplies the real block). This
 *   keeps routing observable in logs without redundant work. If the engine's
 *   blind injection is ever removed, this router should start calling
 *   OKFGraphQuery.resolveContext() here instead.
 */

export type ContextSource = 'okf' | 'gitnexus' | 'vector' | 'none';

export interface RoutedContext {
  source: ContextSource;
  contextBlock: string;
}

export type QueryIntent = 'code' | 'knowledge' | 'conversational';

// Code-structure language → GitNexus (AST / call graph).
const CODE_PATTERNS: RegExp[] = [
  /\b(function|class|method|interface|constructor|import|imports|module|package)\b/i,
  /\b(calls?|callers?|callees?|invoke[sd]?|depends?\s+on|references?)\b/i,
  /\b(defined|definition|declared|implement(s|ed|ation)?|signature)\b/i,
  /\bwhere\s+is\b/i,
  /\bhow\s+does\b.+\b(work|call|route|flow)\b/i,
  /\b(call\s*graph|execution\s+flow|blast\s+radius|refactor|ast|codebase)\b/i,
  /\.(ts|tsx|js|jsx|py|go|rs|java)\b/i, // file references
  /\b[a-z][a-zA-Z0-9]*[A-Z][a-zA-Z0-9]*\b/, // camelCase / PascalCase symbol-looking token
];

// Preference / decision / knowledge language → OKF graph.
const KNOWLEDGE_PATTERNS: RegExp[] = [
  /\bwhat\s+did\s+we\s+decide\b/i,
  /\bwhy\s+did\s+we\b/i,
  /\bwhy\s+(do|does)\s+(we|the|this)\b/i,
  /\b(decision|decided|rationale|convention|policy|guideline|standard)\b/i,
  /\b(remember|recall|prefer(ence|red)?|agreed|our\s+(approach|choice|plan))\b/i,
  /\bwhat'?s\s+our\b/i,
];

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(text));
}

/**
 * Pure, side-effect-free intent classifier. Order matters: code-structure cues
 * are checked first (they are the most specific), then knowledge cues, else the
 * query is treated as ordinary conversation.
 */
export function classifyIntent(query: string): QueryIntent {
  const q = query.trim();
  if (matchesAny(q, CODE_PATTERNS)) return 'code';
  if (matchesAny(q, KNOWLEDGE_PATTERNS)) return 'knowledge';
  return 'conversational';
}

/** Format raw conversational-memory hits into a labeled prompt block. */
function formatVectorBlock(records: { content: string; type: string; similarity?: number }[]): string {
  if (records.length === 0) return '';
  const lines = ['[CONVERSATIONAL MEMORY CONTEXT — from Cerebro vector store]'];
  for (const r of records) {
    const sim = typeof r.similarity === 'number' ? ` (sim=${r.similarity.toFixed(2)})` : '';
    lines.push(`- [${r.type}]${sim} ${r.content}`);
  }
  lines.push('[END CONVERSATIONAL MEMORY CONTEXT]\n');
  return lines.join('\n');
}

/** Wrap raw GitNexus text in a clearly-labeled block for prompt injection. */
function formatGitNexusBlock(text: string): string {
  return `[CODE STRUCTURE CONTEXT — from GitNexus]\n${text}\n[END CODE STRUCTURE CONTEXT]\n`;
}

function vectorContext(query: string, projectId?: string): RoutedContext {
  try {
    const results = CerebroVectorStore.search(query, undefined, undefined, 3)
      .filter((r) => (r.similarity ?? 0) > 0);
    if (results.length === 0) return { source: 'none', contextBlock: '' };
    return { source: 'vector', contextBlock: formatVectorBlock(results) };
  } catch {
    return { source: 'none', contextBlock: '' };
  }
}

/**
 * Route a query to the appropriate context source(s) and return the context
 * block(s) to prepend to the LLM prompt. Best-effort: never throws.
 *
 * @param query     The user's message.
 * @param projectId Optional active project scope (chat currently passes none).
 */
export async function routeQuery(query: string, projectId?: string): Promise<RoutedContext[]> {
  const intent = classifyIntent(query);

  if (intent === 'knowledge') {
    // OKF is injected downstream by RouteSwitchEngine — record the decision only.
    return [{ source: 'okf', contextBlock: '' }];
  }

  if (intent === 'code') {
    // Best-effort GitNexus. If unavailable (the common case for end users), fall
    // back to conversational memory so the user still gets *some* context.
    const gnText = await queryCodeStructure(query);
    if (gnText) {
      return [{ source: 'gitnexus', contextBlock: formatGitNexusBlock(gnText) }];
    }
    const fallback = vectorContext(query, projectId);
    return [fallback];
  }

  // conversational
  return [vectorContext(query, projectId)];
}
