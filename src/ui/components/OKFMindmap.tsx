import React, { useState, useEffect, useCallback } from 'react';
import { ReactFlow, Controls, Background, BackgroundVariant, MiniMap, Handle, Position, useNodesState, useEdgesState } from '@xyflow/react';
import type { Node, Edge } from '@xyflow/react';
import { useNavigation } from '../layouts/OSLayout';
import { X, Brain, Globe, User, FolderOpen } from 'lucide-react';

const API = 'http://localhost:3743';

// Tier colors
const TIER_COLORS: Record<string, { bg: string; border: string; text: string; glow: string }> = {
  GLOBAL: { bg: 'rgba(0,229,255,0.1)', border: '#00E5FF', text: '#00E5FF', glow: 'rgba(0,229,255,0.3)' },
  USER: { bg: 'rgba(212,175,55,0.1)', border: '#D4AF37', text: '#D4AF37', glow: 'rgba(212,175,55,0.3)' },
  PROJECT: { bg: 'rgba(0,255,204,0.1)', border: '#00FFCC', text: '#00FFCC', glow: 'rgba(0,255,204,0.3)' },
};

// Custom node for the mindmap
function MindmapNode({ data }: any) {
  const colors = TIER_COLORS[data.tier] || TIER_COLORS['PROJECT']!;
  return (
    <div
      className="px-3 py-2 rounded-lg border backdrop-blur-sm min-w-[120px] max-w-[200px] cursor-pointer transition-all hover:scale-105"
      style={{ backgroundColor: colors.bg, borderColor: colors.border, boxShadow: `0 0 8px ${colors.glow}` }}
      onClick={() => data.onSelect?.(data.nodeId)}
    >
      <Handle type="target" position={Position.Top} className="!bg-white/30 !w-2 !h-2" />
      <div className="text-[8px] font-mono uppercase tracking-wider mb-0.5" style={{ color: colors.text }}>{data.type}</div>
      <div className="text-[10px] text-white font-semibold truncate">{data.title || data.nodeId}</div>
      <div className="text-[8px] text-gray-500 mt-0.5">{data.tier} • {(data.confidence * 100).toFixed(0)}%</div>
      <Handle type="source" position={Position.Bottom} className="!bg-white/30 !w-2 !h-2" />
    </div>
  );
}

const nodeTypes = { mindmap: MindmapNode };

interface OKFMindmapProps {
  isOpen: boolean;
  onClose: () => void;
}

