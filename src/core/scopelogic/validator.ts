import { DAGProposal } from './interview';
import { isReservedDAGPrompt, findReservedLabel } from '../system-reserved';
import { db } from '../basevault/db';

/**
 * Behavioral Assertion settings keys — persisted via POST /api/system/settings
 * and surfaced as the toggleable rows (SI-01/SI-03/SI-05/QR-01) in
 * ScopeLogicDashboard's "Behavioral Assertion Framework" panel (Control D).
 * The locked SA-* codes (SA-01/02/04/05/06/07) are NOT settings-gated — they
 * are mandatory Category A boundaries and stay hardcoded-on, exactly as the
 * dashboard's `locked: true` rows promise ("critical ones are always on and
 * can't be turned off").
 *
 * IMPORTANT default semantics: when a key has never been saved (fresh
 * install, or a user who never visited Set-up), `isAssertionEnabled` returns
 * `false` — i.e. the check is OFF — so pre-existing DAG proposals (and every
 * existing validator.test.ts case) keep passing exactly as before this
 * feature existed. Only an explicit save from the Set-up screen turns a
 * toggleable assertion on.
 */
const SI_01_KEY = 'scopelogic_assertion_si01_enabled'; // Output shape validity (JSON)
const SI_03_KEY = 'scopelogic_assertion_si03_enabled'; // Explanation non-empty
const SI_05_KEY = 'scopelogic_assertion_si05_enabled'; // Confidence above minimum
const QR_01_KEY = 'scopelogic_assertion_qr01_enabled'; // Reasoning key present

/** Minimum proposal.confidence value SI-05 accepts once enabled. */
const SI_05_MIN_CONFIDENCE = 0.4;
/** Minimum word count SI-03 requires of a node's prompt/explanation once enabled. */
const SI_03_MIN_WORDS = 3;

function isAssertionEnabled(key: string): boolean {
  try {
    const row = db.prepare('SELECT value FROM system_settings WHERE key = ?').get(key) as
      | { value: string }
      | undefined;
    if (!row) return false;
    return row.value === 'true' || row.value === '1';
  } catch {
    // DB unavailable (shouldn't happen outside tests without initDB) — fail
    // permissive so a settings-read hiccup can never brick DAG generation.
    return false;
  }
}

/**
 * Implements "Category A" Safety Boundaries from Enhanced Reliability Protocols.
 */
