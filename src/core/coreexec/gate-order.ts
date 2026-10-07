/**
 * §2.3 C8-c — gate-order: resolve WHICH Phase-5 permission action a task needs
 * and enforce it BEFORE anything is dispatched (V3).
 *
 * THE BUG UNDER TEST (§0-V3 ordering): worker.ts dispatched `executePlugin`
 * (including okf_indexer's raw `fetch(url)`) and returned at :295 — BEFORE the
 * permission gate at :305 — so a network plugin's egress fired with ZERO
 * policy checks, and only shell/scrape were ever gated.
 *
 * This module is the seam worker.ts calls instead:
 *   1. `pluginNeedsNetwork` mirrors executePlugin's REAL fetch condition
 *      (`files && Array.isArray(files)` returns first; `content = mockContent`;
 *      the fetch only happens at `if (!content && url)`), so the gate tracks
 *      what the code will actually do — including the truthy non-array `files`
 *      hole, which stays gated (fail-closed).
 *   2. `resolveGateAction` is the plan's singular resolver: network → 'fetch',
 *      else the directive's shell/scrape, else null.
 *   3. `resolveGateActions` keeps BOTH actions when a task is a combo (network
 *      plugin AND a shell/scrape directive) so the singular resolver can't
 *      gate only one of the two — test 7 proves a shell-denied project blocks
 *      even when fetch is allowed.
 *   4. `gateAndDispatch` runs every resolved action through
 *      `checkActionPermission` and only then invokes the dispatch closure —
 *      the closure (worker's plugin branch) is NEVER called when any action is
 *      denied.
 *
 * Pure: no worker threads, no network, no server-main import (§4.2).
 */
import { classifyDirective } from './dispatch';
import type { NodeDirective } from './dispatch';
import { checkActionPermission } from './permission-gate';
import type { GateAction } from './permission-gate';

/** Structural view of worker's `WorkerInput` — keeps this module dependency-free. */
export interface GateInput {
  plugin?: string;
  params?: Record<string, any> | undefined;
  directive?: NodeDirective | undefined;
  prompt?: string | undefined;
}

/**
 * True when executing this input can put bytes on the wire.
 *
 * Mirrors executePlugin's okf_indexer path exactly:
 *   - no plugin            → no plugin branch runs at all
 *   - `files && Array.isArray(files)` → indexes files and RETURNS (no fetch).
 *     A truthy NON-array `files` does NOT take that branch, so it still falls
 *     through to `if (!content && url)` — hence `!Array.isArray(...)` rather
 *     than the plan sketch's `!params.files` (fail-closed refinement).
 *   - `mockContent` set    → `!content` is false → no fetch
 *   - `url` present        → the fetch condition
 */
export function pluginNeedsNetwork(input: GateInput): boolean {
  if (!input.plugin) return false;
  const params = input.params;
  if (!params?.url) return false;
  if (Array.isArray(params.files)) return false;
  if (params.mockContent) return false;
  return true;
}

function resolveDirective(input: GateInput, directive?: NodeDirective): NodeDirective {
  return directive ?? input.directive ?? classifyDirective(input.prompt ?? '');
}

/** Plan §2.3 C8-c singular resolver: network → 'fetch', else shell/scrape, else null. */
export function resolveGateAction(input: GateInput, directive?: NodeDirective): GateAction | null {
  if (pluginNeedsNetwork(input)) return 'fetch';
  const d = resolveDirective(input, directive);
  if (d.action === 'shell' || d.action === 'scrape') return d.action;
  return null;
}

/** EVERY action the task needs gated — a network plugin + shell directive needs both. */
export function resolveGateActions(input: GateInput, directive?: NodeDirective): GateAction[] {
  const actions: GateAction[] = [];
  if (pluginNeedsNetwork(input)) actions.push('fetch');
  const d = resolveDirective(input, directive);
  if ((d.action === 'shell' || d.action === 'scrape') && !actions.includes(d.action)) {
    actions.push(d.action);
  }
  return actions;
}

export type GateOutcome<T> =
  | { blocked: true; action: GateAction; reason: string }
  | { blocked: false; action: GateAction | null; output: T | undefined };

/**
 * Gate EVERY resolved action, then dispatch. The dispatch closure runs exactly
 * once and only when nothing was denied — this is the ordering fix: the check
 * can no longer happen after the side effect.
 */
export async function gateAndDispatch<T>(
  input: GateInput,
  directive: NodeDirective | undefined,
  projectId: string | undefined,
  dispatch: () => Promise<T | undefined>,
): Promise<GateOutcome<T>> {
  const actions = resolveGateActions(input, directive);
  for (const action of actions) {
    const res = await checkActionPermission(projectId, action);
    if (res.blocked) {
      return { blocked: true, action, reason: res.reason };
    }
  }
  const output = await dispatch();
  return { blocked: false, action: actions[0] ?? null, output };
}
