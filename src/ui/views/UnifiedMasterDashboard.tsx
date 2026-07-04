import React, { useState, useEffect } from 'react';
import { AppShell } from '../components/AppShell';
import { useNavigation } from '../layouts/OSLayout';
import { NotificationCenter } from '../components/NotificationCenter';
import { CronSummary } from '../components/CronSummary';
import { Activity, Brain, Zap, Clock, Trash2, Sun, Moon, Monitor, MessageSquare, Gauge, FileText } from 'lucide-react';
import { useTheme } from '../components/ThemeContext';

const API = 'http://localhost:3743';
const ACCENT = '#D4AF37';

// Shared glow box (sovereign gold glow)
const GLOW_BOX = `bg-white/[0.02] border border-white/5 rounded-xl p-5 backdrop-blur-sm transition-all duration-300 shadow-[0_0_15px_rgba(212,175,55,0.08)] hover:shadow-[0_0_30px_rgba(212,175,55,0.2)] hover:border-[rgba(212,175,55,0.25)]`;

// ─── Dashboard View ─────────────────────────────────────────────────────────
function DashboardView() {
  const { activeProjectId } = useNavigation();
  const [kpi, setKpi] = useState({ workers: 0, idle: 0, busy: 0, queued: 0, utilization: 0 });
  const [usage, setUsage] = useState({ tokens: 0, requests: 0, costUsd: 0 });
  const [cerebro, setCerebro] = useState({ vectorCount: 0, status: 'cold', lastReflection: null as number | null });

  // SSE for live KPI
  useEffect(() => {
    const es = new EventSource(`${API}/api/system/metrics`);
    es.addEventListener('telemetry', (e: any) => {
      try {
        const d = JSON.parse(e.data);
        setKpi({
          workers: d.pool?.workerNodes || 0,
          idle: d.pool?.idleWorkerNodes || 0,
          busy: d.pool?.busyWorkerNodes || 0,
          queued: d.pool?.queuedTasks || 0,
          utilization: d.utilization || 0,
        });
      } catch {}
    });
    return () => es.close();
  }, []);

  // Fetch usage + cerebro on mount and poll
  useEffect(() => {
    const fetchAll = () => {
      fetch(`${API}/api/llm/usage`).then(r => r.json()).then(d => { if (d.success && d.usage24h) setUsage(d.usage24h); }).catch(() => {});
      fetch(`${API}/api/cerebro/health`).then(r => r.json()).then(d => { if (d.success) setCerebro({ vectorCount: d.vectorCount, status: d.status, lastReflection: d.lastReflection }); }).catch(() => {});
    };
    fetchAll();
    const iv = setInterval(fetchAll, 10000);
    return () => clearInterval(iv);
  }, [activeProjectId]);

  const cerebroStatusColor = cerebro.status === 'nominal' ? '#00FF41' : cerebro.status === 'stale' ? '#fbbf24' : cerebro.status === 'warning' ? '#ef4444' : '#6b7280';

  return (
    <div className="p-6 space-y-6">
      {/* Widget A: OS KPI Strip */}
      <section className={GLOW_BOX}>
        <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2 mb-4">
          <Activity size={16} style={{ color: ACCENT }} /> System KPI Strip (Live)
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="bg-black/30 border border-white/5 rounded-lg p-3 text-center">
            <div className="text-[9px] text-gray-500 uppercase font-mono mb-1">Workers</div>
            <div className="text-xl font-bold font-mono text-cyan-400">{kpi.workers}</div>
            <div className="text-[9px] text-gray-600 mt-1">{kpi.busy} busy / {kpi.idle} idle</div>
          </div>
          <div className="bg-black/30 border border-white/5 rounded-lg p-3 text-center">
            <div className="text-[9px] text-gray-500 uppercase font-mono mb-1">CPU Load</div>
            <div className="text-xl font-bold font-mono" style={{ color: kpi.utilization > 70 ? '#ef4444' : kpi.utilization > 40 ? '#fbbf24' : '#00FF41' }}>{kpi.utilization}%</div>
          </div>
          <div className="bg-black/30 border border-white/5 rounded-lg p-3 text-center">
            <div className="text-[9px] text-gray-500 uppercase font-mono mb-1">Tokens (24h)</div>
            <div className="text-xl font-bold font-mono text-green-400">{(usage.tokens || 0).toLocaleString()}</div>
          </div>
          <div className="bg-black/30 border border-white/5 rounded-lg p-3 text-center">
            <div className="text-[9px] text-gray-500 uppercase font-mono mb-1">API Cost (24h)</div>
            <div className="text-xl font-bold font-mono" style={{ color: ACCENT }}>${(usage.costUsd || 0).toFixed(4)}</div>
          </div>
          <div className="bg-black/30 border border-white/5 rounded-lg p-3 text-center">
            <div className="text-[9px] text-gray-500 uppercase font-mono mb-1">Memory Vectors</div>
            <div className="text-xl font-bold font-mono text-teal-400">{cerebro.vectorCount}</div>
          </div>
        </div>
      </section>

      {/* 2x2 Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Widget B: Action Center */}
        <section className={GLOW_BOX}>
          <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2 mb-4">
            <Zap size={16} className="text-red-400" /> Action Center & Escalations
          </h2>
          <NotificationCenter />
        </section>

        {/* Widget C: Cerebro Health */}
        <section className={GLOW_BOX}>
          <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2 mb-4">
            <Brain size={16} className="text-teal-400" /> Cerebro Health & Habituation
          </h2>

          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-black/30 border border-white/5 rounded-lg p-3 text-center">
              <div className="text-[9px] text-gray-500 uppercase font-mono mb-1">Vectors</div>
              <div className="text-lg font-bold font-mono text-teal-400">{cerebro.vectorCount}</div>
            </div>
            <div className="bg-black/30 border border-white/5 rounded-lg p-3 text-center">
              <div className="text-[9px] text-gray-500 uppercase font-mono mb-1">Status</div>
              <div className="text-sm font-bold font-mono uppercase" style={{ color: cerebroStatusColor }}>{cerebro.status}</div>
            </div>
            <div className="bg-black/30 border border-white/5 rounded-lg p-3 text-center">
              <div className="text-[9px] text-gray-500 uppercase font-mono mb-1">Last Sweep</div>
              <div className="text-[10px] font-mono text-teal-400">{cerebro.lastReflection ? new Date(cerebro.lastReflection).toLocaleTimeString() : 'Never'}</div>
            </div>
          </div>

          <button onClick={() => { fetch(`${API}/api/cerebro/habituate`, { method: 'POST' }); }} className="w-full px-4 py-2 rounded-lg border border-white/10 bg-white/5 text-xs font-bold text-gray-300 hover:bg-white/10 hover:text-white transition-all flex items-center justify-center gap-2">
            <Trash2 size={12} /> Trigger Memory Consolidation Sweep
          </button>
        </section>

        {/* Widget D: Cron Summary */}
        <section className={`${GLOW_BOX} lg:col-span-2`}>
          <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2 mb-4">
            <Clock size={16} style={{ color: ACCENT }} /> Scheduled Workflows
          </h2>
          <CronSummary />
        </section>
      </div>
    </div>
  );
}

