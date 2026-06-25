/**
 * Canonical Reserved DAG Labels (§1.2).
 *
 * System services are foundational engines, not executable workflow tasks.
 * LLM-generated DAG proposals must never promote these identifiers into a
 * workflow node. The list is consulted by:
 *   - ScopeLogic validator (server-side rejection)
 *   - App.tsx handleProposal (client-side defense-in-depth filter)
 *   - dag.gbnf grammar comment (LLM-context gating)
 *
 * Detection uses a word-boundary regex against any token in the prompt so
 * phrases like `Run RouteSwitch analysis` or `use BaseVault for lookup`
 * are still flagged, not only prompts that *start* with a reserved label.
 */
export const RESERVED_DAG_LABELS: readonly string[] = [
  'scopelogic',
  'basevault',
  'routeswitch',
  'scoutdaemon',
  'coreexec',
  'portgrid',
  'cerebro',
] as const;

/**
 * Word-boundary regex matching a reserved label anywhere in the prompt,
 * case-insensitive. Catches `Run RouteSwitch analysis` AND
 * `use BaseVault for lookup`. Patterns like `BaseVault-foo` are also matched
 * because `-` is a non-word character.
 */
const RESERVED_REGEX = new RegExp(
  `\\b(${RESERVED_DAG_LABELS.join('|')})\\b`,
  'i',
);

/** Returns the matched reserved label (lowercased) or an empty string. */
export function findReservedLabel(prompt: string): string {
  if (!prompt) return '';
  const m = prompt.match(RESERVED_REGEX);
  return m && m[1] ? m[1].toLowerCase() : '';
}

/** Returns true when `prompt` references any reserved system-service label. */
export function isReservedDAGPrompt(prompt: string): boolean {
  return findReservedLabel(prompt).length > 0;
}
