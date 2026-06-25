import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Handle,
  Position,
  BackgroundVariant
} from '@xyflow/react';
import type { Connection, Edge, Node } from '@xyflow/react';
import { Cpu, Database, Network, Sun, Moon, Settings } from 'lucide-react';
import portGridLogo from '../../Logos/PORTGRIDLogo.png';
import { ScopeLogicChat } from './components/ScopeLogicChat';
import { RunHistory } from './components/RunHistory';
import { SettingsModal } from './components/SettingsModal';
import type { DAGProposalPayload } from './components/ScopeLogicChat';
import { ApprovalCockpit } from './components/ApprovalCockpit';
import { NodeOutputInspector } from './components/NodeOutputInspector';
import { isReservedDAGPrompt } from '../core/system-reserved';
import { Statusline } from './components/Statusline';

// ── Custom Node ────────────────────────────────────────────────────────────────

const CustomNode = ({ data, isConnectable }: any) => {
  return (
    <div className={`react-flow__node-custom ${data.status ? 'status-' + data.status : ''}`}>
      <Handle type="target" position={Position.Top} isConnectable={isConnectable} />
      <div className="header">
        <div className="icon">
          {data.icon === 'cpu'      && <Cpu size={18} />}
          {data.icon === 'database' && <Database size={18} />}
          {data.icon === 'network'  && <Network size={18} />}
        </div>
        <div>{data.label}</div>
      </div>
      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
        {data.description}
      </div>
      <Handle type="source" position={Position.Bottom} isConnectable={isConnectable} />
    </div>
  );
};

const nodeTypes = { custom: CustomNode };

// ── Initial Demo Graph ─────────────────────────────────────────────────────────

const initialNodes: Node[] = [
  { id: '1', type: 'custom', data: { label: 'ScopeLogic Parser',  icon: 'cpu',      description: 'Extract intent from prompt',      status: 'completed' }, position: { x: 250, y: 50 } },
  { id: '2', type: 'custom', data: { label: 'BaseVault Lookup',   icon: 'database', description: 'Fetch related schemas',             status: 'pending'   }, position: { x: 100, y: 200 } },
  { id: '3', type: 'custom', data: { label: 'RouteSwitch LLM',    icon: 'network',  description: 'Generate structural output',        status: 'pending'   }, position: { x: 400, y: 200 } },
];

const initialEdges: Edge[] = [
  { id: 'e1-2', source: '1', target: '2', animated: true, style: { stroke: 'var(--primary-glow)', strokeWidth: 2 } },
  { id: 'e1-3', source: '1', target: '3', animated: true, style: { stroke: 'var(--primary-glow)', strokeWidth: 2 } },
];

const dagIcons = ['cpu', 'database', 'network'] as const;

// ── App ────────────────────────────────────────────────────────────────────────