// ─── Set-up View ────────────────────────────────────────────────────────────
function SetupView() {
  const { theme, setTheme } = useTheme();
  const [pollingInterval, setPollingInterval] = useState(5000);
  const [maxConcurrent, setMaxConcurrent] = useState(3);
  const [claimBatch, setClaimBatch] = useState(5);
  const [logLevel, setLogLevel] = useState('info');
  const [smartTips, setSmartTips] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [saving, setSaving] = useState(false);

  // Load settings
  useEffect(() => {
    fetch(`${API}/api/system/settings`).then(r => r.json()).then(d => {
      if (d.success && d.settings) {
        if (d.settings.polling_interval) setPollingInterval(Number(d.settings.polling_interval));
        if (d.settings.max_concurrent) setMaxConcurrent(Number(d.settings.max_concurrent));
        if (d.settings.claim_batch_size) setClaimBatch(Number(d.settings.claim_batch_size));
        if (d.settings.log_level) setLogLevel(d.settings.log_level);
        if (d.settings.smart_tips !== undefined) setSmartTips(d.settings.smart_tips === 'true' || d.settings.smart_tips === true);
        if (d.settings.reduced_motion !== undefined) setReducedMotion(d.settings.reduced_motion === 'true' || d.settings.reduced_motion === true);
      }
    }).catch(() => {});
  }, []);

  const saveSettings = async () => {
    setSaving(true);
    try {
      await fetch(`${API}/api/system/settings`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ polling_interval: pollingInterval, max_concurrent: maxConcurrent, claim_batch_size: claimBatch, log_level: logLevel, smart_tips: smartTips, reduced_motion: reducedMotion })
      });
    } catch {}
    setSaving(false);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Control A: Global Polling & Concurrency */}
      <section className={GLOW_BOX}>
        <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2 mb-4">
          <Gauge size={16} style={{ color: ACCENT }} /> Global Polling & Concurrency Limits
        </h2>
        <p className="text-xs text-gray-400 mb-4">Controls the heartbeat rhythm and traffic flow of the local server. Affects all modules.</p>

        <div className="space-y-4">
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-gray-300 font-bold">Frontend Polling Interval</span>
              <span className="font-mono font-bold" style={{ color: ACCENT }}>{pollingInterval}ms</span>
            </div>
            <input type="range" min={1000} max={30000} step={1000} value={pollingInterval} onChange={e => setPollingInterval(+e.target.value)} className="w-full h-2 bg-white/5 rounded-lg appearance-none cursor-pointer border border-white/10" style={{ accentColor: ACCENT }} />
            <div className="flex justify-between text-[10px] text-gray-500 font-mono mt-1"><span>1s (Aggressive)</span><span>30s (Battery saver)</span></div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-gray-300 font-bold">Max Concurrent Tasks</span>
                <span className="font-mono font-bold" style={{ color: ACCENT }}>{maxConcurrent}</span>
              </div>
              <input type="range" min={1} max={16} value={maxConcurrent} onChange={e => setMaxConcurrent(+e.target.value)} className="w-full h-2 bg-white/5 rounded-lg appearance-none cursor-pointer border border-white/10" style={{ accentColor: ACCENT }} />
            </div>
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-gray-300 font-bold">Claim Batch Size</span>
                <span className="font-mono font-bold" style={{ color: ACCENT }}>{claimBatch}</span>
              </div>
              <input type="range" min={1} max={20} value={claimBatch} onChange={e => setClaimBatch(+e.target.value)} className="w-full h-2 bg-white/5 rounded-lg appearance-none cursor-pointer border border-white/10" style={{ accentColor: ACCENT }} />
            </div>
          </div>
        </div>
      </section>

      {/* Control B: System Observability & Logging */}
      <section className={GLOW_BOX}>
        <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2 mb-4">
          <FileText size={16} style={{ color: ACCENT }} /> System Observability & Logging
        </h2>
        <p className="text-xs text-gray-400 mb-4">Saved as a preference, but not yet enforced anywhere in the backend — server-side logs are not currently filtered by this setting.</p>

        <div>
          <label className="text-xs font-bold text-gray-300 block mb-2">Log Level</label>
          <div className="flex gap-2">
            {['debug', 'info', 'warn', 'error', 'silent'].map(level => (
              <button key={level} onClick={() => setLogLevel(level)} className={`flex-1 px-3 py-2.5 rounded-lg text-[10px] font-bold uppercase tracking-wide transition-all border ${logLevel === level ? 'text-black border-transparent shadow-md' : 'text-gray-400 border-white/10 hover:border-white/20 hover:text-white'}`} style={logLevel === level ? { backgroundColor: ACCENT } : {}}>
                {level}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Control C: Master UI & Theme */}
      <section className={GLOW_BOX}>
        <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2 mb-4">
          <Monitor size={16} style={{ color: ACCENT }} /> Master UI & Theme Preferences
        </h2>

        <div className="space-y-4">
          {/* Theme selector */}
          <div>
            <label className="text-xs font-bold text-gray-300 block mb-2">Color Theme</label>
            <div className="flex gap-2">
              <button onClick={() => setTheme('dark')} className={`flex-1 px-3 py-2.5 rounded-lg text-xs font-bold transition-all border flex items-center justify-center gap-2 ${theme === 'dark' ? 'bg-white/10 border-white/20 text-white' : 'border-white/5 text-gray-400 hover:text-white'}`}>
                <Moon size={14} /> Sovereign Black
              </button>
              <button onClick={() => setTheme('light')} className={`flex-1 px-3 py-2.5 rounded-lg text-xs font-bold transition-all border flex items-center justify-center gap-2 ${theme === 'light' ? 'bg-white/10 border-white/20 text-white' : 'border-white/5 text-gray-400 hover:text-white'}`}>
                <Sun size={14} /> Light Mode
              </button>
              <button onClick={() => setTheme('system')} className={`flex-1 px-3 py-2.5 rounded-lg text-xs font-bold transition-all border flex items-center justify-center gap-2 ${theme === 'system' ? 'bg-white/10 border-white/20 text-white' : 'border-white/5 text-gray-400 hover:text-white'}`}>
                <Monitor size={14} /> System
              </button>
            </div>
          </div>

          {/* SmartTips & Accessibility */}
          <label className="flex items-center justify-between p-3 rounded-lg bg-white/[0.03] border border-white/5 cursor-pointer hover:border-white/10 transition-all">
            <div>
              <span className="text-xs font-bold text-white block">SmartTips System (Global Kill-Switch)</span>
              <span className="text-[10px] text-gray-500">Disable 45+ educational tooltips system-wide for experienced operators</span>
            </div>
            <input type="checkbox" checked={smartTips} onChange={e => setSmartTips(e.target.checked)} className="w-4 h-4 rounded" style={{ accentColor: ACCENT }} />
          </label>
          <label className="flex items-center justify-between p-3 rounded-lg bg-white/[0.03] border border-white/5 cursor-pointer hover:border-white/10 transition-all">
            <div>
              <span className="text-xs font-bold text-white block">Prefers Reduced Motion</span>
              <span className="text-[10px] text-gray-500">Disable all animations and transitions for accessibility compliance</span>
            </div>
            <input type="checkbox" checked={reducedMotion} onChange={e => setReducedMotion(e.target.checked)} className="w-4 h-4 rounded" style={{ accentColor: ACCENT }} />
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
export function UnifiedMasterDashboard({ onNavigate }: { onNavigate?: (view: string) => void }) {
  const [activeView, setActiveView] = useState<'dashboard' | 'setups'>('dashboard');

  return (
    <AppShell
      moduleId="master"
      moduleName="System View"
      moduleLogo="/NeuroSyncSovereignOSLogo.png"
      accentColor={ACCENT}
      activeView={activeView}
      onViewChange={setActiveView}
    >
      {activeView === 'dashboard' ? <DashboardView /> : <SetupView />}
    </AppShell>
  );
}