export function OKFMindmap({ isOpen, onClose }: OKFMindmapProps) {
  const { activeProjectId } = useNavigation();
  const [activeTier, setActiveTier] = useState<'ALL' | 'GLOBAL' | 'USER' | 'PROJECT'>('ALL');
  const [nodes, setNodes, onNodesChange] = useNodesState([] as Node[]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([] as Edge[]);
  const [selectedFile, setSelectedFile] = useState<{ nodeId: string; title: string; type: string; tier: string; confidence: number; content: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const handleNodeSelect = useCallback(async (nodeId: string) => {
    try {
      const res = await fetch(`${API}/api/okf/file-content?nodeId=${encodeURIComponent(nodeId)}`);
      const data = await res.json();
      if (data.success) {
        setSelectedFile(data);
      }
    } catch {}
  }, []);

  const fetchGraph = useCallback(async () => {
    setLoading(true);
    try {
      let url = `${API}/api/okf/graph?`;
      if (activeTier !== 'ALL') url += `tier=${activeTier}&`;
      if (activeProjectId) url += `projectId=${encodeURIComponent(activeProjectId)}`;

      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        // Layout nodes in a radial/grid pattern
        const rfNodes: Node[] = data.nodes.map((n: any, i: number) => {
          // Simple force-directed-like layout: spread by tier
          const tierOffset = n.tier === 'GLOBAL' ? 0 : n.tier === 'USER' ? 1 : 2;
          const col = i % 5;
          const row = Math.floor(i / 5);
          return {
            id: n.id,
            type: 'mindmap',
            position: { x: col * 250 + tierOffset * 80, y: row * 140 + tierOffset * 60 },
            data: { nodeId: n.id, title: n.title, type: n.type, tier: n.tier, confidence: n.confidence, onSelect: handleNodeSelect },
          };
        });

        const rfEdges: Edge[] = data.edges.map((e: any, i: number) => ({
          id: `edge-${i}`,
          source: e.source_node_id,
          target: e.target_node_id,
          animated: true,
          style: { stroke: '#374151', strokeWidth: 1.5 },
          label: e.relationship_type !== 'references' ? e.relationship_type : undefined,
        }));

        setNodes(rfNodes);
        setEdges(rfEdges);
      }
    } catch {}
    setLoading(false);
  }, [activeTier, activeProjectId, handleNodeSelect]);

  useEffect(() => {
    if (isOpen) fetchGraph();
  }, [isOpen, fetchGraph]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[55] flex bg-black/80 backdrop-blur-sm">
      {/* Main mindmap area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="h-14 shrink-0 flex items-center justify-between px-4 border-b border-white/5 bg-black/60">
          <div className="flex items-center gap-3">
            <Brain size={18} className="text-teal-400" />
            <span className="text-sm font-bold text-white uppercase tracking-wider">OKF Knowledge Mindmap</span>
          </div>

          {/* Tier tabs */}
          <div className="flex gap-1 bg-black/40 p-1 rounded-lg border border-white/5">
            {(['ALL', 'GLOBAL', 'USER', 'PROJECT'] as const).map(t => (
              <button key={t} onClick={() => setActiveTier(t)} className={`px-3 py-1 rounded-md text-[10px] font-bold uppercase tracking-wide transition-all flex items-center gap-1.5 ${activeTier === t ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-white'}`}>
                {t === 'GLOBAL' && <Globe size={10} />}
                {t === 'USER' && <User size={10} />}
                {t === 'PROJECT' && <FolderOpen size={10} />}
                {t}
              </button>
            ))}
          </div>

          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors"><X size={18} /></button>
        </div>

        {/* ReactFlow canvas */}
        <div className="flex-1 relative">
          {loading ? (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-500 font-mono">Loading knowledge graph...</div>
          ) : nodes.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-500 font-mono">No OKF nodes indexed yet. Add documents via PortGrid → OKF Workspace.</div>
          ) : (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              nodeTypes={nodeTypes}
              fitView
              proOptions={{ hideAttribution: true }}
              style={{ background: '#050505' }}
            >
              <Controls className="!bg-black/60 !border-white/10 !rounded-lg" />
              <MiniMap
                nodeColor={(n) => {
                  const tier = n.data?.tier as string;
                  return TIER_COLORS[tier]?.border || '#6b7280';
                }}
                className="!bg-black/40 !border-white/10 !rounded-lg"
              />
              <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="rgba(255,255,255,0.03)" />
            </ReactFlow>
          )}
        </div>
      </div>

      {/* Right panel: file preview */}
      {selectedFile && (
        <div className="w-[400px] border-l border-white/5 bg-[#0a0a0c] flex flex-col overflow-hidden">
          <div className="h-14 shrink-0 flex items-center justify-between px-4 border-b border-white/5">
            <div>
              <div className="text-xs font-bold text-white truncate">{selectedFile.title || selectedFile.nodeId}</div>
              <div className="text-[9px] font-mono text-gray-500">{selectedFile.type} • {selectedFile.tier} • conf: {selectedFile.confidence.toFixed(2)}</div>
            </div>
            <button onClick={() => setSelectedFile(null)} className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-white"><X size={14} /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <pre className="text-xs text-gray-300 font-mono whitespace-pre-wrap leading-relaxed">{selectedFile.content}</pre>
          </div>
        </div>
      )}
    </div>
  );
}