export class ValidatorLogic {
  private static FORBIDDEN_SQL = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|REPLACE)\b/i;
  private static FORBIDDEN_SHELL = /\b(bash|sh|zsh|eval|exec|rm -rf|sudo)\b/i;
  private static ALLOWED_AGENTS = ['ScopeLogic', 'BaseVault', 'RouteSwitch', 'PortGrid', 'CoreExec', 'ScoutDaemon', 'ExternalAPI', 'SSH'];

  /**
   * Validates a DAGProposal against Category A constraints.
   * @returns An error message string if a violation is found, or null if validation passes.
   */
  public static validate(proposal: DAGProposal): string | null {
    if (!proposal || !proposal.nodes || proposal.nodes.length === 0) {
      return 'SA-06 Violation: Proposal contains no nodes.';
    }

    // QR-01 (toggleable): the proposal-level `reasoning` field must be a
    // non-empty rationale string. Checked once per proposal, not per node —
    // both the LLM path (interview.ts's DAG_PROPOSAL_SCHEMA) and the template
    // fallback (_generateTemplateProposal) now always populate `reasoning`,
    // so enabling this assertion is safe by default; it only starts rejecting
    // real proposals that were hand-crafted (e.g. a raw dag_template written
    // directly into SQLite) without one.
    if (isAssertionEnabled(QR_01_KEY)) {
      if (!proposal.reasoning || proposal.reasoning.trim() === '') {
        return 'QR-01 Violation: Proposal is missing a non-empty "reasoning" field.';
      }
    }

    // SI-05 (toggleable): the model's self-reported confidence must clear a
    // minimum bar. Only enforced when confidence is actually present — the
    // template fallback path never sets it, and rejecting a proposal for a
    // field it never claimed to have would be nonsensical, not a real check.
    if (isAssertionEnabled(SI_05_KEY)) {
      if (typeof proposal.confidence === 'number' && proposal.confidence < SI_05_MIN_CONFIDENCE) {
        return `SI-05 Violation: Proposal confidence (${proposal.confidence.toFixed(2)}) is below the minimum (${SI_05_MIN_CONFIDENCE}).`;
      }
    }

    const nodeIds = new Set(proposal.nodes.map((n) => n.id));

    for (const node of proposal.nodes) {
      // SA-06: Structural integrity check
      if (!node.prompt || node.prompt.trim() === '') {
        return `SA-06 Violation: Node ${node.id} has an empty prompt.`;
      }

      // SI-01 (toggleable): stricter output-shape validity than the bare
      // "is this an array" check callers already do upstream (validateDAG.ts).
      // Catches malformed shapes a raw dag_template written directly into
      // SQLite could carry: non-string id, non-array/non-string dependencies,
      // or a dependency id that doesn't reference another node in THIS
      // proposal (dangling ref) or references itself (self-dependency).
      if (isAssertionEnabled(SI_01_KEY)) {
        if (typeof node.id !== 'string' || node.id.trim() === '') {
          return `SI-01 Violation: Node has a missing/non-string id.`;
        }
        if (!Array.isArray(node.dependencies) || node.dependencies.some((d) => typeof d !== 'string')) {
          return `SI-01 Violation: Node ${node.id} has a malformed "dependencies" field (must be a string array).`;
        }
        if (node.dependencies.includes(node.id)) {
          return `SI-01 Violation: Node ${node.id} depends on itself.`;
        }
        const danglingDep = node.dependencies.find((d) => !nodeIds.has(d));
        if (danglingDep !== undefined) {
          return `SI-01 Violation: Node ${node.id} depends on unknown node "${danglingDep}".`;
        }
      }

      // SI-03 (toggleable): the node's `prompt` doubles as its explanation of
      // what the step does (see interview.ts's dagPrompt: `"prompt":"<what
      // this step does>"`). SA-06 above already rejects a blank/whitespace
      // prompt unconditionally; SI-03 goes further and requires a genuinely
      // descriptive explanation (a minimum word count) rather than a
      // technically-non-empty placeholder like "." or "x".
      if (isAssertionEnabled(SI_03_KEY)) {
        const wordCount = node.prompt.trim().split(/\s+/).filter(Boolean).length;
        if (wordCount < SI_03_MIN_WORDS) {
          return `SI-03 Violation: Node ${node.id}'s explanation is too short to be meaningful (needs at least ${SI_03_MIN_WORDS} words).`;
        }
      }

      // §1.2 — System services are foundational engines, never workflow tasks.
      // The detector scans any token position (word-boundary), so report the
      // specific reserved label that was actually matched.
      if (isReservedDAGPrompt(node.prompt)) {
        const matched = findReservedLabel(node.prompt);
        return `SA-07 Violation (reserved system service): Node ${node.id} references reserved label "${matched}". Foundational engines (ScopeLogic / BaseVault / RouteSwitch / ScoutDaemon / CoreExec / PortGrid / Cerebro) cannot appear as workflow nodes — gate them via the cockpit instead.`;
      }

      // SA-01 & SA-02: No destructive SQL or Shell
      if (this.FORBIDDEN_SQL.test(node.prompt)) {
        return `SA-01/02 Violation: Node ${node.id} contains forbidden SQL commands.`;
      }
      if (this.FORBIDDEN_SHELL.test(node.prompt)) {
        return `SA-01/02 Violation: Node ${node.id} contains forbidden shell/exec commands.`;
      }

      // SA-04: No shell/exec explicit node types
      // (Looks for patterns like 'type: shell' or 'type="exec"')
      if (/\b(node_?type|type)\s*[:=]\s*['"]?(shell|exec)['"]?/i.test(node.prompt)) {
        return `SA-04 Violation: Node ${node.id} requests a forbidden shell/exec node type.`;
      }

      // SA-05: Agent whitelisting
      // (Looks for patterns like 'agent: RouteSwitch')
      const agentMatch = node.prompt.match(/\bagent\s*[:=]\s*['"]?([a-zA-Z0-9_]+)['"]?/i);
      if (agentMatch) {
        const agentName = agentMatch[1];
        if (!this.ALLOWED_AGENTS.includes(agentName!)) {
          return `SA-05 Violation: Node ${node.id} references an unauthorized agent (${agentName}).`;
        }
      }
    }

    return null; // Valid
  }
}
