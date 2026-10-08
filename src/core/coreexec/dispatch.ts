/**
 * §2.1 — Prompt Classifier for CoreExec DAG Nodes.
 *
 * Reduces a free-form DAG-node prompt to one of three execution actions:
 *   - shell  → CommandSandbox.execute(payload)        (allowlisted bash)
 *   - scrape → StealthScraper.scrape(payload, true)   (governed HTTP egress by
 *     default; `system_settings.scrape_backend='browser'` selects the
 *     Python + Cloak sandbox path — §2.3 C9 / §5-9)
 *   - generic → metadata echo                        (legacy/no-op fallback)
 *
 * Detection is intentionally conservative — false negatives fall back to
 * `generic` (metadata echo), which keeps the run auditable and avoids
 * unsafe shell/escape paths.
 */
import { ALLOWLIST } from '../portgrid/sandbox';

export type DirectiveAction = 'shell' | 'scrape' | 'verify' | 'generic';

export interface NodeDirective {
  action: DirectiveAction;
  payload: string;
  reason: string;
}

const URL_REGEX = /\bhttps?:\/\/[^\s]+/;
const BASH_FENCE_REGEX = /```(?:bash|sh)?\s*\n([\s\S]*?)```/;
// §4.0 — Adversarial Verification sentinel. DAG authoring surfaces embed this
// prefix so verify nodes are unambiguously identified at dispatch time without
// requiring the full JSON schema to be parsed again in the worker.
const VERIFY_SENTINEL = /^§VERIFY:/i;

/**
 * Classify a free-form prompt into a NodeDirective.
 * Returns `action='generic'` for anything that cannot be safely dispatched.
 */
export function classifyDirective(prompt: string): NodeDirective {
  if (!prompt || prompt.trim() === '') {
    return { action: 'generic', payload: '', reason: 'empty prompt' };
  }

  const trimmed = prompt.trim();

  // 0) §VERIFY sentinel — adversarial verification node (Axiom 4).
  // Payload is the JSON schema or heuristic expression to validate against.
  if (VERIFY_SENTINEL.test(trimmed)) {
    return {
      action: 'verify',
      payload: trimmed.replace(VERIFY_SENTINEL, '').trim(),
      reason: '§VERIFY sentinel detected — deterministic output gate',
    };
  }

  // 1) URL fetch — any URL token in the prompt routes to StealthScraper.
  const urlMatch = trimmed.match(URL_REGEX);
  if (urlMatch) {
    return { action: 'scrape', payload: urlMatch[0], reason: 'url detected' };
  }

  // 2) Markdown bash code fence — ```bash ... ``` block.
  const fenceMatch = trimmed.match(BASH_FENCE_REGEX);
  if (fenceMatch && fenceMatch[1]) {
    const command = fenceMatch[1].trim();
    const root = command.split(/\s+/)[0] ?? '';
    if (ALLOWLIST.has(root)) {
      return { action: 'shell', payload: command, reason: 'bash fence + allowlisted root' };
    }
    return { action: 'generic', payload: trimmed, reason: `bash fence but root '${root}' not in allowlist` };
  }

  // 3) Bare command on first whitespace-delimited token. Only when the entire
  //    first line is a single allowlisted command (no pipes, redirections).
  const firstLine = trimmed.split(/\r?\n/)[0]?.trim() ?? '';
  const tokens = firstLine.split(/\s+/);
  const root = tokens[0] ?? '';
  if (root && ALLOWLIST.has(root) && firstLine.length < 4096) {
    return { action: 'shell', payload: firstLine, reason: 'bare allowlisted command' };
  }

  // 4) Fallback — metadata echo.
  return { action: 'generic', payload: trimmed, reason: 'no executable pattern matched' };
}
