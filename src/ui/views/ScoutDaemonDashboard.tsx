import React, { useState, useEffect } from 'react';
import { AppShell } from '../components/AppShell';
import { useNavigation } from '../layouts/OSLayout';
import { Radar, Activity, Inbox, Cpu, Thermometer, Power, Zap, Rss, Clock, Shield, AlertTriangle, CheckCircle, Skull } from 'lucide-react';

const API = 'http://localhost:3743';
const ACCENT = '#8E24AA';
const ACCENT_LIGHT = '#d05ce3';

// Shared glow box (purple glow)
const GLOW_BOX = `bg-white/[0.02] border border-white/5 rounded-xl p-5 backdrop-blur-sm transition-all duration-300 shadow-[0_0_15px_rgba(142,36,170,0.08)] hover:shadow-[0_0_30px_rgba(142,36,170,0.2)] hover:border-[rgba(142,36,170,0.25)]`;

// ─── Dashboard View ─────────────────────────────────────────────────────────
function DashboardView() {
  const { activeProjectId } = useNavigation();
  const [daemonState, setDaemonState] = useState<'passive'|'active'|'quarantine'|'sleeping'>('passive');
  const [cpuLoad, setCpuLoad] = useState(0.42);
  const [cpuTemp, setCpuTemp] = useState(38);
  const [utilization, setUtilization] = useState(12);
  const [discoveries, setDiscoveries] = useState<{id:string;title:string;type:string;created:string}[]>([]);
  const [todos, setTodos] = useState<any[]>([]);
  const [scoutDrafts, setScoutDrafts] = useState<{id:string;title:string|null;type:string;confidence:number;status:string;createdAt:number}[]>([]);

  // SSE connection for system metrics
  useEffect(() => {
    const es = new EventSource(`${API}/api/system/metrics`);
    es.addEventListener('telemetry', (e: any) => {
      try {
        const data = JSON.parse(e.data);
        if (data.utilization !== undefined) setUtilization(data.utilization);
        if (data.temperature !== undefined) setCpuTemp(Math.round(data.temperature));
        // Derive daemon state from load
        const load = data.utilization || 0;
        if (load > 80) setDaemonState('sleeping');
        else if (load > 50) setDaemonState('passive');
        else setDaemonState('active');
        setCpuLoad(load / 100);
      } catch {}
    });
    es.onerror = () => {};
    return () => es.close();
  }, []);

  // Fetch quarantine discoveries (from cerebro learning approvals as proxy)
  useEffect(() => {
    fetch(`${API}/api/cerebro/learning-approvals`).then(r => r.json()).then(d => {
      if (d.success && d.queue) {
        setDiscoveries(d.queue.map((q: any) => ({ id: q.id, title: q.fact, type: 'learning', created: new Date(q.created_at).toLocaleString() })));
      }
    }).catch(() => {});
    fetch(`${API}/api/todos`).then(r => r.json()).then(d => {
      if (d.success && d.todos) setTodos(d.todos);
    }).catch(() => {});
  }, [activeProjectId]);

  // Fetch OKF scout drafts
  useEffect(() => {
    fetch(`${API}/api/okf/scout-drafts`).then(r => r.json()).then(d => {
      if (d.success && d.drafts) setScoutDrafts(d.drafts);
    }).catch(() => {});
  }, [activeProjectId]);

  const stateConfig = {
    passive: { color: '#6b7280', label: 'Passive Monitoring', pulse: false },
    active: { color: ACCENT_LIGHT, label: 'Active Sensing', pulse: true },
    quarantine: { color: '#fbbf24', label: 'Drafts Awaiting Approval', pulse: true },
    sleeping: { color: '#374151', label: 'Sleeping (High Load)', pulse: false },
  };

  const state = stateConfig[daemonState];

  return (
    <div className="p-6 space-y-6">
      {/* Widget A: Ambient Vanguard Monitor */}
      <section className={GLOW_BOX}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Radar size={16} style={{ color: ACCENT_LIGHT }} /> Ambient Vanguard Monitor
          </h2>
          <span className="text-[10px] font-mono uppercase tracking-widest text-gray-500">Deference UI</span>
        </div>

        {/* Ambient Status Indicator */}
        <div className="flex items-center gap-4 p-4 rounded-lg bg-black/30 border border-white/5">
          <div className="relative">
            <span className={`block w-4 h-4 rounded-full ${state.pulse ? 'animate-pulse' : ''}`} style={{ backgroundColor: state.color, boxShadow: `0 0 12px ${state.color}` }}></span>
          </div>
          <div className="flex-1">
            <div className="text-xs font-bold text-white">{state.label}</div>
            <div className="text-[10px] text-gray-500 font-mono">ScoutDaemon is operating as a respectful guest on your hardware.</div>
          </div>
          <button onClick={() => { fetch(`${API}/api/scout/heartbeat`, { method: 'POST' }).catch(() => {}); }} className="px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 text-[10px] font-bold text-gray-300 hover:text-white hover:bg-white/10 transition-all">
            Decision Node Audit
          </button>
        </div>

        {/* Intent Preview (collapsed by default) */}
        <div className="mt-3 bg-black/20 border border-white/5 rounded-lg p-3 font-mono text-[10px] space-y-1.5" style={{ color: ACCENT_LIGHT }}>
          <div className="flex items-center gap-2"><CheckCircle size={12} className="text-green-400" /> Lifecycle: Passive SSE ingestion active</div>
          <div className="flex items-center gap-2 pl-4 border-l border-white/5"><Activity size={10} className="text-gray-500" /> Next scan: idle threshold met → trigger reflection</div>
          <div className="flex items-center gap-2 pl-4 border-l border-white/5"><Shield size={10} className="text-gray-500" /> Output: quarantined draft → os_todos ledger</div>
        </div>
      </section>

      {/* Widget B: Quarantine Staging & Discovery Ledger */}
      <section className={GLOW_BOX}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Inbox size={16} style={{ color: ACCENT_LIGHT }} /> Quarantine Staging & Discovery Ledger
          </h2>
          <span className="text-[10px] font-mono text-gray-500">{discoveries.length} pending</span>
        </div>

        {discoveries.length === 0 && todos.length === 0 ? (
          <div className="flex items-center gap-3 p-4 rounded-lg bg-green-500/5 border border-green-500/20">
            <CheckCircle size={16} className="text-green-400" />
            <div><div className="text-xs font-bold text-green-400">No Pending Discoveries</div><div className="text-[10px] text-gray-500">ScoutDaemon has not staged any new findings.</div></div>
          </div>
        ) : (
          <div className="space-y-2 max-h-[220px] overflow-y-auto">
            {discoveries.map(d => (
              <div key={d.id} className="flex items-center justify-between p-3 rounded-lg bg-black/30 border border-white/5 hover:border-purple-500/20 transition-all">
                <div className="flex-1 min-w-0 mr-3">
                  <div className="text-xs font-bold text-white truncate">{d.title}</div>
                  <div className="text-[10px] text-gray-500 font-mono">{d.type} • {d.created}</div>
                </div>
                <button onClick={async () => { try { await fetch(`${API}/api/todos/promote`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fact: d.title, sourceId: d.id }) }); setDiscoveries(prev => prev.filter(x => x.id !== d.id)); } catch {} }} className="shrink-0 px-2 py-1 rounded text-[9px] font-bold border border-purple-500/30 bg-purple-500/10 hover:bg-purple-500/20 transition-all" style={{ color: ACCENT_LIGHT }}>
                  Send to PortGrid
                </button>
              </div>
            ))}
            {todos.map(t => (
              <div key={t.id} className="flex items-center justify-between p-3 rounded-lg bg-black/30 border border-amber-500/20">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={12} className="text-amber-400" />
                  <div><div className="text-xs font-bold text-white">{t.escalation_reason}</div><div className="text-[10px] text-gray-500 font-mono">{t.severity}</div></div>
                </div>
                <span className="text-[9px] font-mono text-amber-400">AWAITING</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Widget B2: Scout Research Drafts (OKF Quarantine) */}
      <section className={GLOW_BOX}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Inbox size={16} style={{ color: ACCENT_LIGHT }} /> Scout Research Drafts (OKF)
          </h2>
          <span className="text-[10px] font-mono text-gray-500">{scoutDrafts.length} quarantined</span>
        </div>

        {scoutDrafts.length === 0 ? (
          <div className="flex items-center gap-3 p-4 rounded-lg bg-green-500/5 border border-green-500/20">
            <CheckCircle size={16} className="text-green-400" />
            <div><div className="text-xs font-bold text-green-400">No Pending Research</div><div className="text-[10px] text-gray-500">ScoutDaemon has no quarantined OKF drafts awaiting review.</div></div>
          </div>
        ) : (
          <div className="space-y-2 max-h-[200px] overflow-y-auto">
            {scoutDrafts.map(d => (
              <div key={d.id} className="flex items-center justify-between p-3 rounded-lg bg-black/30 border border-white/5 hover:border-purple-500/20 transition-all">
                <div className="flex-1 min-w-0 mr-3">
                  <div className="text-xs font-bold text-white truncate">{d.title || 'Untitled'}</div>
                  <div className="text-[10px] text-gray-500 font-mono">{d.type} • conf: {d.confidence.toFixed(2)} • {new Date(d.createdAt).toLocaleDateString()}</div>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <button onClick={async () => { await fetch(`${API}/api/okf/scout-drafts/${d.id}/promote`, { method: 'POST' }); setScoutDrafts(prev => prev.filter(x => x.id !== d.id)); }} className="px-2 py-1 rounded text-[9px] font-bold bg-green-500/10 border border-green-500/30 text-green-400 hover:bg-green-500/20 transition-all">Promote</button>
                  <button onClick={async () => { await fetch(`${API}/api/okf/scout-drafts/${d.id}/reject`, { method: 'POST' }); setScoutDrafts(prev => prev.filter(x => x.id !== d.id)); }} className="px-2 py-1 rounded text-[9px] font-bold bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 transition-all">Reject</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Widget C: Hardware-Adaptive Telemetry */}
      <section className={GLOW_BOX}>
        <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2 mb-4">
          <Thermometer size={16} className="text-orange-400" /> Hardware Telemetry ("Machine Persona")
        </h2>
        <p className="text-xs text-gray-400 mb-4">Visual justification of why ScoutDaemon is active or sleeping. Demonstrates graceful resource yielding.</p>

        <div className="grid grid-cols-3 gap-4">
          <div className="bg-black/30 border border-white/5 rounded-lg p-3 text-center">
            <div className="text-[9px] text-gray-500 uppercase font-mono mb-1">CPU Utilization</div>
            <div className="text-xl font-bold font-mono" style={{ color: utilization > 70 ? '#ef4444' : utilization > 40 ? '#fbbf24' : '#00FF41' }}>{utilization}%</div>
            <div className="w-full h-1.5 bg-black/40 rounded-full mt-2 overflow-hidden border border-white/5">
              <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${utilization}%`, backgroundColor: utilization > 70 ? '#ef4444' : utilization > 40 ? '#fbbf24' : '#00FF41' }}></div>
            </div>
          </div>
          <div className="bg-black/30 border border-white/5 rounded-lg p-3 text-center">
            <div className="text-[9px] text-gray-500 uppercase font-mono mb-1">CPU Temperature</div>
            <div className="text-xl font-bold font-mono" style={{ color: cpuTemp > 80 ? '#ef4444' : cpuTemp > 60 ? '#fbbf24' : '#00FF41' }}>{cpuTemp}°C</div>
            <div className="text-[10px] text-gray-600 mt-2 font-mono">{cpuTemp > 80 ? 'THERMAL WARNING' : cpuTemp > 60 ? 'Warm' : 'Cool'}</div>
          </div>
          <div className="bg-black/30 border border-white/5 rounded-lg p-3 text-center">
            <div className="text-[9px] text-gray-500 uppercase font-mono mb-1">Daemon State</div>
            <div className="text-sm font-bold font-mono" style={{ color: state.color }}>{daemonState.toUpperCase()}</div>
            <div className="text-[10px] text-gray-600 mt-2 font-mono">Load: {(cpuLoad * 100).toFixed(0)}%</div>
          </div>
        </div>
      </section>
    </div>
  );
}

// ─── Set-up View ────────────────────────────────────────────────────────────
function SetupView() {
  const [agentStopThreshold, setAgentStopThreshold] = useState(0.65);
  const [maxTokenBurn, setMaxTokenBurn] = useState(2000);
  const [sseEnabled, setSseEnabled] = useState(true);
  const [pollingEnabled, setPollingEnabled] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [tempCeiling, setTempCeiling] = useState(85);
  const [loadCeiling, setLoadCeiling] = useState(0.8);
  const [killSwitchActive, setKillSwitchActive] = useState(false);
  const [saving, setSaving] = useState(false);

  // Load settings
  useEffect(() => {
    fetch(`${API}/api/system/settings`).then(r => r.json()).then(d => {
      if (d.success && d.settings) {
        if (d.settings.agent_stop_threshold) setAgentStopThreshold(Number(d.settings.agent_stop_threshold));
        if (d.settings.scout_max_token_burn) setMaxTokenBurn(Number(d.settings.scout_max_token_burn));
        if (d.settings.scout_temp_ceiling) setTempCeiling(Number(d.settings.scout_temp_ceiling));
        if (d.settings.scout_load_ceiling) setLoadCeiling(Number(d.settings.scout_load_ceiling));
      }
    }).catch(() => {});
  }, []);

  const saveSettings = async () => {
    setSaving(true);
    try {
      await fetch(`${API}/api/system/settings`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_stop_threshold: agentStopThreshold, scout_max_token_burn: maxTokenBurn, scout_temp_ceiling: tempCeiling, scout_load_ceiling: loadCeiling, scout_sse_enabled: sseEnabled, scout_polling_enabled: pollingEnabled, scout_manual_mode: manualMode })
      });
    } catch {}
    setSaving(false);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Control A: Predictive Early Termination (AgentStop) */}
      <section className={GLOW_BOX}>
        <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2 mb-4">
          <Zap size={16} style={{ color: ACCENT_LIGHT }} /> Predictive Early Termination (AgentStop)
        </h2>
        <p className="text-xs text-gray-400 mb-4">Algorithmic circuit breaker. Monitors token-level entropy during background inference. If hallucination detected, executes kill-before-compute abort.</p>

        <div className="space-y-4">
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-gray-300 font-bold">Entropy Kill Threshold</span>
              <span className="font-mono font-bold" style={{ color: ACCENT_LIGHT }}>{agentStopThreshold.toFixed(2)}</span>
            </div>
            <input type="range" min={0.3} max={0.95} step={0.05} value={agentStopThreshold} onChange={e => setAgentStopThreshold(+e.target.value)} className="w-full h-2 bg-white/5 rounded-lg appearance-none cursor-pointer border border-white/10" style={{ accentColor: ACCENT }} />
            <div className="flex justify-between text-[10px] text-gray-500 font-mono mt-1"><span>0.30 (Aggressive kill)</span><span>0.95 (Permissive)</span></div>
          </div>
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-gray-300 font-bold">Max Token Burn per Background Task</span>
              <span className="font-mono font-bold" style={{ color: ACCENT_LIGHT }}>{maxTokenBurn.toLocaleString()}</span>
            </div>
            <input type="range" min={500} max={10000} step={250} value={maxTokenBurn} onChange={e => setMaxTokenBurn(+e.target.value)} className="w-full h-2 bg-white/5 rounded-lg appearance-none cursor-pointer border border-white/10" style={{ accentColor: ACCENT }} />
            <div className="flex justify-between text-[10px] text-gray-500 font-mono mt-1"><span>500 (Battery saver)</span><span>10,000 (Deep research)</span></div>
          </div>
        </div>
      </section>

      {/* Control B: Passive Ingestion & Sensing Modalities */}
      <section className={GLOW_BOX}>
        <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2 mb-4">
          <Rss size={16} style={{ color: ACCENT_LIGHT }} /> Passive Ingestion & Sensing Modalities
        </h2>
        <p className="text-xs text-gray-400 mb-4">Configure what ScoutDaemon monitors. Push-based feeds only — no aggressive polling that drains battery.</p>

        <div className="space-y-3">
          <label className="flex items-center justify-between p-3 rounded-lg bg-white/[0.03] border border-white/5 cursor-pointer hover:border-white/10 transition-all">
            <div><span className="text-xs font-bold text-white block">Server-Sent Events (SSE)</span><span className="text-[10px] text-gray-500">Passive push-based feeds (recommended)</span></div>
            <input type="checkbox" checked={sseEnabled} onChange={e => setSseEnabled(e.target.checked)} className="w-4 h-4 rounded" style={{ accentColor: ACCENT }} />
          </label>
          <label className="flex items-center justify-between p-3 rounded-lg bg-white/[0.03] border border-white/5 cursor-pointer hover:border-white/10 transition-all">
            <div><span className="text-xs font-bold text-white block">Active HTTP Polling</span><span className="text-[10px] text-red-400">⚠ Battery intensive — not recommended for laptops</span></div>
            <input type="checkbox" checked={pollingEnabled} onChange={e => setPollingEnabled(e.target.checked)} className="w-4 h-4 rounded" style={{ accentColor: ACCENT }} />
          </label>
          <label className="flex items-center justify-between p-3 rounded-lg bg-white/[0.03] border border-white/5 cursor-pointer hover:border-white/10 transition-all">
            <div><span className="text-xs font-bold text-white block">Manual Scout Mode (MVP)</span><span className="text-[10px] text-gray-500">Triggered one-off sweeps only, no autonomous scheduling</span></div>
            <input type="checkbox" checked={manualMode} onChange={e => setManualMode(e.target.checked)} className="w-4 h-4 rounded" style={{ accentColor: ACCENT }} />
          </label>
        </div>
      </section>

      {/* Control C: Idle-Detection & Hardware Yield Thresholds */}
      <section className={GLOW_BOX}>
        <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2 mb-4">
          <Clock size={16} style={{ color: ACCENT_LIGHT }} /> Idle-Detection & Hardware Yield
        </h2>
        <p className="text-xs text-gray-400 mb-4">Physical limits at which ScoutDaemon suspends all operations to protect the host machine.</p>

        <div className="space-y-4">
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-gray-300 font-bold">CPU Temperature Ceiling (auto-sleep)</span>
              <span className="font-mono font-bold" style={{ color: tempCeiling > 80 ? '#ef4444' : ACCENT_LIGHT }}>{tempCeiling}°C</span>
            </div>
            <input type="range" min={60} max={95} value={tempCeiling} onChange={e => setTempCeiling(+e.target.value)} className="w-full h-2 bg-white/5 rounded-lg appearance-none cursor-pointer border border-white/10" style={{ accentColor: ACCENT }} />
            <div className="flex justify-between text-[10px] text-gray-500 font-mono mt-1"><span>60°C (Conservative)</span><span>95°C (Aggressive)</span></div>
          </div>
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-gray-300 font-bold">1-min Load Average Ceiling (auto-yield)</span>
              <span className="font-mono font-bold" style={{ color: ACCENT_LIGHT }}>{loadCeiling.toFixed(2)}</span>
            </div>
            <input type="range" min={0.3} max={2.0} step={0.1} value={loadCeiling} onChange={e => setLoadCeiling(+e.target.value)} className="w-full h-2 bg-white/5 rounded-lg appearance-none cursor-pointer border border-white/10" style={{ accentColor: ACCENT }} />
            <div className="flex justify-between text-[10px] text-gray-500 font-mono mt-1"><span>0.30 (Sleep early)</span><span>2.00 (Only on saturation)</span></div>
          </div>
        </div>
      </section>

      {/* Control D: Absolute Manual Kill Switch */}
      <section className={`bg-white/[0.02] border rounded-xl p-5 backdrop-blur-sm transition-all duration-300 ${killSwitchActive ? 'border-red-500/40 shadow-[0_0_30px_rgba(220,38,38,0.2)]' : 'border-white/5 shadow-[0_0_15px_rgba(142,36,170,0.08)] hover:shadow-[0_0_30px_rgba(142,36,170,0.2)] hover:border-[rgba(142,36,170,0.25)]'}`}>
        <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2 mb-4">
          <Skull size={16} className="text-red-400" /> Absolute Manual Kill Switch
        </h2>
        <p className="text-xs text-gray-400 mb-4">
          Forcefully terminates the ScoutDaemon process (SIGKILL). Because it runs as a separate OS process, this instantly sheds CPU load without disrupting CoreExec or active workflows.
        </p>

        <div className="flex items-center justify-between p-4 rounded-lg border transition-all" style={{ backgroundColor: killSwitchActive ? 'rgba(220,38,38,0.1)' : 'rgba(0,0,0,0.3)', borderColor: killSwitchActive ? 'rgba(220,38,38,0.4)' : 'rgba(255,255,255,0.05)' }}>
          <div>
            <span className="text-sm font-bold block" style={{ color: killSwitchActive ? '#ef4444' : 'white' }}>
              {killSwitchActive ? 'DAEMON TERMINATED' : 'Daemon Running'}
            </span>
            <span className="text-[10px] text-gray-500">
              {killSwitchActive ? 'All background sensing halted. CPU resources released.' : 'Background process healthy. Click to force-terminate.'}
            </span>
          </div>
          <button
            onClick={async () => {
              if (killSwitchActive) {
                await fetch(`${API}/api/system/daemon/restart`, { method: 'POST' }).catch(() => {});
                setKillSwitchActive(false);
              } else {
                await fetch(`${API}/api/system/daemon/kill`, { method: 'POST' }).catch(() => {});
                setKillSwitchActive(true);
              }
            }}
            className={`px-5 py-2.5 rounded-lg font-black text-xs uppercase tracking-widest transition-all ${
              killSwitchActive
                ? 'bg-green-500/20 border border-green-500/40 text-green-400 hover:bg-green-500/30'
                : 'bg-red-500/20 border border-red-500/40 text-red-400 hover:bg-red-500/30 shadow-[0_0_15px_rgba(220,38,38,0.2)]'
            }`}
          >
            {killSwitchActive ? 'Restart Daemon' : 'Terminate Daemon'}
          </button>
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
export function ScoutDaemonDashboard() {
  const [activeView, setActiveView] = useState<'dashboard' | 'setups'>('dashboard');

  return (
    <AppShell
      moduleId="scoutdaemon"
      moduleName="ScoutDaemon (Foresight Engine)"
      moduleLogo="/SCOUTDAEMONLogo.png"
      accentColor={ACCENT}
      activeView={activeView}
      onViewChange={setActiveView}
    >
      {activeView === 'dashboard' ? <DashboardView /> : <SetupView />}
    </AppShell>
  );
}
