import React, { useState, useEffect, useCallback } from 'react';
import { AppShell } from '../components/AppShell';
import { useNavigation } from '../layouts/OSLayout';
import { Grid3X3, Shield, CheckCircle, XCircle, Eye, Terminal, Award, Wrench, Users, Lock, Accessibility, AlertTriangle, Sparkles } from 'lucide-react';
import { OKFWorkspaceWidget } from '../components/OKFWorkspaceWidget';
import { OKFMindmap } from '../components/OKFMindmap';
import { DeferenceUI } from '../components/DeferenceUI';
import { EmbeddedTerminal } from '../components/EmbeddedTerminal';
import { buildApprovalItems, partitionByConfidence, partitionByKind, type ApprovalItem } from '../lib/approvalQueue';
import { ReactFlow, Controls, Background, BackgroundVariant, Handle, Position, useNodesState, useEdgesState } from '@xyflow/react';
import type { Node, Edge } from '@xyflow/react';

const API = 'http://localhost:3743';
const ACCENT = '#00FFCC';

// Shared glow box (mint/teal glow)
const GLOW_BOX = `bg-white/[0.02] border border-white/5 rounded-xl p-5 backdrop-blur-sm transition-all duration-300 shadow-[0_0_15px_rgba(0,255,204,0.08)] hover:shadow-[0_0_30px_rgba(0,255,204,0.2)] hover:border-[rgba(0,255,204,0.25)]`;

// ─── Custom DAG Node for ReactFlow ──────────────────────────────────────────
const statusColors: Record<string, string> = { completed: '#22c55e', claimed: '#00FFCC', failed: '#ef4444', unclaimed: '#6b7280', parked: '#f59e0b', draft: '#00FFCC' };

function DAGNode({ data }: any) {
  return (
    <div className={`px-4 py-3 rounded-lg border backdrop-blur-sm min-w-[160px] ${
      data.status === 'completed' ? 'bg-green-500/10 border-green-500/30' :
      data.status === 'claimed' ? 'bg-cyan-500/10 border-cyan-500/30' :
      data.status === 'failed' ? 'bg-red-500/10 border-red-500/30' :
      'bg-white/5 border-white/10'
    }`}>
      <Handle type="target" position={Position.Top} className="!bg-white/30 !w-2 !h-2" />
      <div className="text-[10px] font-mono font-bold uppercase tracking-wider mb-1" style={{ color: statusColors[data.status] || '#6b7280' }}>{data.status}</div>
      <div className="text-xs text-white font-semibold truncate">{data.label}</div>
      <Handle type="source" position={Position.Bottom} className="!bg-white/30 !w-2 !h-2" />
    </div>
  );
}

const nodeTypes = { dag: DAGNode };

// ─── Types ──────────────────────────────────────────────────────────────────
interface OsTodo { id: string; severity: string; escalation_reason: string; required_action_type: string; status: string; confidence: number; }

