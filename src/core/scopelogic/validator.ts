import { DAGProposal } from './interview';
import { isReservedDAGPrompt, findReservedLabel } from '../system-reserved';

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

    for (const node of proposal.nodes) {
      // SA-06: Structural integrity check
      if (!node.prompt || node.prompt.trim() === '') {
        return `SA-06 Violation: Node ${node.id} has an empty prompt.`;
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
