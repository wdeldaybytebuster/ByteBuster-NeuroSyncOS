import { DAGNode } from '../coreexec/engine';

export type RiskTier = 'LOW' | 'MEDIUM' | 'HIGH';

export interface RiskAssessment {
  tier: RiskTier;
  reasons: string[];
}

const HIGH_RISK_KEYWORDS = [
  'delete', 'remove', 'rm', 'drop', 'truncate', 'password', 'secret', 'key', 'auth', 'credentials'
];

const MEDIUM_RISK_KEYWORDS = [
  'update', 'insert', 'write', 'modify', 'change', 'post', 'put', 'patch'
];

export function assessWorkflowRisk(nodes: DAGNode[]): RiskAssessment {
  const reasons: string[] = [];
  let highestTier: RiskTier = 'LOW';

  for (const node of nodes) {
    const content = JSON.stringify(node).toLowerCase();

    // Check High Risk
    for (const kw of HIGH_RISK_KEYWORDS) {
      if (content.includes(kw)) {
        highestTier = 'HIGH';
        reasons.push(`Node ${node.id} contains high-risk keyword: '${kw}'`);
      }
    }

    // Check Medium Risk
    if (highestTier !== 'HIGH') {
      for (const kw of MEDIUM_RISK_KEYWORDS) {
        if (content.includes(kw)) {
          highestTier = 'MEDIUM';
          reasons.push(`Node ${node.id} contains medium-risk keyword: '${kw}'`);
        }
      }
    }
  }

  // If no specific risk found, but there are nodes, it's low risk
  if (highestTier === 'LOW' && nodes.length > 0) {
    reasons.push('All nodes evaluated as read-only or low risk.');
  }

  return {
    tier: highestTier,
    reasons: [...new Set(reasons)] // deduplicate
  };
}