// ─── Dashboard View ─────────────────────────────────────────────────────────
function DashboardView() {
  const { activeProjectId, navigate } = useNavigation();
  const [approvalQueue, setApprovalQueue] = useState<OsTodo[]>([]);
  const [toolCalls, setToolCalls] = useState<{tool:string;status:string;time:string}[]>([]);

  // Pending proposal from ScopeLogic (System B — now dag_proposals backed)
  const [pendingProposal, setPendingProposal] = useState<any>(null);
  const [proposalId, setProposalId] = useState<string | null>(null);
  const [proposalConfidence, setProposalConfidence] = useState<number>(0.5);
  const [proposalNodes, setProposalNodes, onProposalNodesChange] = useNodesState([] as Node[]);
  const [proposalEdges, setProposalEdges, onProposalEdgesChange] = useEdgesState([] as Edge[]);
  const [approving, setApproving] = useState(false);
  const [showMindmap, setShowMindmap] = useState(false);
  const [showTerminal, setShowTerminal] = useState(false);

  // Fetch pending proposal on mount
  useEffect(() => {
    fetch(`${API}/api/system/proposals/pending`).then(r => r.json()).then(d => {
      if (d.success && d.proposal) {
        setPendingProposal(d.proposal);
        setProposalId(d.id ?? null);
        setProposalConfidence(typeof d.confidence === 'number' ? d.confidence : 0.5);
        // Convert proposal nodes to ReactFlow visual nodes
        const nodes = d.proposal.nodes || [];
        const rfNodes: Node[] = nodes.map((n: any, i: number) => ({
          id: n.id,
          type: 'dag',
          position: { x: 200, y: i * 140 + 40 },
          data: { label: n.prompt || `Step ${i + 1}`, status: 'draft' },
        }));
        const rfEdges: Edge[] = nodes.slice(1).map((n: any, i: number) => ({
          id: `e-${nodes[i].id}-${n.id}`,
          source: nodes[i].id,
          target: n.id,
          animated: true,
          style: { stroke: ACCENT, strokeWidth: 2 },
        }));
        setProposalNodes(rfNodes);
        setProposalEdges(rfEdges);
      }
    }).catch(() => {});
  }, []);

  const clearProposalState = () => {
    setPendingProposal(null);
    setProposalId(null);
    setProposalNodes([]);
    setProposalEdges([]);
  };

  // Approve proposal → human-gated CoreExec launch → mark proposal approved →
  // clear → navigate. The AI never launches on its own; this runs on a click.
  const handleApproveProposal = async () => {
    if (!pendingProposal) return;
    setApproving(true);
    try {
      await fetch(`${API}/api/coreexec/approve`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proposal: pendingProposal, projectId: activeProjectId || undefined })
      });
      if (proposalId) {
        await fetch(`${API}/api/system/proposals/resolve`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: proposalId })
        });
      } else {
        // Legacy path: no id (shouldn't happen post-migration) — fall back to clear.
        await fetch(`${API}/api/system/proposals/pending`, { method: 'DELETE' });
      }
      clearProposalState();
      navigate('coreexec');
    } catch {}
    setApproving(false);
  };

  // Reject proposal → mark rejected → clear → navigate back to ScopeLogic
  const handleRejectProposal = async () => {
    if (proposalId) {
      await fetch(`${API}/api/system/proposals/reject`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: proposalId })
      }).catch(() => {});
    } else {
      await fetch(`${API}/api/system/proposals/pending`, { method: 'DELETE' }).catch(() => {});
    }
    clearProposalState();
    navigate('scopelogic');
  };

  // Subscribe to ScoutDaemon SSE for live tool call telemetry
  useEffect(() => {
    const es = new EventSource(`${API}/api/scout/events`);
    es.addEventListener('scout-update', (e: any) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'TASK_STATUS' && data.status === 'completed') {
          const time = new Date().toLocaleTimeString('en-US', { hour12: false }).substring(0, 8);
          setToolCalls(prev => [{ tool: data.taskId || 'task', status: 'valid', time }, ...prev.slice(0, 19)]);
        }
      } catch {}
    });
    return () => es.close();
  }, []);

  // DAG Canvas state
  const [runs, setRuns] = useState<{id:string;status:string;created_at:number}[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string|null>(null);
  const [dagNodes, setDagNodes] = useState<{id:string;status:string;prompt?:string}[]>([]);
  const [flowNodes, setFlowNodes, onNodesChange] = useNodesState([] as Node[]);
  const [flowEdges, setFlowEdges, onEdgesChange] = useEdgesState([] as Edge[]);

  // Fetch runs for DAG canvas
  useEffect(() => {
    fetch(`${API}/api/basevault/runs`).then(r => r.json()).then(d => {
      if (d.runs) setRuns(d.runs);
    }).catch(() => {});
  }, [activeProjectId]);

  // Fetch DAG nodes when a run is selected — convert to ReactFlow nodes/edges
  useEffect(() => {
    if (!selectedRunId) { setDagNodes([]); setFlowNodes([]); setFlowEdges([]); return; }
    fetch(`${API}/api/coreexec/run/${selectedRunId}/status`).then(r => r.json()).then(d => {
      if (d.tasks) {
        setDagNodes(d.tasks);
        // Convert tasks to ReactFlow nodes (vertical layout)
        const nodes: Node[] = d.tasks.map((t: any, i: number) => ({
          id: t.id,
          type: 'dag',
          position: { x: 200, y: i * 120 + 40 },
          data: { label: `Node ${i + 1}: ${t.id.substring(0, 10)}...`, status: t.status },
        }));
        // Create edges between sequential nodes
        const edges: Edge[] = d.tasks.slice(1).map((t: any, i: number) => ({
          id: `e-${d.tasks[i].id}-${t.id}`,
          source: d.tasks[i].id,
          target: t.id,
          animated: t.status === 'claimed',
          style: { stroke: statusColors[t.status] || '#374151', strokeWidth: 2 },
        }));
        setFlowNodes(nodes);
        setFlowEdges(edges);
      }
    }).catch(() => {});
  }, [selectedRunId]);

  // Fetch approval queue (os_todos)
  useEffect(() => {
    fetch(`${API}/api/todos`).then(r => r.json()).then(d => {
      if (d.success && d.todos) setApprovalQueue(d.todos);
      else if (Array.isArray(d)) setApprovalQueue(d);
    }).catch(() => {});
  }, [activeProjectId]);

  // Confidence badges
  const badges = [
    { label: 'Local Only', active: true, color: '#00FFCC' },
    { label: 'Redacted', active: true, color: '#00FFCC' },
    { label: 'Human Approved', active: true, color: '#00FFCC' },
    { label: 'Source Linked', active: false, color: '#6b7280' },
    { label: 'Low Confidence', active: false, color: '#6b7280' },
    { label: 'Quota Protected', active: true, color: '#00FF41' },
    { label: 'Project Scoped', active: true, color: '#00FFCC' },
    { label: 'Sandbox Enforced', active: true, color: '#00FFCC' },
  ];

  const handleApprove = async (todoId: string) => {
    try {
      await fetch(`${API}/api/todos/resolve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ todoId, resolutionData: 'approved' }) });
      setApprovalQueue(prev => prev.filter(t => t.id !== todoId));
    } catch {}
  };

  const handleDecline = async (todoId: string) => {
    try {
      await fetch(`${API}/api/todos/reject`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ todoId }) });
      setApprovalQueue(prev => prev.filter(t => t.id !== todoId));
    } catch {}
  };

  // Unified, confidence-gated approval queue spanning BOTH os_todos and the
  // staged dag_proposal. Low-confidence items (< 0.70) need a human look
  // (Attention Required); high-confidence items get the quiet bulk pill bar.
  // Proposals default to 0.5, so today they always land in the low bucket.
  const pendingProposalLike = pendingProposal && proposalId
    ? { id: proposalId, confidence: proposalConfidence, proposal: pendingProposal }
    : null;
  const approvalItems = buildApprovalItems(approvalQueue, pendingProposalLike);
  const { low: lowItems, high: highItems } = partitionByConfidence(approvalItems);
  const todoById = new Map(approvalQueue.map(t => [t.id, t]));

  const approveItem = (item: ApprovalItem) =>
    item.kind === 'proposal' ? handleApproveProposal() : handleApprove(item.id);
  const declineItem = (item: ApprovalItem) =>
    item.kind === 'proposal' ? handleRejectProposal() : handleDecline(item.id);

  // Mixed-kind bulk actions: partition ids by source, then dispatch todos to
  // the /api/todos bulk endpoints and proposals to CoreExec + proposal-resolve.
  const handleApproveAll = async (ids: string[]) => {
    const { todoIds, proposals } = partitionByKind(approvalItems, ids);
    try {
      if (todoIds.length > 0) {
        await fetch(`${API}/api/todos/resolve-bulk`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ todoIds }) });
      }
      for (const p of proposals) {
        await fetch(`${API}/api/coreexec/approve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ proposal: p.proposal, projectId: activeProjectId || undefined }) });
        await fetch(`${API}/api/system/proposals/resolve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: p.id }) });
      }
      if (todoIds.length > 0) setApprovalQueue(prev => prev.filter(t => !todoIds.includes(t.id)));
      if (proposals.some(p => p.id === proposalId)) clearProposalState();
    } catch {}
  };

  const handleRejectAll = async (ids: string[]) => {
    const { todoIds, proposals } = partitionByKind(approvalItems, ids);
    try {
      if (todoIds.length > 0) {
        await fetch(`${API}/api/todos/reject-bulk`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ todoIds }) });
      }
      for (const p of proposals) {
        await fetch(`${API}/api/system/proposals/reject`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: p.id }) });
      }
      if (todoIds.length > 0) setApprovalQueue(prev => prev.filter(t => !todoIds.includes(t.id)));
      if (proposals.some(p => p.id === proposalId)) clearProposalState();
    } catch {}
  };

  return (
    <div className="p-6 space-y-6">
      {/* Widget A: Interactive DAG Canvas — shows pending proposal OR existing runs */}
      <section className={GLOW_BOX}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Grid3X3 size={16} style={{ color: ACCENT }} /> {pendingProposal ? 'Workflow Proposal Review' : 'Interactive DAG Canvas'}
          </h2>
          {pendingProposal ? (
            <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded border border-amber-500/30 bg-amber-500/10 text-amber-400">Pending Approval</span>
          ) : (
            <div className="flex items-center gap-2 text-[10px] font-mono text-gray-500">
              {runs.length > 0 && <select value={selectedRunId || ''} onChange={e => setSelectedRunId(e.target.value || null)} className="bg-black/40 border border-white/10 rounded px-2 py-0.5 text-[10px] text-white focus:outline-none focus:border-teal-500/50">
                <option value="">Select a run...</option>
                {runs.slice(0, 10).map(r => <option key={r.id} value={r.id}>{r.id.substring(0, 12)}... ({r.status})</option>)}
              </select>}
            </div>
          )}
        </div>

        {/* Pending Proposal Canvas */}
        {pendingProposal ? (
          <div className="space-y-4">
            <div className="bg-black/30 border border-amber-500/20 rounded-lg h-[350px] relative overflow-hidden">
              {proposalNodes.length > 0 ? (
                <ReactFlow
                  nodes={proposalNodes}
                  edges={proposalEdges}
                  onNodesChange={onProposalNodesChange}
                  onEdgesChange={onProposalEdgesChange}
                  nodeTypes={nodeTypes}
                  fitView
                  proOptions={{ hideAttribution: true }}
                  style={{ background: 'transparent' }}
                >
                  <Controls className="!bg-black/60 !border-white/10 !rounded-lg" />
                  <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="rgba(0,255,204,0.1)" />
                </ReactFlow>
              ) : (
                <div className="flex items-center justify-center h-full text-xs text-gray-500">Loading proposal...</div>
              )}
            </div>

            {/* Human-readable step list */}
            <div className="bg-black/20 border border-white/5 rounded-lg p-3 space-y-2">
              <div className="text-[10px] font-mono text-gray-500 uppercase tracking-widest mb-2">Workflow Steps ({pendingProposal.nodes?.length || 0})</div>
              {(pendingProposal.nodes || []).map((node: any, i: number) => (
                <div key={node.id} className="flex items-center gap-3 p-2 rounded bg-white/[0.03] border border-white/5">
                  <span className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold border" style={{ borderColor: ACCENT, color: ACCENT }}>{i + 1}</span>
                  <span className="text-xs text-white flex-1">{node.prompt || `Step ${i + 1}`}</span>
                </div>
              ))}
            </div>

            {/* Approve / Reject Buttons */}
            <div className="flex gap-3">
              <button
                onClick={handleApproveProposal}
                disabled={approving}
                className="flex-1 px-4 py-3 rounded-lg bg-green-500/10 border border-green-500/30 text-green-400 font-bold text-sm hover:bg-green-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <CheckCircle size={16} /> {approving ? 'Sending to CoreExec...' : 'Approve & Execute Workflow'}
              </button>
              <button
                onClick={handleRejectProposal}
                className="flex-1 px-4 py-3 rounded-lg bg-white/5 border border-white/10 text-gray-400 font-bold text-sm hover:bg-white/10 transition-all flex items-center justify-center gap-2"
              >
                <XCircle size={16} /> Reject & Return to ScopeLogic
              </button>
            </div>
          </div>
        ) : (
          /* Normal DAG Canvas — shows existing workflow runs */
          <div className="bg-black/30 border border-white/5 rounded-lg h-[350px] relative overflow-hidden">
            {!selectedRunId || flowNodes.length === 0 ? (
              <div className="flex items-center justify-center h-full text-center">
                <div>
                  <Grid3X3 size={32} className="mx-auto mb-2" style={{ color: ACCENT, opacity: 0.5 }} />
                  <p className="text-xs text-gray-500 font-mono">{runs.length === 0 ? 'No workflow runs found' : 'Select a run above to visualize the DAG'}</p>
                </div>
              </div>
            ) : (
              <ReactFlow
                nodes={flowNodes}
                edges={flowEdges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                nodeTypes={nodeTypes}
                fitView
                proOptions={{ hideAttribution: true }}
                style={{ background: 'transparent' }}
              >
                <Controls className="!bg-black/60 !border-white/10 !rounded-lg" />
                <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="rgba(0,255,204,0.1)" />
              </ReactFlow>
            )}
          </div>
        )}
      </section>

      {/* Widget B: Attention Required — Zero-Trust Quarantine & HITL Approval Queue.
          Deference UI (Master Spec §4): only low-confidence (<0.70) items land
          here; high-confidence items are handled by the pill bar below instead. */}
      <section className={GLOW_BOX}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Shield size={16} className="text-amber-400" /> Attention Required — HITL Approval Queue
          </h2>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded border border-red-500/20 bg-red-500/10 text-red-400">Zero-Trust Gate</span>
        </div>

        {lowItems.length === 0 ? (
          <div className="flex items-center gap-3 p-4 rounded-lg bg-green-500/5 border border-green-500/20">
            <CheckCircle size={18} className="text-green-400" />
            <div><div className="text-xs font-bold text-green-400">All Clear</div><div className="text-[10px] text-gray-500">No pending approvals or staged proposals.</div></div>
          </div>
        ) : (
          <div className="space-y-2 max-h-[200px] overflow-y-auto">
            {lowItems.map(item => {
              const todo = todoById.get(item.id);
              const subtitle = item.kind === 'proposal'
                ? `DAG PROPOSAL • confidence ${item.confidence.toFixed(2)}`
                : `${todo?.severity ?? ''} • ${todo?.required_action_type ?? ''} • confidence ${item.confidence.toFixed(2)}`;
              return (
                <div key={item.id} className="flex items-center justify-between p-3 rounded-lg bg-black/30 border border-amber-500/20">
                  <div className="flex items-center gap-3">
                    {item.kind === 'proposal'
                      ? <Sparkles size={14} className="text-amber-400" />
                      : <AlertTriangle size={14} className="text-amber-400" />}
                    <div>
                      <div className="text-xs font-bold text-white">{item.description}</div>
                      <div className="text-[10px] text-gray-500 font-mono">{subtitle}</div>
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    <button onClick={() => approveItem(item)} className="px-2 py-1 rounded text-[9px] font-bold bg-green-500/10 border border-green-500/30 text-green-400 hover:bg-green-500/20 transition-all">Approve</button>
                    <button onClick={() => declineItem(item)} className="px-2 py-1 rounded text-[9px] font-bold bg-white/5 border border-white/10 text-gray-400 hover:text-white transition-all">Decline</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <DeferenceUI
        tasks={highItems.map(i => ({ id: i.id, description: i.description, confidence: i.confidence, kind: i.kind }))}
        accentColor={ACCENT}
        onApproveAll={handleApproveAll}
        onRejectAll={handleRejectAll}
      />

      {/* Widget C: Verifiable Confidence & Local Proof Badges */}
      <section className={GLOW_BOX}>
        <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2 mb-4">
          <Award size={16} style={{ color: ACCENT }} /> Verifiable Confidence Badges
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {badges.map((b, i) => (
            <div key={i} className={`flex items-center gap-2 p-2.5 rounded-lg border transition-all ${b.active ? 'bg-white/5 border-white/10' : 'bg-black/20 border-white/5 opacity-40'}`}>
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: b.color, boxShadow: b.active ? `0 0 6px ${b.color}` : 'none' }}></span>
              <span className="text-[10px] font-bold" style={{ color: b.active ? b.color : '#6b7280' }}>{b.label}</span>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-4 mt-4 pt-3 border-t border-white/5">
          <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-green-400" style={{ boxShadow: '0 0 8px #00FF41' }}></span><span className="text-[10px] text-gray-400">Gold (95%+)</span></div>
          <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-amber-400" style={{ boxShadow: '0 0 8px #fbbf24' }}></span><span className="text-[10px] text-gray-400">Amber (80-94%)</span></div>
          <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-red-400" style={{ boxShadow: '0 0 8px #ef4444' }}></span><span className="text-[10px] text-gray-400">Red (&lt;80%)</span></div>
        </div>
      </section>

      {/* Widget D: Active Tool Telemetry */}
      <section className={GLOW_BOX}>
        <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2 mb-4">
          <Eye size={16} style={{ color: ACCENT }} /> Active Tool Telemetry
        </h2>
        <div className="bg-black/30 border border-white/5 rounded-lg p-3 space-y-1.5 max-h-[150px] overflow-y-auto font-mono text-[10px]">
          {toolCalls.map((tc, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="text-gray-600">[{tc.time}]</span>
              <span className="text-white font-bold">{tc.tool}</span>
              <span className={`ml-auto px-1.5 py-0.5 rounded text-[9px] font-bold ${tc.status === 'valid' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>{tc.status.toUpperCase()}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Widget D2: Embedded Terminal (Task 8) — human-opened, sandboxed shell */}
      <section className={GLOW_BOX}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Terminal size={16} style={{ color: ACCENT }} /> Embedded Terminal
          </h2>
          <button
            onClick={() => setShowTerminal(v => !v)}
            disabled={!activeProjectId}
            className="px-3 py-1.5 rounded-lg text-[10px] font-bold border border-teal-500/30 bg-teal-500/10 text-teal-400 hover:bg-teal-500/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {showTerminal ? 'Close Terminal' : 'Open Terminal'}
          </button>
        </div>
        {!activeProjectId ? (
          <p className="text-xs text-gray-500">Select a project to open an interactive terminal.</p>
        ) : (
          <>
            <p className="text-[10px] text-gray-500 mb-3">
              Interactive shell for CLI tools (Claude CLI, OpenCode, etc.), confined to this
              project's directory with network access removed. Started only by you — never by an agent.
            </p>
            {showTerminal && (
              <div
                className="rounded-lg overflow-hidden border border-white/10 bg-black"
                style={{ height: 360, padding: 8 }}
              >
                <EmbeddedTerminal projectId={activeProjectId} accentColor={ACCENT} />
              </div>
            )}
          </>
        )}
      </section>

      {/* Widget E: OKF Project Knowledge Workspace */}
      <div className="space-y-3">
        <div className="flex justify-end">
          <button onClick={() => setShowMindmap(true)} className="px-3 py-1.5 rounded-lg text-[10px] font-bold border border-teal-500/30 bg-teal-500/10 text-teal-400 hover:bg-teal-500/20 transition-all">
            Open Knowledge Mindmap
          </button>
        </div>
        <OKFWorkspaceWidget projectId={activeProjectId} accentColor={ACCENT} />
      </div>
      <OKFMindmap isOpen={showMindmap} onClose={() => setShowMindmap(false)} />
    </div>
  );
}

