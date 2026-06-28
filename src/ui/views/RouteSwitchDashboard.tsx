import React, { useState, useEffect } from 'react';
import { AppShell } from '../components/AppShell';
import { useNavigation } from '../layouts/OSLayout';
import { Zap, Activity, AlertTriangle, Server, Cloud, CloudOff, Shield, Key, Plug, ListOrdered } from 'lucide-react';

const API = 'http://localhost:3743';
const ACCENT = '#FFB300';

// Shared glow box (amber glow)
const GLOW_BOX = `bg-white/[0.02] border border-white/5 rounded-xl p-5 backdrop-blur-sm transition-all duration-300 shadow-[0_0_15px_rgba(255,179,0,0.08)] hover:shadow-[0_0_30px_rgba(255,179,0,0.2)] hover:border-[rgba(255,179,0,0.25)]`;

// ─── Types ──────────────────────────────────────────────────────────────────
interface UsageData {
  tokens?: number;
  costUsd?: number;
  requests?: number;
}

// ─── Dashboard View ─────────────────────────────────────────────────────────
function DashboardView() {
  const { activeProjectId } = useNavigation();
  const [usage, setUsage] = useState<UsageData>({ tokens: 0, costUsd: 0, requests: 0 });
  const [config, setConfig] = useState<any>(null);
  const [alerts, setAlerts] = useState<string[]>([]);

  // Poll usage every 5s
  useEffect(() => {
    const fetchUsage = () => {
      fetch(`${API}/api/llm/usage`).then(r => r.json()).then(d => { if (d.success && d.usage24h) setUsage(d.usage24h); }).catch(() => {});
    };
    fetchUsage();
    const iv = setInterval(fetchUsage, 5000);
    return () => clearInterval(iv);
  }, [activeProjectId]);

  // Fetch config for provider status
  useEffect(() => {
    fetch(`${API}/api/llm/config`).then(r => r.json()).then(d => { if (d.success) setConfig(d); }).catch(() => {});
  }, []);

  const currentMode = config?.config?.provider === 'mock' ? 'Offline Mode' : config?.config?.provider === 'openai-compatible' ? 'Free-Cloud Mode' : 'Local Mode';
  const dailyCap = config?.telemetry?.dailyTokenCap || 50000;
  const tokensUsed = usage.tokens || 0;
  const callsRemaining = Math.max(0, Math.floor((dailyCap - tokensUsed) / 150));

  return (
    <div className="p-6 space-y-6">
      {/* Widget A: 24h Telemetry & Quota Ledger */}
      <section className={GLOW_BOX}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Zap size={16} style={{ color: ACCENT }} /> 24h Telemetry & Quota Ledger
          </h2>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded border border-white/10 bg-white/5" style={{ color: ACCENT }}>{currentMode}</span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <div className="bg-black/30 border border-white/5 rounded-lg p-3 text-center">
            <div className="text-[9px] text-gray-500 uppercase font-mono mb-1">Generated Tokens (24h)</div>
            <div className="text-xl font-bold font-mono text-green-400">{tokensUsed.toLocaleString()}</div>
          </div>
          <div className="bg-black/30 border border-white/5 rounded-lg p-3 text-center">
            <div className="text-[9px] text-gray-500 uppercase font-mono mb-1">Requests (24h)</div>
            <div className="text-xl font-bold font-mono" style={{ color: ACCENT }}>{(usage.requests || 0).toLocaleString()}</div>
          </div>
          <div className="bg-black/30 border border-white/5 rounded-lg p-3 text-center">
            <div className="text-[9px] text-gray-500 uppercase font-mono mb-1">Est. API Cost</div>
            <div className="text-xl font-bold font-mono text-cyan-400">${((usage.costUsd || 0)).toFixed(4)}</div>
          </div>
          <div className="bg-black/30 border border-white/5 rounded-lg p-3 text-center">
            <div className="text-[9px] text-gray-500 uppercase font-mono mb-1">Calls Remaining</div>
            <div className="text-xl font-bold font-mono" style={{ color: callsRemaining > 100 ? '#00FF41' : '#ef4444' }}>{callsRemaining}</div>
          </div>
        </div>

        {/* Quota Progress */}
        <div className="space-y-1">
          <div className="flex justify-between text-[10px] font-mono text-gray-500">
            <span>Daily Burn</span>
            <span>{tokensUsed.toLocaleString()} / {dailyCap.toLocaleString()} tokens</span>
          </div>
          <div className="w-full h-2 bg-black/40 rounded-full overflow-hidden border border-white/5">
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, (tokensUsed / dailyCap) * 100)}%`, background: `linear-gradient(to right, #00FF41, ${ACCENT})` }}></div>
          </div>
        </div>
      </section>

      {/* Widget B: LLM Fleet Health & Fallback Monitor */}
      <section className={GLOW_BOX}>
        <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2 mb-4">
          <Activity size={16} style={{ color: ACCENT }} /> LLM Fleet Health & Fallback Monitor
        </h2>

        <div className="space-y-2">
          {/* Provider rows */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-black/30 border border-green-500/20">
            <div className="flex items-center gap-3">
              <Server size={14} className="text-green-400" />
              <div><div className="text-xs font-bold text-white">Local Mock Provider</div><div className="text-[10px] text-gray-500 font-mono">Level 3 — Air-gapped fallback</div></div>
            </div>
            <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span><span className="text-[10px] font-mono text-green-400">ACTIVE</span></div>
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg bg-black/30 border border-white/5">
            <div className="flex items-center gap-3">
              <Cloud size={14} className="text-amber-400" />
              <div><div className="text-xs font-bold text-white">OpenRouter (Free Tier)</div><div className="text-[10px] text-gray-500 font-mono">Level 1 — Agent Preference</div></div>
            </div>
            <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-amber-500"></span><span className="text-[10px] font-mono text-amber-400">{config?.config?.provider === 'openai-compatible' ? 'CONNECTED' : 'STANDBY'}</span></div>
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg bg-black/30 border border-white/5 opacity-60">
            <div className="flex items-center gap-3">
              <CloudOff size={14} className="text-gray-500" />
              <div><div className="text-xs font-bold text-gray-400">OpenCode Zen (Paid)</div><div className="text-[10px] text-gray-600 font-mono">Level 2 — Category Default</div></div>
            </div>
            <span className="text-[10px] font-mono text-gray-600 border border-white/5 px-1.5 py-0.5 rounded bg-black/40">DISABLED</span>
          </div>
        </div>

        {/* Fallback Cascade */}
        <div className="mt-4 pt-3 border-t border-white/5">
          <div className="text-[10px] font-mono text-gray-500 mb-2 uppercase tracking-widest">Fallback Cascade Path</div>
          <div className="flex items-center gap-2 text-[10px] font-mono">
            <span className="px-2 py-1 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">Agent Preference</span>
            <span className="text-gray-600">→</span>
            <span className="px-2 py-1 rounded bg-white/5 text-gray-400 border border-white/10">Category Default</span>
            <span className="text-gray-600">→</span>
            <span className="px-2 py-1 rounded bg-green-500/10 text-green-400 border border-green-500/20">Local Mock</span>
          </div>
        </div>
      </section>

      {/* Widget C: Routing Alerts & Forecasting Blockers */}
      <section className={GLOW_BOX}>
        <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2 mb-4">
          <AlertTriangle size={16} className="text-red-400" /> Routing Alerts & Forecasting Blockers
        </h2>

        {alerts.length === 0 ? (
          <div className="flex items-center gap-3 p-4 rounded-lg bg-green-500/5 border border-green-500/20">
            <Shield size={18} className="text-green-400" />
            <div>
              <div className="text-xs font-bold text-green-400">All Clear</div>
              <div className="text-[10px] text-gray-500">No forecasting blockers or provider errors detected.</div>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {alerts.map((a, i) => (
              <div key={i} className="p-3 rounded-lg bg-red-500/5 border border-red-500/20 text-xs text-red-300">{a}</div>
            ))}
          </div>
        )}

        {/* Quick-fix Buttons */}
        <div className="flex gap-2 mt-4 pt-3 border-t border-white/5">
          <button onClick={() => { fetch(`${API}/api/routeswitch/provider`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'mock' }) }).catch(() => {}); }} className="flex-1 px-3 py-2 rounded-lg border border-white/10 bg-white/5 text-[10px] font-bold text-gray-300 hover:bg-white/10 hover:text-white transition-all">Switch to Local Mock</button>
          <button onClick={() => { fetch(`${API}/api/llm/clear-error`, { method: 'POST' }).catch(() => {}); }} className="flex-1 px-3 py-2 rounded-lg border border-white/10 bg-white/5 text-[10px] font-bold text-gray-300 hover:bg-white/10 hover:text-white transition-all">Clear Last Provider Error</button>
        </div>
      </section>
    </div>
  );
}