export default function App() {
  const [currentProposal, setCurrentProposal] = useState<DAGProposalPayload | null>(null);
  const [runStatus,       setRunStatus]        = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [activeRunId,     setActiveRunId]      = useState<string | null>(null);
  const [chatKey,         setChatKey]          = useState(0); // bump to reset ScopeLogicChat
  const [isSettingsOpen,  setIsSettingsOpen]   = useState(false);
  const [inspector,       setInspector]        = useState<{ runId: string; nodeId: string; status: string; outputData: string | null } | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [theme, setTheme] = useState<'light' | 'dark'>(
    window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  );

  useEffect(() => {
    document.body.classList.toggle('dark-theme',  theme === 'dark');
    document.body.classList.toggle('light-theme', theme === 'light');
  }, [theme]);

  // ── Live run streaming (Unit 27: SSE ScoutDaemon) ──────────────────────────

  useEffect(() => {
    if (!activeRunId) return;

    const sse = new EventSource('http://localhost:3743/api/scout/events');

    sse.addEventListener('scout-update', (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'TASK_STATUS' && data.runId === activeRunId) {
          setNodes(prev => prev.map(n => {
            if (n.id.replace('dag-', '') === data.taskId) {
              return { ...n, data: { ...n.data, status: data.status } };
            }
            return n;
          }));
        }

        if (data.type === 'RUN_STATUS' && data.runId === activeRunId) {
          if (data.status === 'completed' || data.status === 'failed') {
            setRunStatus(data.status === 'completed' ? 'done' : 'error');
          }
        }
      } catch (err) {
        console.error('SSE parsing error:', err);
      }
    });

    return () => {
      sse.close();
    };
  }, [activeRunId, setNodes]);

  const toggleTheme = () => setTheme(prev => prev === 'light' ? 'dark' : 'light');

  const onConnect = useCallback(
    (params: Connection | Edge) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  // ── DAG injection (Unit 11) ────────────────────────────────────────────────

  const handleProposal = useCallback((proposal: DAGProposalPayload) => {
    // §1.2 — Defense-in-depth: filter reserved system-service labels that the
    // validator should have already rejected. Belt-and-suspenders.
    const filteredNodes = proposal.nodes.filter(n => !isReservedDAGPrompt(n.prompt));
    const cleanedProposal: DAGProposalPayload = { ...proposal, nodes: filteredNodes };

    setCurrentProposal(cleanedProposal);

    const xStart = 120, yStart = 400, xSpacing = 300, ySpacing = 180;
    const depths = new Map<string, number>();

    const computeDepth = (nodeId: string): number => {
      if (depths.has(nodeId)) return depths.get(nodeId)!;
      const node = cleanedProposal.nodes.find(n => n.id === nodeId);
      if (!node || node.dependencies.length === 0) { depths.set(nodeId, 0); return 0; }
      const d = Math.max(...node.dependencies.map(computeDepth)) + 1;
      depths.set(nodeId, d); return d;
    };
    cleanedProposal.nodes.forEach(n => computeDepth(n.id));

    const layers = new Map<number, string[]>();
    cleanedProposal.nodes.forEach(n => {
      const d = depths.get(n.id) || 0;
      if (!layers.has(d)) layers.set(d, []);
      layers.get(d)!.push(n.id);
    });

    const newNodes: Node[] = cleanedProposal.nodes.map((pNode, i) => {
      const depth     = depths.get(pNode.id) || 0;
      const layer     = layers.get(depth) || [pNode.id];
      const layerIdx  = layer.indexOf(pNode.id);
      return {
        id:   `dag-${pNode.id}`,
        type: 'custom',
        data: {
          label:       pNode.prompt.length > 32 ? pNode.prompt.slice(0, 32) + '…' : pNode.prompt,
          icon:        dagIcons[i % dagIcons.length],
          description: pNode.prompt,
          status:      'pending',
        },
        position: { x: xStart + layerIdx * xSpacing, y: yStart + depth * ySpacing },
      };
    });

    const newEdges: Edge[] = cleanedProposal.nodes.flatMap(pNode =>
      pNode.dependencies.map(depId => ({
        id:       `dag-e-${depId}-${pNode.id}`,
        source:   `dag-${depId}`,
        target:   `dag-${pNode.id}`,
        animated: true,
        style:    { stroke: 'var(--accent)', strokeWidth: 2 },
      }))
    );

    setNodes(prev => [...prev, ...newNodes]);
    setEdges(prev => [...prev, ...newEdges]);
  }, [setNodes, setEdges]);

  // ── Run-history rehydration (§1.3) ─────────────────────────────────────────

  // Race protection: track in-flight rehydrations so a slow stale fetch
  // cannot overwrite a more recent click.
  const rehydrateSeqRef = useRef(0);
  const rehydrateAbortRef = useRef<AbortController | null>(null);
  const retryAbortRef = useRef<AbortController | null>(null);

  const handleSelectRun = useCallback(async (runId: string) => {
    const seq = ++rehydrateSeqRef.current;
    rehydrateAbortRef.current?.abort();
    const controller = new AbortController();
    rehydrateAbortRef.current = controller;

    // Snapshot the canvas so we can roll back on error or staleness.
    let snapshotNodes: Node[] | null = null;
    let snapshotEdges: Edge[] | null = null;
    try {
      const res  = await fetch(`http://localhost:3743/api/basevault/run/${runId}`, { signal: controller.signal });
      const data = await res.json();
      if (!data.run) return;
      if (seq !== rehydrateSeqRef.current) return; // superseded

      const layout = JSON.parse(data.run.dag_layout) as { nodes: { id: string; dependencies: string[]; prompt: string }[] };
      const proposalPayload: DAGProposalPayload = { id: runId, status: data.run.status, nodes: layout.nodes };

      // Strip demo nodes and re-render only the archived DAG
      const demoIds = new Set(initialNodes.map(n => n.id));
      snapshotNodes = nodes;
      snapshotEdges = edges;
      setNodes(prev => prev.filter(n => demoIds.has(n.id) || !n.id.startsWith('dag-')));
      setEdges(prev => prev.filter(e => {
        const s = e.source, t = e.target;
        return demoIds.has(s) || demoIds.has(t) ? true : !s.startsWith('dag-') && !t.startsWith('dag-');
      }));
      setCurrentProposal(proposalPayload);

      const xStart = 120, yStart = 80, xSpacing = 300, ySpacing = 180;
      const depths = new Map<string, number>();
      const computeDepth = (nodeId: string): number => {
        if (depths.has(nodeId)) return depths.get(nodeId)!;
        const node = layout.nodes.find(n => n.id === nodeId);
        if (!node || node.dependencies.length === 0) { depths.set(nodeId, 0); return 0; }
        const d = Math.max(...node.dependencies.map(computeDepth)) + 1;
        depths.set(nodeId, d); return d;
      };
      layout.nodes.forEach(n => computeDepth(n.id));

      const layers = new Map<number, string[]>();
      layout.nodes.forEach(n => {
        const d = depths.get(n.id) || 0;
        if (!layers.has(d)) layers.set(d, []);
        layers.get(d)!.push(n.id);
      });

      const taskMap = new Map<string, any>((data.tasks || []).map((t: any) => [t.id, t]));
      const archivedNodes: Node[] = layout.nodes.map((pNode, i) => {
        const depth     = depths.get(pNode.id) || 0;
        const layer     = layers.get(depth) || [pNode.id];
        const layerIdx  = layer.indexOf(pNode.id);
        const task = taskMap.get(pNode.id);
        const taskStatus = task?.status || 'unclaimed';
        const status = taskStatus === 'completed' ? 'completed'
                     : taskStatus === 'claimed'    ? 'running'
                     : (taskStatus === 'failed' || taskStatus === 'parked') ? 'error'
                     : 'pending';
        // §1.3 — Attach task payload so the inspector can show real output on click.
        return {
          id:   `dag-${pNode.id}`,
          type: 'custom',
          data: {
            label:       pNode.prompt.length > 32 ? pNode.prompt.slice(0, 32) + '…' : pNode.prompt,
            icon:        dagIcons[i % dagIcons.length],
            description: pNode.prompt,
            status,
            __runId:     runId,
            __task:      task ?? null,
          },
          position: { x: xStart + layerIdx * xSpacing, y: yStart + depth * ySpacing },
        };
      });
      const archivedEdges: Edge[] = layout.nodes.flatMap(pNode =>
        pNode.dependencies.map(depId => ({
          id:       `dag-e-${depId}-${pNode.id}`,
          source:   `dag-${depId}`,
          target:   `dag-${pNode.id}`,
          animated: false,
          style:    { stroke: 'var(--text-muted)', strokeWidth: 2 },
        }))
      );
      setNodes(prev => [...prev, ...archivedNodes]);
      setEdges(prev => [...prev, ...archivedEdges]);
      setActiveRunId(runId);
      // §3.3 — 'blocked-by-validation' (§3.4 sentinel) is NOT a clean idle state.
      // Surface it as 'error' so the NodeOutputInspector and ApprovalCockpit
      // can propose resolution paths (LLM_RETRY_OR_FIX → NotificationCenter).
      const rehydratedRunStatus: 'idle' | 'running' | 'done' | 'error' =
        data.run.status === 'completed'             ? 'done'
      : data.run.status === 'failed'                ? 'error'
      : data.run.status === 'blocked-by-validation' ? 'error'
      : data.run.status === 'running'               ? 'running'
      :                                              'idle';
      setRunStatus(rehydratedRunStatus);
    } catch (err) {
      if ((err as any)?.name === 'AbortError') return;
      console.error('Run rehydrate failed:', err);
      // Roll back to the pre-rehydrate snapshot so the canvas doesn't empty on failure.
      if (snapshotNodes && snapshotEdges) {
        setNodes(snapshotNodes);
        setEdges(snapshotEdges);
      }
    }
  }, [setNodes, setEdges, nodes, edges]);

  const handleRetryFailedRun = useCallback(async (runId: string) => {
    retryAbortRef.current?.abort();
    const controller = new AbortController();
    retryAbortRef.current = controller;
    try {
      const res = await fetch(`http://localhost:3743/api/coreexec/retry/${runId}`, {
        method: 'POST',
        signal: controller.signal,
      });
      const data = await res.json();
      if (data.success) {
        setActiveRunId(runId);
        setRunStatus('running');
        await handleSelectRun(runId); // re-render with new statuses
      }
    } catch (err) {
      if ((err as any)?.name === 'AbortError') return;
      console.error('Retry failed:', err);
    }
  }, [handleSelectRun]);

  // ── Approve & Run (Unit 12) ────────────────────────────────────────────────

  const handleApprove = async () => {
    if (!currentProposal) return;
    setRunStatus('running');
    try {
      const res  = await fetch('http://localhost:3743/api/coreexec/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proposal: currentProposal }),
      });
      const data = await res.json();
      if (data.success) {
        setActiveRunId(data.runId);
        // Initial optimistic animation; live polling will override
        setNodes(prev => prev.map(n =>
          n.id.startsWith('dag-') ? { ...n, data: { ...n.data, status: 'running' } } : n
        ));
      } else {
        setRunStatus('error');
      }
    } catch {
      setRunStatus('error');
    }
  };

  // ── Session reset (Unit 19) ────────────────────────────────────────────────

  const handleReset = async () => {
    await fetch('http://localhost:3743/api/scopelogic/reset', { method: 'POST' });
    setCurrentProposal(null);
    setRunStatus('idle');
    setActiveRunId(null);
    setNodes(initialNodes);
    setEdges(initialEdges);
    setChatKey(k => k + 1);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column' }}>

      {/* Top Navigation Bar */}
      <div className="glass-panel" style={{
        margin: '16px', padding: '16px 24px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 10
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <img src={portGridLogo} alt="PortGrid Logo" style={{ height: '40px', width: 'auto', borderRadius: '8px' }} />
          <div>
            <h2 style={{ color: 'var(--text-main)', margin: 0 }}>PortGrid Canvas</h2>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>NeuroSyncOS Cockpit</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Statusline />
          {runStatus === 'done' && (
            <button className="btn-secondary" onClick={handleReset}>
              🔄 New Session
            </button>
          )}
          <button className="btn-icon" onClick={() => setIsSettingsOpen(true)} aria-label="Settings">
            <Settings size={18} />
          </button>
          <button className="btn-icon" onClick={toggleTheme} aria-label="Toggle Theme">
            {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
          </button>
          
          <div style={{ marginLeft: '16px', position: 'relative', zIndex: 100 }}>
            {currentProposal ? (
              <ApprovalCockpit 
                proposal={currentProposal}
                onApprove={handleApprove}
                onReject={() => setCurrentProposal(null)}
              />
            ) : (
              <span style={{color: '#a6accd', fontStyle: 'italic', marginLeft: '16px'}}>No DAG Proposal active.</span>
            )}
          </div>
        </div>
      </div>

      {/* Canvas Area */}
      <div style={{ flex: 1, position: 'relative', display: 'flex' }}>

        {/* Left Sidebar: Chat */}
        <div style={{ position: 'absolute', top: 16, left: 16, zIndex: 10, display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <ScopeLogicChat key={chatKey} onProposal={handleProposal} />
        </div>

        {/* Right Sidebar: Run History */}
        <div style={{ position: 'absolute', top: 16, right: 16, zIndex: 10 }}>
          <RunHistory onSelectRun={handleSelectRun} activeRunId={activeRunId} />
        </div>

        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={(_, node) => {
            if (!node.id.startsWith('dag-')) return;
            const bareId = node.id.replace('dag-', '');
            const dataAny = (node.data || {}) as any;
            const task = dataAny.__task ?? null;
            const runId = dataAny.__runId || activeRunId || '';
            setInspector({
              runId,
              nodeId: bareId,
              status: (node.data?.status as string) || 'pending',
              outputData: task?.output_data ?? null,
            });
          }}
          nodeTypes={nodeTypes}
          fitView
          colorMode={theme}
        >
          <Controls style={{ background: 'var(--bg-glass)', border: '1px solid var(--border-glass)', borderRadius: '8px' }} />
          <Background variant={BackgroundVariant.Dots} gap={24} size={2} color="var(--bg-dots)" />
        </ReactFlow>
      </div>

      {/* Modals */}
      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />

      {/* §1.3 — Node Output Inspector */}
      {inspector && (
        <NodeOutputInspector
          runId={inspector.runId || 'unknown'}
          nodeId={inspector.nodeId}
          status={inspector.status}
          outputData={inspector.outputData}
          onClose={() => setInspector(null)}
          onRetryFailedNodes={handleRetryFailedRun}
          onEditRerun={() => setInspector(null)}
          onRefresh={async () => {
            const r = inspector.runId || activeRunId;
            if (!r) return;
            const ctrl = new AbortController();
            try {
              const res  = await fetch(`http://localhost:3743/api/basevault/run/${r}`, { signal: ctrl.signal });
              const data = await res.json();
              const task = (data.tasks || []).find((t: any) => t.id === inspector.nodeId);
              setInspector(prev => prev ? { ...prev, status: task?.status || prev.status, outputData: task?.output_data ?? prev.outputData } : prev);
              // Also refresh the canvas node's status in place.
              setNodes(prev => prev.map(n => {
                if (n.id === `dag-${inspector.nodeId}`) {
                  const statusVal = task?.status === 'completed' ? 'completed'
                                  : task?.status === 'claimed'    ? 'running'
                                  : (task?.status === 'failed' || task?.status === 'parked') ? 'error'
                                  : 'pending';
                  return { ...n, data: { ...n.data, status: statusVal, __task: task ?? (n.data as any).__task } };
                }
                return n;
              }));
            } catch (err) {
              if ((err as any)?.name === 'AbortError') return;
              console.error('Inspector refresh failed:', err);
            }
          }}
        />
      )}

    </div>
  );
}