// ─── Set-up View ────────────────────────────────────────────────────────────
function SetupView() {
  const [allowlist] = useState(['ls', 'cat', 'grep', 'find', 'wc', 'head', 'tail', 'pwd', 'echo', 'date', 'whoami', 'uname', 'df', 'du', 'file', 'stat', 'readlink', 'which', 'env']);
  const [envStripping, setEnvStripping] = useState(true);
  const [directoryLock, setDirectoryLock] = useState(true);
  const [fileArgValidation, setFileArgValidation] = useState(true);
  const [smartTips, setSmartTips] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [ariaEnforcement, setAriaEnforcement] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tools, setTools] = useState<{id:string;name:string;type:string;status:string}[]>([]);
  const [permissions, setPermissions] = useState<{archetypes:{id:string;label:string;read:boolean;write:boolean|string;exec:boolean|string;git:boolean}[]}>({ archetypes: [] });

  // Fetch tools and permissions from backend
  useEffect(() => {
    fetch(`${API}/api/system/tools`).then(r => r.json()).then(d => { if (d.success) setTools(d.tools); }).catch(() => {});
    fetch(`${API}/api/system/agents/permissions`).then(r => r.json()).then(d => { if (d.success) setPermissions(d.permissions); }).catch(() => {});
  }, []);

  const saveSettings = async () => {
    setSaving(true);
    try {
      await fetch(`${API}/api/system/settings`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ smart_tips: smartTips, reduced_motion: reducedMotion, aria_enforcement: ariaEnforcement, env_stripping: envStripping, directory_lock: directoryLock, file_arg_validation: fileArgValidation })
      });
    } catch {}
    setSaving(false);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Control A: Capability Broker (Tool Registry) */}
      <section className={GLOW_BOX}>
        <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2 mb-4">
          <Wrench size={16} style={{ color: ACCENT }} /> Capability Broker (Tool Registry)
        </h2>
        <p className="text-xs text-gray-400 mb-4">Registered tools available across the OS. Read-only capabilities are separated from destructive write capabilities.</p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {tools.map((tool, i) => (
            <div key={tool.id || i} className="flex items-center justify-between p-3 rounded-lg bg-black/30 border border-white/5">
              <div className="flex items-center gap-2">
                <Terminal size={12} style={{ color: ACCENT }} />
                <div>
                  <div className="text-xs font-bold text-white font-mono">{tool.name}</div>
                  <div className="text-[9px] text-gray-500">{tool.type} capability</div>
                </div>
              </div>
              <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded ${
                tool.status === 'Active' ? 'bg-green-500/10 text-green-400 border border-green-500/20' :
                'bg-amber-500/10 text-amber-400 border border-amber-500/20'
              }`}>{tool.status}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Control B: Agent-Tool Permissions */}
      <section className={GLOW_BOX}>
        <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2 mb-4">
          <Users size={16} style={{ color: ACCENT }} /> Agent-Tool Permissions Matrix
        </h2>
        <p className="text-xs text-gray-400 mb-4">Principle of least privilege. Bind specific tools to specific agent archetypes.</p>

        <div className="bg-black/30 border border-white/5 rounded-lg overflow-hidden">
          <div className="grid grid-cols-[1fr_60px_60px_60px_60px] gap-0 text-[10px] font-mono">
            <div className="p-2 border-b border-white/5 text-gray-500 font-bold">Agent / Tool</div>
            <div className="p-2 border-b border-white/5 text-center text-gray-500">read</div>
            <div className="p-2 border-b border-white/5 text-center text-gray-500">write</div>
            <div className="p-2 border-b border-white/5 text-center text-gray-500">exec</div>
            <div className="p-2 border-b border-white/5 text-center text-gray-500">git</div>

            <div className="p-2 border-b border-white/5 text-white font-bold">code_execute</div>
            <div className="p-2 border-b border-white/5 text-center text-green-400">✓</div>
            <div className="p-2 border-b border-white/5 text-center text-green-400">✓</div>
            <div className="p-2 border-b border-white/5 text-center text-amber-400">⚠</div>
            <div className="p-2 border-b border-white/5 text-center text-green-400">✓</div>

            <div className="p-2 border-b border-white/5 text-white font-bold">research_only</div>
            <div className="p-2 border-b border-white/5 text-center text-green-400">✓</div>
            <div className="p-2 border-b border-white/5 text-center text-red-400">✗</div>
            <div className="p-2 border-b border-white/5 text-center text-red-400">✗</div>
            <div className="p-2 border-b border-white/5 text-center text-green-400">✓</div>

            <div className="p-2 text-white font-bold">admin_operator</div>
            <div className="p-2 text-center text-green-400">✓</div>
            <div className="p-2 text-center text-green-400">✓</div>
            <div className="p-2 text-center text-green-400">✓</div>
            <div className="p-2 text-center text-green-400">✓</div>
          </div>
        </div>
      </section>

      {/* Control C: P0 Command Sandbox */}
      <section className={GLOW_BOX}>
        <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2 mb-4">
          <Lock size={16} className="text-red-400" /> P0 Command Sandbox Configuration
        </h2>
        <p className="text-xs text-gray-400 mb-4">Four-layer quarantine for the run_command shell tool. Critical safety boundary.</p>

        <div className="space-y-3">
          {/* Allowlist */}
          <div className="bg-black/30 border border-white/5 rounded-lg p-3">
            <div className="text-[10px] font-mono text-gray-500 uppercase tracking-widest mb-2">Layer 1: Command Allowlist ({allowlist.length} commands)</div>
            <div className="flex flex-wrap gap-1.5">
              {allowlist.map((cmd, i) => (
                <span key={i} className="px-2 py-0.5 rounded text-[9px] font-mono font-bold bg-green-500/10 text-green-400 border border-green-500/20">{cmd}</span>
              ))}
            </div>
          </div>

          {/* Toggles */}
          <label className="flex items-center justify-between p-3 rounded-lg bg-white/[0.03] border border-white/5 cursor-pointer hover:border-white/10 transition-all">
            <div><span className="text-xs font-bold text-white block">Layer 2: Environment Stripping</span><span className="text-[10px] text-gray-500">Strip all API keys via buildSandboxEnv before execution</span></div>
            <input type="checkbox" checked={envStripping} onChange={e => setEnvStripping(e.target.checked)} className="w-4 h-4 rounded" style={{ accentColor: ACCENT }} />
          </label>
          <label className="flex items-center justify-between p-3 rounded-lg bg-white/[0.03] border border-white/5 cursor-pointer hover:border-white/10 transition-all">
            <div><span className="text-xs font-bold text-white block">Layer 3: Directory Lock</span><span className="text-[10px] text-gray-500">Restrict execution to project root via resolveCwd</span></div>
            <input type="checkbox" checked={directoryLock} onChange={e => setDirectoryLock(e.target.checked)} className="w-4 h-4 rounded" style={{ accentColor: ACCENT }} />
          </label>
          <label className="flex items-center justify-between p-3 rounded-lg bg-white/[0.03] border border-white/5 cursor-pointer hover:border-white/10 transition-all">
            <div><span className="text-xs font-bold text-white block">Layer 4: File-Argument Validation</span><span className="text-[10px] text-gray-500">Block path traversal in arguments (../../etc/passwd)</span></div>
            <input type="checkbox" checked={fileArgValidation} onChange={e => setFileArgValidation(e.target.checked)} className="w-4 h-4 rounded" style={{ accentColor: ACCENT }} />
          </label>
        </div>
      </section>

      {/* Control D: Accessibility & SmartTips */}
      <section className={GLOW_BOX}>
        <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2 mb-4">
          <Accessibility size={16} style={{ color: ACCENT }} /> Accessibility & SmartTips Governance
        </h2>

        <div className="space-y-3">
          <label className="flex items-center justify-between p-3 rounded-lg bg-white/[0.03] border border-white/5 cursor-pointer hover:border-white/10 transition-all">
            <div><span className="text-xs font-bold text-white block">SmartTips System</span><span className="text-[10px] text-gray-500">45+ on-demand tooltips explaining technical terms at 6th-grade reading level</span></div>
            <input type="checkbox" checked={smartTips} onChange={e => setSmartTips(e.target.checked)} className="w-4 h-4 rounded" style={{ accentColor: ACCENT }} />
          </label>
          <label className="flex items-center justify-between p-3 rounded-lg bg-white/[0.03] border border-white/5 cursor-pointer hover:border-white/10 transition-all">
            <div><span className="text-xs font-bold text-white block">Prefers Reduced Motion</span><span className="text-[10px] text-gray-500">Disable animations and transitions for accessibility</span></div>
            <input type="checkbox" checked={reducedMotion} onChange={e => setReducedMotion(e.target.checked)} className="w-4 h-4 rounded" style={{ accentColor: ACCENT }} />
          </label>
          <label className="flex items-center justify-between p-3 rounded-lg bg-white/[0.03] border border-white/5 cursor-pointer hover:border-white/10 transition-all">
            <div><span className="text-xs font-bold text-white block">ARIA Label Enforcement</span><span className="text-[10px] text-gray-500">Strict accessibility compliance for screen readers</span></div>
            <input type="checkbox" checked={ariaEnforcement} onChange={e => setAriaEnforcement(e.target.checked)} className="w-4 h-4 rounded" style={{ accentColor: ACCENT }} />
          </label>
        </div>
      </section>

      {/* Save */}
      <div className="flex justify-end">
        <button onClick={saveSettings} disabled={saving} className="px-6 py-2.5 rounded-lg text-black font-bold text-sm transition-all shadow-lg hover:shadow-xl disabled:opacity-50" style={{ backgroundColor: ACCENT }}>
          {saving ? 'Saving...' : 'Commit Configuration'}
        </button>
      </div>
    </div>
  );
}

// ─── Main Export ─────────────────────────────────────────────────────────────
export function PortGridDashboard() {
  const [activeView, setActiveView] = useState<'dashboard' | 'setups'>('dashboard');

  return (
    <AppShell
      moduleId="portgrid"
      moduleName="PortGrid (UI & Skills Hub)"
      moduleLogo="/PORTGRIDLogo.png"
      accentColor={ACCENT}
      activeView={activeView}
      onViewChange={setActiveView}
    >
      {activeView === 'dashboard' ? <DashboardView /> : <SetupView />}
    </AppShell>
  );
}