// ─── Set-up View ────────────────────────────────────────────────────────────
interface ProviderEntry { id: string; name: string; type: string; config: any; hasApiKey: boolean; isEnabled: boolean; createdAt: number; }
interface RoutingRule { id: string; scope: string; scopeId: string | null; providerChain: string[]; }

function SetupView() {
  // Provider Registry state
  const [providers, setProviders] = useState<ProviderEntry[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState('openai-compatible');
  const [formBaseUrl, setFormBaseUrl] = useState('http://localhost:1234/v1');
  const [formModelId, setFormModelId] = useState('Auto');
  const [formModelPath, setFormModelPath] = useState('/models/llama-3.gguf');
  const [formApiKey, setFormApiKey] = useState('');
  const [formSaving, setFormSaving] = useState(false);
  const [testResult, setTestResult] = useState<{connected:boolean;latencyMs?:number;error?:string;responsePreview?:string}|null>(null);
  const [testingProviderId, setTestingProviderId] = useState<string | null>(null);

  // Routing Rules state
  const [rules, setRules] = useState<RoutingRule[]>([]);
  const [activeScope, setActiveScope] = useState<'global'|'cerebro'|'project'|'agent'>('global');
  const [activeScopeId, setActiveScopeId] = useState<string>('');
  const [currentChain, setCurrentChain] = useState<string[]>([]);
  const [ruleSaving, setRuleSaving] = useState(false);
  const [addChainSelect, setAddChainSelect] = useState('');

  // Existing settings state
  const [dailyCeiling, setDailyCeiling] = useState(2.0);
  const [externalEnabled, setExternalEnabled] = useState(true);
  const [grammarEnabled, setGrammarEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mcpConnections, setMcpConnections] = useState<{id:string;name:string;transport:string;status:string}[]>([]);
  const [projects, setProjects] = useState<{id:string;name:string}[]>([]);

  // Load providers, rules, MCP, settings, projects
  useEffect(() => {
    fetch(`${API}/api/llm/providers`).then(r => r.json()).then(d => { if (d.success) setProviders(d.providers); }).catch(() => {});
    fetch(`${API}/api/llm/routing-rules`).then(r => r.json()).then(d => { if (d.success) setRules(d.rules); }).catch(() => {});
    fetch(`${API}/api/system/mcp/connections`).then(r => r.json()).then(d => { if (d.success && d.connections) setMcpConnections(d.connections); }).catch(() => {});
    fetch(`${API}/api/projects`).then(r => r.json()).then(d => { if (d.projects) setProjects(d.projects); }).catch(() => {});
    fetch(`${API}/api/system/settings`).then(r => r.json()).then(d => {
      if (d.success && d.settings) {
        if (d.settings.daily_cost_ceiling) setDailyCeiling(Number(d.settings.daily_cost_ceiling));
        if (d.settings.external_calls_enabled !== undefined) setExternalEnabled(d.settings.external_calls_enabled === 'true' || d.settings.external_calls_enabled === true);
        if (d.settings.grammar_constrained !== undefined) setGrammarEnabled(d.settings.grammar_constrained === 'true' || d.settings.grammar_constrained === true);
      }
    }).catch(() => {});
  }, []);

  // When scope tab changes, load the matching chain
  useEffect(() => {
    const scopeId = (activeScope === 'global' || activeScope === 'cerebro') ? null : activeScopeId;
    const match = rules.find(r => r.scope === activeScope && (r.scopeId || '') === (scopeId || ''));
    setCurrentChain(match ? match.providerChain : []);
  }, [activeScope, activeScopeId, rules]);

  // Provider CRUD helpers
  const handleSaveProvider = async () => {
    setFormSaving(true);
    const config = formType === 'openai-compatible' ? { baseUrl: formBaseUrl, modelId: formModelId } : formType === 'llama-cpp' ? { modelPath: formModelPath } : {};
    const body = { name: formName, type: formType, config, apiKey: formApiKey || undefined, isEnabled: true };
    try {
      if (editingId) {
        await fetch(`${API}/api/llm/providers/${editingId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      } else {
        await fetch(`${API}/api/llm/providers`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      }
      // Refresh list
      const d = await fetch(`${API}/api/llm/providers`).then(r => r.json());
      if (d.success) setProviders(d.providers);
      setShowAddForm(false); setEditingId(null); setFormName(''); setFormApiKey(''); setTestResult(null);
    } catch {}
    setFormSaving(false);
  };

  const handleDeleteProvider = async (id: string) => {
    try {
      const res = await fetch(`${API}/api/llm/providers/${id}`, { method: 'DELETE' });
      const d = await res.json();
      if (d.success) {
        setProviders(prev => prev.filter(p => p.id !== id));
        // Also remove from any local chain display
        setCurrentChain(prev => prev.filter(pId => pId !== id));
      } else {
        alert(d.error || 'Failed to delete provider');
      }
    } catch { alert('Network error deleting provider'); }
  };

  const handleTestProvider = async (id: string) => {
    setTestResult(null);
    setTestingProviderId(id);
    try {
      const d = await fetch(`${API}/api/llm/providers/${id}/test`, { method: 'POST' }).then(r => r.json());
      setTestResult(d.test || { connected: false, error: 'Unknown error' });
    } catch { setTestResult({ connected: false, error: 'Network error' }); }
  };

  const handleEditProvider = (p: ProviderEntry) => {
    setEditingId(p.id); setFormName(p.name); setFormType(p.type);
    if (p.type === 'openai-compatible') { setFormBaseUrl(p.config.baseUrl || ''); setFormModelId(p.config.modelId || 'Auto'); }
    if (p.type === 'llama-cpp') { setFormModelPath(p.config.modelPath || ''); }
    setFormApiKey(''); setShowAddForm(true); setTestResult(null);
  };

  // Routing Rules helpers
  const handleSaveChain = async () => {
    setRuleSaving(true);
    const scopeId = (activeScope === 'global' || activeScope === 'cerebro') ? null : activeScopeId || null;
    try {
      await fetch(`${API}/api/llm/routing-rules`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scope: activeScope, scopeId, providerChain: currentChain }) });
      const d = await fetch(`${API}/api/llm/routing-rules`).then(r => r.json());
      if (d.success) setRules(d.rules);
    } catch {}
    setRuleSaving(false);
  };

  const moveChainItem = (idx: number, dir: -1 | 1) => {
    const next = [...currentChain];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx]!, next[target]!] = [next[target]!, next[idx]!];
    setCurrentChain(next);
  };

  const removeFromChain = (idx: number) => setCurrentChain(prev => prev.filter((_, i) => i !== idx));
  const addToChain = (provId: string) => { if (provId && !currentChain.includes(provId)) { setCurrentChain(prev => [...prev, provId]); setAddChainSelect(''); } };

  const handleDeleteRule = async () => {
    const scopeId = (activeScope === 'global' || activeScope === 'cerebro') ? null : activeScopeId || null;
    const match = rules.find(r => r.scope === activeScope && (r.scopeId || '') === (scopeId || ''));
    if (!match) return;
    try {
      await fetch(`${API}/api/llm/routing-rules/${match.id}`, { method: 'DELETE' });
      const d = await fetch(`${API}/api/llm/routing-rules`).then(r => r.json());
      if (d.success) setRules(d.rules);
      setCurrentChain([]);
    } catch {}
  };

  // Settings save
  const saveSettings = async () => {
    setSaving(true);
    try {
      await fetch(`${API}/api/system/settings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ daily_cost_ceiling: dailyCeiling, external_calls_enabled: externalEnabled, grammar_constrained: grammarEnabled }) });
    } catch {}
    setSaving(false);
  };

  const providerLabel = (id: string) => providers.find(p => p.id === id)?.name || id;

  return (
    <div className="p-6 space-y-6">
      {/* Section A: Provider Registry */}
      <section className={GLOW_BOX}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Key size={16} style={{ color: ACCENT }} /> Provider Registry
          </h2>
          <button onClick={() => { setShowAddForm(true); setEditingId(null); setFormName(''); setFormType('openai-compatible'); setFormBaseUrl('http://localhost:1234/v1'); setFormModelId('Auto'); setFormModelPath('/models/llama-3.gguf'); setFormApiKey(''); setTestResult(null); }} className="px-3 py-1.5 rounded-lg text-[10px] font-bold text-black transition-all" style={{ backgroundColor: ACCENT }}>+ Add Provider</button>
        </div>
        <p className="text-xs text-gray-400 mb-4">Named LLM endpoint entries. API keys are encrypted at rest. Create multiple entries of the same type for different models or services.</p>

        {/* Provider cards */}
        <div className="space-y-2">
          {providers.length === 0 && !showAddForm && (
            <div className="text-xs text-gray-500 text-center py-6 border border-dashed border-white/10 rounded-lg">No providers configured. Click "Add Provider" to get started.</div>
          )}
          {providers.map(p => (
            <div key={p.id} className={`flex flex-col rounded-lg border transition-all ${p.isEnabled ? 'bg-black/30 border-white/10' : 'bg-black/20 border-white/5 opacity-60'}`}>
              <div className="flex items-center justify-between p-3">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <Server size={14} style={{ color: p.isEnabled ? ACCENT : '#6b7280' }} />
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-white truncate">{p.name}</div>
                    <div className="text-[10px] text-gray-500 font-mono">{p.type} {p.hasApiKey ? '• key set' : ''} {p.config.baseUrl ? `• ${p.config.baseUrl}` : ''}{p.config.modelPath ? `• ${p.config.modelPath}` : ''}</div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button onClick={() => handleTestProvider(p.id)} className="px-2 py-1 rounded text-[9px] font-bold border border-white/10 bg-white/5 text-gray-300 hover:text-white hover:bg-white/10 transition-all">Test</button>
                  <button onClick={() => handleEditProvider(p)} className="px-2 py-1 rounded text-[9px] font-bold border border-white/10 bg-white/5 text-gray-300 hover:text-white hover:bg-white/10 transition-all">Edit</button>
                  <button onClick={() => handleDeleteProvider(p.id)} className="px-2 py-1 rounded text-[9px] font-bold border border-red-500/20 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all">Del</button>
                </div>
              </div>
              {testingProviderId === p.id && testResult && (
                <div className={`mx-3 mb-3 flex items-center gap-2 p-2 rounded-lg text-[10px] font-mono ${testResult.connected ? 'bg-green-500/10 border border-green-500/20 text-green-400' : 'bg-red-500/10 border border-red-500/20 text-red-400'}`}>
                  {testResult.connected ? `✓ Connected (${testResult.latencyMs}ms) — ${testResult.responsePreview || ''}` : `✕ Failed: ${testResult.error}`}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Add/Edit Form */}
        {showAddForm && (
          <div className="mt-4 p-4 bg-black/30 border border-white/10 rounded-lg space-y-3">
            <div className="text-xs font-bold text-white mb-2">{editingId ? 'Edit Provider' : 'New Provider'}</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">Name</label>
                <input type="text" value={formName} onChange={e => setFormName(e.target.value)} placeholder="My LMStudio" className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500/50" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">Type</label>
                <select value={formType} onChange={e => setFormType(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500/50">
                  <option value="openai-compatible">OpenAI Compatible</option>
                  <option value="llama-cpp">Local GGUF (llama.cpp)</option>
                  <option value="mock">Offline Mock</option>
                </select>
              </div>
            </div>
            {formType === 'openai-compatible' && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div><label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">Base URL</label><input type="text" value={formBaseUrl} onChange={e => setFormBaseUrl(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-amber-500/50" /></div>
                <div><label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">Model ID</label><input type="text" value={formModelId} onChange={e => setFormModelId(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-amber-500/50" /></div>
                <div><label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">API Key</label><input type="password" value={formApiKey} onChange={e => setFormApiKey(e.target.value)} placeholder={editingId ? '(unchanged)' : 'sk-...'} className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-amber-500/50" /></div>
              </div>
            )}
            {formType === 'llama-cpp' && (
              <div><label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">Model Path (.gguf)</label><input type="text" value={formModelPath} onChange={e => setFormModelPath(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-amber-500/50" /></div>
            )}
            <div className="flex gap-2 pt-2">
              <button onClick={handleSaveProvider} disabled={formSaving || !formName.trim()} className="px-4 py-2 rounded-lg text-black font-bold text-xs disabled:opacity-50 transition-all" style={{ backgroundColor: ACCENT }}>{formSaving ? 'Saving...' : editingId ? 'Update' : 'Save Provider'}</button>
              <button onClick={() => { setShowAddForm(false); setEditingId(null); }} className="px-4 py-2 rounded-lg border border-white/10 text-xs font-bold text-gray-400 hover:text-white transition-all">Cancel</button>
            </div>
          </div>
        )}
      </section>

      {/* Section B: Default & Fallback Chain (Routing Rules) */}
      <section className={GLOW_BOX}>
        <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2 mb-4">
          <ListOrdered size={16} style={{ color: ACCENT }} /> Default & Fallback Chain
        </h2>
        <p className="text-xs text-gray-400 mb-4">Set the provider priority order per scope. Position 1 is primary; remaining are fallbacks tried on failure. Most specific scope wins at runtime.</p>

        {/* Scope tabs */}
        <div className="flex gap-1 mb-4 bg-black/30 p-1 rounded-lg border border-white/5">
          {(['global', 'cerebro', 'project', 'agent'] as const).map(s => (
            <button key={s} onClick={() => { setActiveScope(s); setActiveScopeId(''); }} className={`flex-1 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wide transition-all ${activeScope === s ? 'text-black' : 'text-gray-400 hover:text-white'}`} style={activeScope === s ? { backgroundColor: ACCENT } : {}}>{s}</button>
          ))}
        </div>

        {/* Scope ID selector for project/agent */}
        {activeScope === 'project' && (
          <div className="mb-3">
            <select value={activeScopeId} onChange={e => setActiveScopeId(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500/50">
              <option value="">Select a project...</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        )}
        {activeScope === 'agent' && (
          <div className="mb-3">
            <select value={activeScopeId} onChange={e => setActiveScopeId(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500/50">
              <option value="">Select an agent/workflow...</option>
              <option value="scopelogic-interview">ScopeLogic Interview</option>
              <option value="council-mode">Council Mode</option>
              <option value="coreexec-dag">CoreExec DAG Execution</option>
              <option value="scoutdaemon-reflection">ScoutDaemon Reflection</option>
            </select>
          </div>
        )}

        {/* Current chain */}
        <div className="space-y-2 mb-3">
          {currentChain.length === 0 ? (
            <div className="text-[10px] text-gray-500 text-center py-4 border border-dashed border-white/10 rounded-lg">No chain configured for this scope. Add providers below.</div>
          ) : currentChain.map((provId, idx) => (
            <div key={provId + idx} className="flex items-center gap-2 p-2.5 rounded-lg bg-black/30 border border-white/5">
              <span className="text-xs font-bold font-mono w-5 text-center" style={{ color: ACCENT }}>{idx + 1}</span>
              <span className="text-xs text-white font-semibold flex-1">{providerLabel(provId)}</span>
              <button onClick={() => moveChainItem(idx, -1)} disabled={idx === 0} className="text-[10px] text-gray-500 hover:text-white disabled:opacity-30 px-1">▲</button>
              <button onClick={() => moveChainItem(idx, 1)} disabled={idx === currentChain.length - 1} className="text-[10px] text-gray-500 hover:text-white disabled:opacity-30 px-1">▼</button>
              <button onClick={() => removeFromChain(idx)} className="text-[10px] text-red-400 hover:text-red-300 px-1">✕</button>
            </div>
          ))}
        </div>

        {/* Add to chain */}
        {providers.filter(p => !currentChain.includes(p.id)).length > 0 && (
          <div className="flex gap-2 items-center mb-3">
            <select value={addChainSelect} onChange={e => setAddChainSelect(e.target.value)} className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500/50">
              <option value="">Select provider to add...</option>
              {providers.filter(p => !currentChain.includes(p.id)).map(p => <option key={p.id} value={p.id}>{p.name} ({p.type})</option>)}
            </select>
            <button onClick={() => addToChain(addChainSelect)} disabled={!addChainSelect} className="px-3 py-1.5 rounded-lg text-[10px] font-bold border border-white/10 bg-white/5 text-gray-300 hover:text-white hover:bg-white/10 transition-all disabled:opacity-30">Add to Chain</button>
          </div>
        )}

        <div className="flex gap-2">
          <button onClick={handleSaveChain} disabled={ruleSaving || currentChain.length === 0} className="flex-1 px-4 py-2 rounded-lg text-black font-bold text-xs disabled:opacity-50 transition-all" style={{ backgroundColor: ACCENT }}>{ruleSaving ? 'Saving...' : 'Save Routing Rule'}</button>
          {currentChain.length > 0 && rules.find(r => r.scope === activeScope && (r.scopeId || '') === ((activeScope === 'global' || activeScope === 'cerebro') ? '' : activeScopeId || '')) && (
            <button onClick={handleDeleteRule} className="px-4 py-2 rounded-lg text-xs font-bold border border-red-500/20 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all">Delete Rule</button>
          )}
        </div>
      </section>

      {/* Section C: Free Mode Governor Limits */}
      <section className={GLOW_BOX}>
        <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2 mb-4">
          <Shield size={16} style={{ color: ACCENT }} /> Free Mode Governor Limits
        </h2>
        <div className="space-y-4">
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-gray-300 font-bold">Hard Daily Cost Ceiling (Auto-Park)</span>
              <span className="font-mono font-bold" style={{ color: ACCENT }}>${dailyCeiling.toFixed(2)}</span>
            </div>
            <input type="range" min={0} max={10} step={0.25} value={dailyCeiling} onChange={e => setDailyCeiling(+e.target.value)} className="w-full h-2 bg-white/5 rounded-lg appearance-none cursor-pointer border border-white/10" style={{ accentColor: ACCENT }} />
            <div className="flex justify-between text-[10px] text-gray-500 font-mono mt-1"><span>$0 (Free only)</span><span>$10.00/day</span></div>
          </div>
          <label className="flex items-center justify-between p-3 rounded-lg bg-white/[0.03] border border-white/5 cursor-pointer hover:border-white/10 transition-all">
            <div><span className="text-xs font-bold text-white block">External Calls Enabled</span><span className="text-[10px] text-gray-500">When disabled, all requests route exclusively to the local mock provider</span></div>
            <input type="checkbox" checked={externalEnabled} onChange={e => setExternalEnabled(e.target.checked)} className="w-4 h-4 rounded" style={{ accentColor: ACCENT }} />
          </label>
          <label className="flex items-center justify-between p-3 rounded-lg bg-white/[0.03] border border-white/5 cursor-pointer hover:border-white/10 transition-all">
            <div><span className="text-xs font-bold text-white block">Grammar-Constrained Decoding (GBNF)</span><span className="text-[10px] text-gray-500">Force valid JSON output via logit masking</span></div>
            <input type="checkbox" checked={grammarEnabled} onChange={e => setGrammarEnabled(e.target.checked)} className="w-4 h-4 rounded" style={{ accentColor: ACCENT }} />
          </label>
        </div>
      </section>

      {/* Section D: MCP Connection Manager */}
      <section className={GLOW_BOX}>
        <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2 mb-4">
          <Plug size={16} style={{ color: ACCENT }} /> MCP Connection Manager
        </h2>
        <div className="space-y-2">
          {mcpConnections.map(conn => (
            <div key={conn.id} className="flex items-center justify-between p-3 rounded-lg bg-black/30 border border-green-500/20">
              <div className="flex items-center gap-3">
                <Plug size={14} className={conn.status === 'active' ? 'text-green-400' : 'text-gray-500'} />
                <div><div className="text-xs font-bold text-white">{conn.name}</div><div className="text-[10px] text-gray-500 font-mono">{conn.transport} | {conn.status}</div></div>
              </div>
              <span className={`text-[10px] font-mono ${conn.status === 'active' ? 'text-green-400' : 'text-gray-500'}`}>{conn.status === 'active' ? 'CONNECTED' : 'OFFLINE'}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Save Settings */}
      <div className="flex justify-end">
        <button onClick={saveSettings} disabled={saving} className="px-6 py-2.5 rounded-lg text-black font-bold text-sm transition-all shadow-lg hover:shadow-xl disabled:opacity-50" style={{ backgroundColor: ACCENT }}>
          {saving ? 'Saving...' : 'Commit Configuration'}
        </button>
      </div>
    </div>
  );
}

// ─── Main Export ─────────────────────────────────────────────────────────────
export function RouteSwitchDashboard() {
  const [activeView, setActiveView] = useState<'dashboard' | 'setups'>('dashboard');

  return (
    <AppShell
      moduleId="routeswitch"
      moduleName="RouteSwitch"
      moduleLogo="/ROUTESWITCHLogo.png"
      accentColor={ACCENT}
      activeView={activeView}
      onViewChange={setActiveView}
    >
      {activeView === 'dashboard' ? <DashboardView /> : <SetupView />}
    </AppShell>
  );
}
