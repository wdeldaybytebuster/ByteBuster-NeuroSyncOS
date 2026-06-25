import React, { useState, useEffect } from 'react';
import { DAGNode } from '../../core/coreexec/engine';
import { assessWorkflowRisk, RiskAssessment } from '../../core/scopelogic/risk';

interface ApprovalCockpitProps {
  proposal: { nodes: DAGNode[] };
  onApprove: () => void;
  onReject: () => void;
}

export function ApprovalCockpit({ proposal, onApprove, onReject }: ApprovalCockpitProps) {
  const [risk, setRisk] = useState<RiskAssessment | null>(null);
  const [signature, setSignature] = useState('');

  useEffect(() => {
    if (proposal && proposal.nodes) {
      setRisk(assessWorkflowRisk(proposal.nodes));
    }
  }, [proposal]);

  if (!risk) return null;

  const handleApprove = () => {
    if (risk.tier === 'HIGH' && signature !== 'I APPROVE') {
      alert('You must type "I APPROVE" to execute this high-risk workflow.');
      return;
    }
    onApprove();
  };

  const getTierColor = () => {
    if (risk.tier === 'HIGH') return 'red';
    if (risk.tier === 'MEDIUM') return 'orange';
    return 'green';
  };

  return (
    <div style={{
      border: `2px solid ${getTierColor()}`,
      padding: '16px',
      margin: '16px 0',
      borderRadius: '8px',
      backgroundColor: 'var(--panel-bg, #1e1e2e)'
    }}>
      <h3 style={{ color: getTierColor(), margin: '0 0 8px 0' }}>
        {risk.tier} RISK WORKFLOW PROPOSAL
      </h3>
      
      <ul style={{ fontSize: '0.9em', color: '#a6accd', marginBottom: '16px' }}>
        {risk.reasons.map((reason, idx) => <li key={idx}>{reason}</li>)}
      </ul>

      {risk.tier === 'HIGH' && (
        <div style={{ marginBottom: '16px' }}>
          <p style={{ color: '#f07178', fontSize: '0.9em', fontWeight: 'bold' }}>
            EXECUTIVE COCKPIT: MANDATORY SIGNATURE REQUIRED
          </p>
          <input 
            type="text" 
            placeholder='Type "I APPROVE"' 
            value={signature}
            onChange={e => setSignature(e.target.value)}
            style={{
              width: '100%',
              padding: '8px',
              border: '1px solid #f07178',
              backgroundColor: '#1a1b26',
              color: '#fff',
              borderRadius: '4px'
            }}
          />
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px' }}>
        <button 
          onClick={handleApprove}
          style={{
            padding: '8px 16px',
            backgroundColor: getTierColor(),
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: 'bold',
            opacity: (risk.tier === 'HIGH' && signature !== 'I APPROVE') ? 0.5 : 1
          }}
        >
          {risk.tier === 'HIGH' ? 'EXECUTE HIGH-RISK WORKFLOW' : 'APPROVE'}
        </button>
        <button 
          onClick={onReject}
          style={{
            padding: '8px 16px',
            backgroundColor: 'transparent',
            color: '#a6accd',
            border: '1px solid #4e5579',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          REJECT
        </button>
      </div>
    </div>
  );
}
