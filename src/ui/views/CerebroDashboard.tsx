import React, { useState, useEffect } from 'react';
import { AppShell } from '../components/AppShell';
import { useNavigation } from '../layouts/OSLayout';
import { Brain, CheckCircle, XCircle, Search, Clock, Trash2, Pin, Sliders, Database, FileText, AlertTriangle } from 'lucide-react';
import { OKFMindmap } from '../components/OKFMindmap';

const API = 'http://localhost:3743';
const ACCENT = '#2DD4BF';
const ACCENT_GOLD = '#D4AF37';

// Shared glow box (teal/emerald glow — matching Cerebro logo's central wrench color)
const GLOW_BOX = `bg-white/[0.02] border border-white/5 rounded-xl p-5 backdrop-blur-sm transition-all duration-300 shadow-[0_0_15px_rgba(45,212,191,0.08)] hover:shadow-[0_0_30px_rgba(45,212,191,0.2)] hover:border-[rgba(45,212,191,0.25)]`;

// ─── Types ──────────────────────────────────────────────────────────────────
interface LearningApproval { id: string; fact: string; confidence: number; status: string; source_run_id: string | null; created_at: number; }
interface MemoryNode { id: string; content: string; type: string; last_accessed_at: number; access_count: number; created_at: number; }

// ─── Dashboard View ─────────────────────────────────────────────────────────
function DashboardView() {
  const { activeProjectId } = useNavigation();
  const [approvals, setApprovals] = useState<LearningApproval[]>([]);
  const [memories, setMemories] = useState<MemoryNode[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [health, setHealth] = useState<{vectorCount:number; status:string; lastReflection:number|null}>({ vectorCount: 0, status: 'cold', lastReflection: null });
  const [okfNodeCount, setOkfNodeCount] = useState(0);
  const [okfSearch, setOkfSearch] = useState('');
  const [okfResults, setOkfResults] = useState<any[]>([]);
  const [okfIndexing, setOkfIndexing] = useState(false);
  const [showMindmap, setShowMindmap] = useState(false);

  // Fetch approvals queue
  useEffect(() => {
    fetch(`${API}/api/cerebro/learning-approvals`).then(r => r.json()).then(d => {
      if (d.success && d.queue) setApprovals(d.queue);
    }).catch(() => {});
  }, [activeProjectId]);

  // Fetch health
  useEffect(() => {
    fetch(`${API}/api/cerebro/health`).then(r => r.json()).then(d => {
      if (d.success) setHealth({ vectorCount: d.vectorCount, status: d.status, lastReflection: d.lastReflection });
    }).catch(() => {});
  }, []);

  // Fetch OKF node count
  useEffect(() => {
    fetch(`${API}/api/okf/nodes?limit=1`).then(r => r.json()).then(d => {
      if (d.success) setOkfNodeCount(d.count || 0);
    }).catch(() => {});
  }, [activeProjectId]);

  // Search memories
  const handleSearch = async () => {
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    try {
      const res = await fetch(`${API}/api/cerebro/vector-search`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: searchQuery, projectId: activeProjectId }) });
      const d = await res.json();
      if (d.success) setSearchResults(d.results || []);
    } catch { setSearchResults([]); }
  };

  // Approve/reject a learning
  const handleApproval = async (id: string, action: 'approve' | 'reject') => {
    try {
      await fetch(`${API}/api/cerebro/learning-approvals/${id}/${action}`, { method: 'POST' });
      setApprovals(prev => prev.filter(a => a.id !== id));
    } catch {}
  };

  const statusColor = health.status === 'nominal' ? '#00FF41' : health.status === 'stale' ? '#fbbf24' : health.status === 'warning' ? '#ef4444' : '#6b7280';

  return (
    <div className="p-6 space-y-6">
      {/* Widget A: Learning Approvals Interface */}
      <section className={GLOW_BOX}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Brain size={16} style={{ color: ACCENT }} /> Learning Approvals (Epistemic Gatekeeper)
          </h2>
          <span className="text-[10px] font-mono text-gray-500">{approvals.length} pending</span>
        </div>

        {approvals.length === 0 ? (
          <div className="flex items-center gap-3 p-4 rounded-lg bg-green-500/5 border border-green-500/20">
            <CheckCircle size={16} className="text-green-400" />
            <div><div className="text-xs font-bold text-green-400">No Pending Learnings</div><div className="text-[10px] text-gray-500">All inferences have been reviewed. The knowledge graph is current.</div></div>
          </div>
        ) : (
          <div className="space-y-2 max-h-[250px] overflow-y-auto pr-1">
            {approvals.map(a => (
              <div key={a.id} className="p-3 rounded-lg bg-black/30 border border-white/5 hover:border-blue-500/20 transition-all">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-white font-semibold leading-relaxed">{a.fact}</div>
                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-[9px] font-mono text-gray-500">Confidence: <span style={{ color: a.confidence > 0.9 ? '#00FF41' : a.confidence > 0.7 ? '#fbbf24' : '#ef4444' }}>{(a.confidence * 100).toFixed(0)}%</span></span>
                      {a.source_run_id && <span className="text-[9px] font-mono text-gray-600">Source: {a.source_run_id.substring(0, 8)}...</span>}
                    </div>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <button onClick={() => handleApproval(a.id, 'approve')} className="px-2 py-1 rounded text-[9px] font-bold bg-green-500/10 border border-green-500/30 text-green-400 hover:bg-green-500/20 transition-all" title="Promote to Substantiated Graph">✓</button>
                    <button onClick={() => handleApproval(a.id, 'reject')} className="px-2 py-1 rounded text-[9px] font-bold bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 transition-all" title="Reject inference">✗</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Widget B: Memory Browser & Topology Matrix */}
      <section className={GLOW_BOX}>
        <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2 mb-4">
          <Search size={16} style={{ color: ACCENT }} /> Memory Browser & Topology
        </h2>

        {/* Search */}
        <div className="flex gap-2 mb-4">
          <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }} placeholder="Search vectorized memories..." className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500/50" />
          <button onClick={handleSearch} className="px-3 py-2 rounded-lg text-black font-bold text-xs" style={{ backgroundColor: ACCENT }}><Search size={14} /></button>
        </div>

        {/* Results */}
        {searchResults.length > 0 ? (
          <div className="space-y-2 max-h-[200px] overflow-y-auto">
            {searchResults.map((r: any, i: number) => (
              <div key={i} className="p-3 rounded-lg bg-black/30 border border-white/5">
                <div className="text-xs text-white leading-relaxed">{r.text || r.content || r.id}</div>
                <div className="flex items-center gap-3 mt-2 text-[9px] font-mono text-gray-500">
                  {r.distance !== undefined && <span>Distance: <span style={{ color: ACCENT }}>{r.distance.toFixed(3)}</span></span>}
                  {r.access_count !== undefined && <span>Habituation: <span style={{ color: ACCENT_GOLD }}>{r.access_count}×</span></span>}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-[10px] text-gray-500 text-center py-4 border border-dashed border-white/10 rounded-lg">
            Enter a query above to search the semantic memory graph.
          </div>
        )}

        {/* Health Stats */}
        <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-white/5">
          <div className="text-center"><div className="text-[9px] text-gray-500 uppercase font-mono mb-1">Vector Count</div><div className="text-sm font-bold font-mono" style={{ color: ACCENT }}>{health.vectorCount}</div></div>
          <div className="text-center"><div className="text-[9px] text-gray-500 uppercase font-mono mb-1">Status</div><div className="text-sm font-bold font-mono uppercase" style={{ color: statusColor }}>{health.status}</div></div>
          <div className="text-center"><div className="text-[9px] text-gray-500 uppercase font-mono mb-1">Last Reflection</div><div className="text-[10px] font-mono" style={{ color: ACCENT }}>{health.lastReflection ? new Date(health.lastReflection).toLocaleTimeString() : 'Never'}</div></div>
        </div>
      </section>

      {/* Widget C: Habituation Decay & Pruning Monitor */}
      <section className={GLOW_BOX}>
        <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2 mb-4">
          <Clock size={16} style={{ color: ACCENT_GOLD }} /> Habituation Decay & Pruning Monitor
        </h2>
        <p className="text-xs text-gray-400 mb-4">Memories that haven't been accessed recently degrade over time. Pin critical memories to prevent decay.</p>

        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="bg-black/30 border border-white/5 rounded-lg p-3 text-center">
            <div className="text-[9px] text-gray-500 uppercase font-mono mb-1">Active Memories</div>
            <div className="text-lg font-bold font-mono" style={{ color: ACCENT }}>{health.vectorCount}</div>
          </div>
          <div className="bg-black/30 border border-white/5 rounded-lg p-3 text-center">
            <div className="text-[9px] text-gray-500 uppercase font-mono mb-1">Nearing Decay</div>
            <div className="text-lg font-bold font-mono text-amber-400">0</div>
          </div>
          <div className="bg-black/30 border border-white/5 rounded-lg p-3 text-center">
            <div className="text-[9px] text-gray-500 uppercase font-mono mb-1">Pruned (30d)</div>
            <div className="text-lg font-bold font-mono text-gray-500">0</div>
          </div>
        </div>

        <div className="flex gap-2">
          <button onClick={() => { fetch(`${API}/api/cerebro/habituate`, { method: 'POST' }); }} className="flex-1 px-3 py-2 rounded-lg border border-white/10 bg-white/5 text-[10px] font-bold text-gray-300 hover:bg-white/10 hover:text-white transition-all flex items-center justify-center gap-1.5">
            <Trash2 size={12} /> Trigger Consolidation Sweep
          </button>
          <button onClick={() => { fetch(`${API}/api/cerebro/pin-high-confidence`, { method: 'POST' }).catch(() => {}); }} className="flex-1 px-3 py-2 rounded-lg border border-white/10 bg-white/5 text-[10px] font-bold text-gray-300 hover:bg-white/10 hover:text-white transition-all flex items-center justify-center gap-1.5">
            <Pin size={12} /> Pin All High-Confidence
          </button>
        </div>
      </section>

      {/* Widget D: OKF Knowledge Graph Browser */}
      <section className={GLOW_BOX}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Database size={16} style={{ color: ACCENT }} /> OKF Knowledge Graph
          </h2>
          <button onClick={() => setShowMindmap(true)} className="text-[10px] font-mono font-bold px-2 py-0.5 rounded border border-teal-500/30 bg-teal-500/10 hover:bg-teal-500/20 transition-all" style={{ color: ACCENT }}>
            {okfNodeCount} nodes — Open Mindmap
          </button>
        </div>

        {/* Search */}
        <div className="flex gap-2 mb-4">
          <input type="text" value={okfSearch} onChange={e => setOkfSearch(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { fetch(`${API}/api/okf/search`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: okfSearch, projectId: activeProjectId }) }).then(r => r.json()).then(d => { if (d.success) setOkfResults(d.chunks || []); }).catch(() => {}); } }}
            placeholder="Search knowledge graph..."
            className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-teal-500/50" />
          <button onClick={() => { setOkfIndexing(true); fetch(`${API}/api/okf/index`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: activeProjectId }) }).then(r => r.json()).then(d => { if (d.success && d.result) setOkfNodeCount(prev => prev + d.result.indexed); }).catch(() => {}).finally(() => setOkfIndexing(false)); }}
            disabled={okfIndexing}
            className="px-3 py-2 rounded-lg border border-white/10 bg-white/5 text-[10px] font-bold text-gray-300 hover:bg-white/10 hover:text-white transition-all disabled:opacity-50">
            {okfIndexing ? 'Indexing...' : 'Re-index'}
          </button>
        </div>

        {/* Results */}
        {okfResults.length > 0 ? (
          <div className="space-y-2 max-h-[200px] overflow-y-auto">
            {okfResults.map((r: any, i: number) => (
              <div key={i} className="p-3 rounded-lg bg-black/30 border border-white/5">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-white">{r.title}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-teal-500/10 text-teal-400 border border-teal-500/20">{r.type}</span>
                    <span className="text-[9px] font-mono text-gray-500">{r.tier}</span>
                  </div>
                </div>
                <p className="text-[10px] text-gray-400 line-clamp-2">{r.content?.substring(0, 120)}...</p>
                <div className="text-[9px] text-gray-600 mt-1 font-mono">Confidence: {(r.confidence || 0).toFixed(2)}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-[10px] text-gray-500 text-center py-4 border border-dashed border-white/10 rounded-lg">
            {okfSearch ? 'No results found.' : 'Search the knowledge graph to see indexed concepts.'}
          </div>
        )}
      </section>
      <OKFMindmap isOpen={showMindmap} onClose={() => setShowMindmap(false)} />
    </div>
  );
}

// ─── Set-up View ────────────────────────────────────────────────────────────
function SetupView() {
  const [minSimilarity, setMinSimilarity] = useState(0.3);
  const [keywordFallback, setKeywordFallback] = useState(true);
  const [keywordBaseScore, setKeywordBaseScore] = useState(0.7);
  const [keywordMatchBoost, setKeywordMatchBoost] = useState(0.05);
  const [decayMultiplier, setDecayMultiplier] = useState(0.3);
  const [accessBoost, setAccessBoost] = useState(1.5);
  const [saving, setSaving] = useState(false);
  const [globalNodes, setGlobalNodes] = useState<{ id: string; title: string | null; type: string }[]>([]);

  useEffect(() => {
    fetch(`${API}/api/system/settings`).then(r => r.json()).then(d => {
      if (d.success && d.settings) {
        if (d.settings.cerebro_min_similarity) setMinSimilarity(Number(d.settings.cerebro_min_similarity));
        if (d.settings.cerebro_decay_multiplier) setDecayMultiplier(Number(d.settings.cerebro_decay_multiplier));
        if (d.settings.cerebro_access_boost) setAccessBoost(Number(d.settings.cerebro_access_boost));
      }
    }).catch(() => {});
  }, []);

  // Fetch real GLOBAL-tier OKF nodes (was hardcoded to 3 literal filenames)
  useEffect(() => {
    fetch(`${API}/api/okf/nodes?tier=GLOBAL&limit=100`).then(r => r.json()).then(d => {
      if (d.success && d.nodes) setGlobalNodes(d.nodes);
    }).catch(() => {});
  }, []);

  const saveSettings = async () => {
    setSaving(true);
    try {
      await fetch(`${API}/api/system/settings`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cerebro_min_similarity: minSimilarity, cerebro_keyword_fallback: keywordFallback, cerebro_keyword_base: keywordBaseScore, cerebro_keyword_boost: keywordMatchBoost, cerebro_decay_multiplier: decayMultiplier, cerebro_access_boost: accessBoost })
      });
    } catch {}
    setSaving(false);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Control A: Retrieval Engine & Fallback Configuration */}
      <section className={GLOW_BOX}>
        <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2 mb-4">
          <Search size={16} style={{ color: ACCENT }} /> Retrieval Engine & Fallback Configuration
        </h2>
        <p className="text-xs text-gray-400 mb-4">Manage vector cosine similarity thresholds and offline keyword fallback scoring.</p>

        <div className="space-y-4">
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-gray-300 font-bold">Minimum Similarity Threshold (Vector Search)</span>
              <span className="font-mono font-bold" style={{ color: ACCENT }}>{minSimilarity.toFixed(2)}</span>
            </div>
            <input type="range" min={0.1} max={0.9} step={0.05} value={minSimilarity} onChange={e => setMinSimilarity(+e.target.value)} className="w-full h-2 bg-white/5 rounded-lg appearance-none cursor-pointer border border-white/10" style={{ accentColor: ACCENT }} />
            <div className="flex justify-between text-[10px] text-gray-500 font-mono mt-1"><span>0.10 (Broad recall)</span><span>0.90 (Precision only)</span></div>
          </div>

          <label className="flex items-center justify-between p-3 rounded-lg bg-white/[0.03] border border-white/5 cursor-pointer hover:border-white/10 transition-all">
            <div><span className="text-xs font-bold text-white block">Keyword Fallback Engine</span><span className="text-[10px] text-gray-500">Activate when external embedding provider fails or returns dummy vectors</span></div>
            <input type="checkbox" checked={keywordFallback} onChange={e => setKeywordFallback(e.target.checked)} className="w-4 h-4 rounded" style={{ accentColor: ACCENT }} />
          </label>

          {keywordFallback && (
            <div className="grid grid-cols-2 gap-4 pl-4 border-l-2 border-blue-500/20">
              <div>
                <div className="flex justify-between text-[10px] mb-1"><span className="text-gray-400">Base Score</span><span className="font-mono" style={{ color: ACCENT }}>{keywordBaseScore}</span></div>
                <input type="range" min={0.3} max={0.9} step={0.05} value={keywordBaseScore} onChange={e => setKeywordBaseScore(+e.target.value)} className="w-full h-1.5 bg-white/5 rounded-lg appearance-none cursor-pointer border border-white/10" style={{ accentColor: ACCENT }} />
              </div>
              <div>
                <div className="flex justify-between text-[10px] mb-1"><span className="text-gray-400">Match Boost</span><span className="font-mono" style={{ color: ACCENT }}>+{keywordMatchBoost}</span></div>
                <input type="range" min={0.01} max={0.15} step={0.01} value={keywordMatchBoost} onChange={e => setKeywordMatchBoost(+e.target.value)} className="w-full h-1.5 bg-white/5 rounded-lg appearance-none cursor-pointer border border-white/10" style={{ accentColor: ACCENT }} />
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Control B: Habituation Scoring Algorithms */}
      <section className={GLOW_BOX}>
        <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2 mb-4">
          <Sliders size={16} style={{ color: ACCENT_GOLD }} /> Habituation Scoring Algorithms
        </h2>
        <p className="text-xs text-gray-400 mb-4">
          Controls the decay formula: R<sub>final</sub> = R<sub>semantic</sub> · (f<sub>access</sub> · <span style={{ color: ACCENT_GOLD }}>{accessBoost}×</span>) · e<sup>-(Δt · <span style={{ color: ACCENT }}>{decayMultiplier}×</span>)</sup>
        </p>

        <div className="space-y-4">
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-gray-300 font-bold">Idle-Dampening Multiplier (decay speed)</span>
              <span className="font-mono font-bold" style={{ color: ACCENT }}>{decayMultiplier.toFixed(2)}×</span>
            </div>
            <input type="range" min={0.1} max={1.0} step={0.05} value={decayMultiplier} onChange={e => setDecayMultiplier(+e.target.value)} className="w-full h-2 bg-white/5 rounded-lg appearance-none cursor-pointer border border-white/10" style={{ accentColor: ACCENT }} />
            <div className="flex justify-between text-[10px] text-gray-500 font-mono mt-1"><span>0.10 (Slow forget)</span><span>1.00 (Aggressive forget)</span></div>
          </div>
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-gray-300 font-bold">Active-Boost Multiplier (reinforcement)</span>
              <span className="font-mono font-bold" style={{ color: ACCENT_GOLD }}>{accessBoost.toFixed(1)}×</span>
            </div>
            <input type="range" min={1.0} max={3.0} step={0.1} value={accessBoost} onChange={e => setAccessBoost(+e.target.value)} className="w-full h-2 bg-white/5 rounded-lg appearance-none cursor-pointer border border-white/10" style={{ accentColor: ACCENT_GOLD }} />
            <div className="flex justify-between text-[10px] text-gray-500 font-mono mt-1"><span>1.0× (Minimal boost)</span><span>3.0× (Strong reinforcement)</span></div>
          </div>
        </div>
      </section>

      {/* Control C: Global Knowledge Base */}
      <section className={GLOW_BOX}>
        <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2 mb-4">
          <Database size={16} style={{ color: ACCENT }} /> Global Knowledge Base (GLOBAL Scope)
        </h2>
        <p className="text-xs text-gray-400 mb-4">System-wide rules and documentation applied across all projects. No client-specific secrets or PII permitted in this tier.</p>

        <div className="bg-black/30 border border-white/5 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-300 font-bold">Loaded Global Concepts</span>
            <span className="text-[10px] font-mono" style={{ color: ACCENT }}>{globalNodes.length} concept{globalNodes.length === 1 ? '' : 's'}</span>
          </div>
          {globalNodes.length === 0 ? (
            <div className="text-[10px] text-gray-500 px-1 py-2">No global knowledge indexed yet. Restart the server to seed the base-knowledge library, or add Markdown files to <code className="text-gray-400">~/.neurosync/global_okf/</code>.</div>
          ) : (
            <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
              {globalNodes.map((node) => (
                <div key={node.id} className="flex items-center gap-2 px-3 py-1.5 rounded bg-white/[0.03] border border-white/5">
                  <FileText size={12} style={{ color: ACCENT }} />
                  <span className="text-[10px] font-mono text-gray-300 flex-1 truncate">{node.title || node.id}</span>
                  <span className="text-[9px] text-gray-600">GLOBAL</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-3 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
          <div className="flex items-center gap-2 text-[10px] text-amber-400 font-bold">
            <AlertTriangle size={12} /> Security Notice
          </div>
          <p className="text-[10px] text-gray-500 mt-1">GLOBAL scope documents are accessible by all agents across all projects. Never upload credentials, PII, or client-specific data here.</p>
        </div>
      </section>

      {/* Save */}
      <div className="flex justify-end">
        <button onClick={saveSettings} disabled={saving} className="px-6 py-2.5 rounded-lg text-white font-bold text-sm transition-all shadow-lg hover:shadow-xl disabled:opacity-50" style={{ backgroundColor: ACCENT }}>
          {saving ? 'Saving...' : 'Commit Configuration'}
        </button>
      </div>
    </div>
  );
}

// ─── Main Export ─────────────────────────────────────────────────────────────
export function CerebroDashboard() {
  const [activeView, setActiveView] = useState<'dashboard' | 'setups'>('dashboard');

  return (
    <AppShell
      moduleId="cerebro"
      moduleName="Cerebro (Memory Matrix)"
      moduleLogo="/CerebroLogo.png"
      accentColor={ACCENT}
      activeView={activeView}
      onViewChange={setActiveView}
    >
      {activeView === 'dashboard' ? <DashboardView /> : <SetupView />}
    </AppShell>
  );
}
