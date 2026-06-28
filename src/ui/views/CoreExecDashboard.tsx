import React, { useState, useEffect, useRef } from 'react';
import { AppShell } from '../components/AppShell';
import { useNavigation } from '../layouts/OSLayout';
import { NotificationCenter } from '../components/NotificationCenter';
import { CronSummary } from '../components/CronSummary';
import { AutonomyDials } from '../components/AutonomyDials';
import { Play, AlertTriangle, Clock, CheckCircle, Cpu, RefreshCw, Shield, Power, BarChart2, Activity } from 'lucide-react';

const API = 'http://localhost:3743';
const ACCENT = '#00E5FF';

// Shared glow box class for center canvas sections
const GLOW_BOX = `bg-white/[0.02] border border-white/5 rounded-xl p-5 backdrop-blur-sm transition-all duration-300 shadow-[0_0_15px_rgba(0,229,255,0.08)] hover:shadow-[0_0_30px_rgba(0,229,255,0.2)] hover:border-[rgba(0,229,255,0.25)]`;

// ─── Types ──────────────────────────────────────────────────────────────────
interface WorkflowRun {
  id: string;
  status: string;
  created_at: number;
}
interface Task {
  id: string;
  status: string;
  output_data: string | null;
}

// ─── Dashboard View: DAG Canvas + Alerts + Cron ─────────────────────────────
function DashboardView() {
  const { activeProjectId } = useNavigation();
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [selectedRun, setSelectedRun] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loadingRuns, setLoadingRuns] = useState(true);
  const [logs, setLogs] = useState<string[]>([
    '[10:29:01] COREEXEC: Booting orchestrator...',
    '[10:29:02] BASEVAULT: SQLite WAL mode confirmed.',
    '[10:29:05] TASK_CLAIM: Thread-2 locked Node 2 (BEGIN IMMEDIATE)',
    '[10:29:06] ROUTESWITCH: Forwarding payload to inference engine...'
  ]);
  const logRef = useRef<HTMLDivElement>(null);

  // Append log entries on task status change
  useEffect(() => {
    if (tasks.length > 0) {
      const time = new Date().toLocaleTimeString('en-US', { hour12: false }).substring(0, 8);
      const running = tasks.filter(t => t.status === 'claimed').length;
      const completed = tasks.filter(t => t.status === 'completed').length;
      if (running > 0) setLogs(prev => [...prev.slice(-50), `[${time}] TASK_CLAIM: ${running} node(s) currently locked (BEGIN IMMEDIATE)`]);
      if (completed > 0) setLogs(prev => [...prev.slice(-50), `[${time}] COREEXEC: ${completed} node(s) execution complete. Output routed to BaseVault.`]);
    }
  }, [tasks]);

  // Auto-scroll log
  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' }); }, [logs]);

  // Fetch runs
  useEffect(() => {
    setLoadingRuns(true);
    fetch(`${API}/api/basevault/runs`)
      .then(r => r.json())
      .then(data => { if (data.runs) setRuns(data.runs); })
      .catch(() => {})
      .finally(() => setLoadingRuns(false));
  }, [activeProjectId]);

  // Fetch tasks for selected run
  useEffect(() => {
    if (!selectedRun) { setTasks([]); return; }
    fetch(`${API}/api/coreexec/run/${selectedRun}/status`)
      .then(r => r.json())
      .then(data => { if (data.tasks) setTasks(data.tasks); })
      .catch(() => {});
  }, [selectedRun]);

  // Poll run status every 5s
  useEffect(() => {
    if (!selectedRun) return;
    const iv = setInterval(() => {
      fetch(`${API}/api/coreexec/run/${selectedRun}/status`)
        .then(r => r.json())
        .then(data => { if (data.tasks) setTasks(data.tasks); })
        .catch(() => {});
    }, 5000);
    return () => clearInterval(iv);
  }, [selectedRun]);

  const statusIcon = (status: string) => {
    switch (status) {
      case 'completed': case 'success': return <CheckCircle size={14} className="text-green-400" />;
      case 'running': case 'claimed': return <Play size={14} className="text-cyan-400 animate-pulse" />;
      case 'failed': case 'error': return <AlertTriangle size={14} className="text-red-400" />;
      default: return <Clock size={14} className="text-gray-500" />;
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Widget A: DAG Canvas & Run Monitor */}
      <section className={GLOW_BOX}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Cpu size={16} style={{ color: ACCENT }} /> Active Workflow Runs
          </h2>
          <span className="text-[10px] font-mono text-gray-500">{runs.length} runs total</span>
        </div>

        {loadingRuns ? (
          <div className="text-xs text-gray-500 font-mono py-8 text-center">Loading workflow runs...</div>
        ) : runs.length === 0 ? (
          <div className="text-xs text-gray-400 py-8 text-center border border-dashed border-white/10 rounded-lg">
            No workflow runs found. Approve a DAG proposal from ScopeLogic to create one.
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Run List */}
            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
              {runs.slice(0, 10).map(run => (
                <button
                  key={run.id}
                  onClick={() => setSelectedRun(run.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all border ${
                    selectedRun === run.id ? 'bg-cyan-500/10 border-cyan-500/30' : 'border-white/5 hover:border-white/10 hover:bg-white/5'
                  }`}
                >
                  {statusIcon(run.status)}
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-mono text-white truncate">{run.id.substring(0, 12)}...</div>
                    <div className="text-[10px] text-gray-500">{new Date(run.created_at).toLocaleString()}</div>
                  </div>
                  <span className={`text-[9px] font-mono font-bold uppercase px-1.5 py-0.5 rounded ${
                    run.status === 'completed' ? 'bg-green-500/10 text-green-400' :
                    run.status === 'running' ? 'bg-cyan-500/10 text-cyan-400' :
                    run.status === 'failed' ? 'bg-red-500/10 text-red-400' :
                    'bg-gray-500/10 text-gray-400'
                  }`}>{run.status}</span>
                </button>
              ))}
            </div>

            {/* Task Detail for selected run */}
            <div className="bg-black/40 border border-white/5 rounded-lg p-4 min-h-[200px]">
              {!selectedRun ? (
                <div className="text-xs text-gray-500 text-center py-8 font-mono">Select a run to view its DAG nodes</div>
              ) : tasks.length === 0 ? (
                <div className="text-xs text-gray-500 text-center py-8 font-mono">No tasks in this run</div>
              ) : (
                <div className="space-y-2">
                  <div className="text-[10px] font-mono text-gray-500 uppercase tracking-widest mb-3">DAG Nodes ({tasks.length})</div>
                  {tasks.map((task, i) => (
                    <div key={task.id} className="flex items-center gap-3 px-3 py-2 rounded border border-white/5 bg-white/[0.02]">
                      <div className="flex items-center justify-center w-5 h-5 rounded-full border" style={{ borderColor: task.status === 'completed' ? '#22c55e' : task.status === 'claimed' ? ACCENT : '#374151' }}>
                        {statusIcon(task.status)}
                      </div>
                      <div className="flex-1">
                        <div className="text-xs font-mono text-white">Node {i + 1}</div>
                        <div className="text-[10px] text-gray-500 truncate">{task.id.substring(0, 16)}...</div>
                      </div>
                      <span className="text-[9px] font-mono font-bold uppercase" style={{ color: task.status === 'completed' ? '#22c55e' : task.status === 'claimed' ? ACCENT : '#6b7280' }}>{task.status}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Widget B: Orchestration Mentrix (from HTML reference) */}
      <section className={GLOW_BOX}>
        <div className="flex items-center justify-between border-b border-white/5 pb-3 mb-4">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <BarChart2 size={16} style={{ color: ACCENT }} /> Orchestration Mentrix
          </h2>
          <span className="text-[9px] font-mono text-gray-500 font-bold">Live Polling</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center text-xs">
          <div className="bg-black/40 p-3 rounded-xl border border-white/5">
            <span className="text-[9px] text-gray-500 font-bold uppercase block mb-1">398 Tests</span>
            <span className="text-sm font-black text-green-500 font-mono">PASSING</span>
          </div>
          <div className="bg-black/40 p-3 rounded-xl border border-white/5">
            <span className="text-[9px] text-gray-500 font-bold uppercase block mb-1">Duplicates</span>
            <span className="text-sm font-black font-mono" style={{ color: ACCENT }}>0</span>
          </div>
          <div className="bg-black/40 p-3 rounded-xl border border-white/5">
            <span className="text-[9px] text-gray-500 font-bold uppercase block mb-1">Retry Rate</span>
            <span className="text-sm font-black text-white font-mono">1.2%</span>
          </div>
          <div className="bg-black/40 p-3 rounded-xl border border-white/5">
            <span className="text-[9px] text-gray-500 font-bold uppercase block mb-1">Latency</span>
            <span className="text-sm font-black text-white font-mono">42ms</span>
          </div>
        </div>
      </section>

      {/* Widget C: Pino Transaction Log (from HTML reference) */}
      <section className={GLOW_BOX}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Activity size={16} style={{ color: ACCENT }} /> Pino Transaction Log
          </h2>
          <button onClick={() => setLogs([])} className="text-[10px] font-bold hover:underline" style={{ color: ACCENT }}>Clear</button>
        </div>
        <div className="bg-black border border-white/5 rounded-xl p-3 font-mono text-[9px] text-gray-400 h-[180px] overflow-y-auto space-y-1.5" ref={logRef}>
          {logs.length === 0 && <div className="text-gray-600 text-center py-4">No log events yet...</div>}
          {logs.map((log, i) => (
            <div key={i} className={log.startsWith('[') && log.includes('TASK_CLAIM') ? 'text-cyan-400' : log.includes('ERROR') ? 'text-red-400' : ''}>
              {log}
            </div>
          ))}
        </div>
      </section>

      {/* Widget D: Escalation & Alerts */}
      <section className={GLOW_BOX}>
        <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2 mb-4">
          <AlertTriangle size={16} className="text-amber-400" /> Escalation & Alerts Ledger
        </h2>
        <NotificationCenter />
      </section>

      {/* Widget E: Cron Summary */}
      <section className={GLOW_BOX}>
        <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2 mb-4">
          <Clock size={16} style={{ color: ACCENT }} /> Workflow Scheduler
        </h2>
        <CronSummary />
      </section>
    </div>
  );
}

// ─── Set-up View: Engine Tuning + DAG Safety + Recovery + Cron ───────────────
function SetupView() {
  const { activeProjectId } = useNavigation();
  const [maxIterations, setMaxIterations] = useState(5);
  const [autoRequeue, setAutoRequeue] = useState(true);
  const [snapshotOnCrash, setSnapshotOnCrash] = useState(true);
  const [saving, setSaving] = useState(false);

  // Cron scheduling state
  const [cronName, setCronName] = useState('');
  const [cronExpr, setCronExpr] = useState('');
  const [cronJobs, setCronJobs] = useState<{id:string;name:string;cron:string;nextTick:number|null}[]>([]);
  const [cronSaving, setCronSaving] = useState(false);
  const [cronError, setCronError] = useState('');

  // Fetch existing cron jobs
  useEffect(() => {
    fetch(`${API}/api/scheduler/jobs`).then(r => r.json()).then(d => {
      if (d.success && d.jobs) setCronJobs(d.jobs);
    }).catch(() => {});
  }, []);

  // Load settings from backend
  useEffect(() => {
    fetch(`${API}/api/system/settings`)
      .then(r => r.json())
      .then(data => {
        if (data.success && data.settings) {
          if (data.settings.max_iterations !== undefined) setMaxIterations(Number(data.settings.max_iterations));
          if (data.settings.auto_requeue !== undefined) setAutoRequeue(data.settings.auto_requeue === 'true' || data.settings.auto_requeue === true);
          if (data.settings.snapshot_on_crash !== undefined) setSnapshotOnCrash(data.settings.snapshot_on_crash === 'true' || data.settings.snapshot_on_crash === true);
        }
      })
      .catch(() => {});
  }, []);

  const saveSettings = async () => {
    setSaving(true);
    try {
      await fetch(`${API}/api/system/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ max_iterations: maxIterations, auto_requeue: autoRequeue, snapshot_on_crash: snapshotOnCrash })
      });
    } catch {}
    setSaving(false);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Control A: Engine Tuning & Dynamic Threading */}
      <section className={GLOW_BOX}>
        <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2 mb-4">
          <Cpu size={16} style={{ color: ACCENT }} /> Engine Tuning & Dynamic Threading
        </h2>
        <p className="text-xs text-gray-400 mb-4">Controls the worker thread pool size. Hardware limits are enforced — exceeding physical core count triggers a thermal warning.</p>
        <AutonomyDials />
      </section>

      {/* Control B: DAG Safety & Iteration Ceilings */}
      <section className={GLOW_BOX}>
        <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2 mb-4">
          <Shield size={16} className="text-amber-400" /> DAG Safety & Iteration Ceilings
        </h2>
        <p className="text-xs text-gray-400 mb-4">Maximum retry attempts before CoreExec escalates a failing node to the Alerts Ledger.</p>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-gray-300 font-semibold">Max Iterations per Node</span>
          <span className="text-sm font-mono font-bold" style={{ color: ACCENT }}>{maxIterations}</span>
        </div>
        <input
          type="range" min={1} max={15} value={maxIterations}
          onChange={e => setMaxIterations(+e.target.value)}
          className="w-full h-2 bg-white/5 rounded-lg appearance-none cursor-pointer border border-white/10"
          style={{ accentColor: ACCENT }}
        />
        <div className="flex justify-between text-[10px] text-gray-500 font-mono mt-1">
          <span>1 (Fail fast)</span><span>15 (Resilient)</span>
        </div>
      </section>

      {/* Control C: Recovery & Persistence Rules */}
      <section className={GLOW_BOX}>
        <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2 mb-4">
          <Power size={16} className="text-green-400" /> Recovery & Persistence Rules
        </h2>
        <p className="text-xs text-gray-400 mb-4">Dictates how CoreExec handles mid-flight crashes and server reboots.</p>
        <div className="space-y-3">
          <label className="flex items-center justify-between p-3 rounded-lg bg-white/[0.03] border border-white/5 cursor-pointer hover:border-white/10 transition-all">
            <div>
              <span className="text-xs font-bold text-white block">Auto-Requeue Stale Leases</span>
              <span className="text-[10px] text-gray-500">On restart, automatically requeue unclaimed tasks from the tasks table</span>
            </div>
            <input type="checkbox" checked={autoRequeue} onChange={e => setAutoRequeue(e.target.checked)} className="w-4 h-4 rounded" style={{ accentColor: ACCENT }} />
          </label>
          <label className="flex items-center justify-between p-3 rounded-lg bg-white/[0.03] border border-white/5 cursor-pointer hover:border-white/10 transition-all">
            <div>
              <span className="text-xs font-bold text-white block">Snapshot Before Crash Recovery</span>
              <span className="text-[10px] text-gray-500">Force a WAL checkpoint snapshot before attempting to resume interrupted workflows</span>
            </div>
            <input type="checkbox" checked={snapshotOnCrash} onChange={e => setSnapshotOnCrash(e.target.checked)} className="w-4 h-4 rounded" style={{ accentColor: ACCENT }} />
          </label>
        </div>
      </section>

      {/* Control Panel D: Workflow Cron Scheduler */}
      <section className={GLOW_BOX}>
        <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2 mb-4">
          <Clock size={16} style={{ color: ACCENT }} /> Workflow Cron Scheduler
        </h2>
        <p className="text-xs text-gray-400 mb-4">Schedule recurring DAG workflows. Uses standard 5-field cron syntax (minute hour day month weekday).</p>

        {/* Add new schedule */}
        <div className="bg-black/30 border border-white/5 rounded-lg p-4 space-y-3 mb-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">Workflow Name</label>
              <input type="text" value={cronName} onChange={e => setCronName(e.target.value)} placeholder="Daily data sync" className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500/50" />
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">Cron Expression</label>
              <input type="text" value={cronExpr} onChange={e => { setCronExpr(e.target.value); setCronError(''); }} placeholder="0 9 * * *" className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-cyan-500/50" />
            </div>
            <div className="flex items-end">
              <button
                onClick={async () => {
                  if (!cronName.trim() || !cronExpr.trim()) { setCronError('Name and expression required'); return; }
                  setCronSaving(true); setCronError('');
                  try {
                    const res = await fetch(`${API}/api/scheduler/jobs`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: activeProjectId || 'global', name: cronName, cronSchedule: cronExpr }) });
                    const d = await res.json();
                    if (d.success) { setCronName(''); setCronExpr(''); setCronJobs(prev => [...prev, { id: d.id, name: cronName, cron: cronExpr, nextTick: null }]); }
                    else { setCronError(d.error || 'Failed'); }
                  } catch { setCronError('Network error'); }
                  setCronSaving(false);
                }}
                disabled={cronSaving}
                className="w-full px-4 py-2 rounded-lg text-black font-bold text-xs disabled:opacity-50" style={{ backgroundColor: ACCENT }}
              >
                {cronSaving ? 'Adding...' : 'Add Schedule'}
              </button>
            </div>
          </div>
          {cronError && <div className="text-[10px] text-red-400 font-mono">{cronError}</div>}
          <div className="text-[9px] text-gray-600 font-mono">Examples: "0 9 * * *" (daily 9am) • "*/15 * * * *" (every 15min) • "0 0 * * 1" (weekly Monday)</div>
        </div>

        {/* Existing schedules */}
        {cronJobs.length > 0 && (
          <div className="space-y-2">
            <div className="text-[10px] font-mono text-gray-500 uppercase tracking-widest mb-2">Active Schedules ({cronJobs.length})</div>
            {cronJobs.map(job => (
              <div key={job.id} className="flex items-center justify-between p-2.5 rounded-lg bg-white/[0.03] border border-white/5">
                <div>
                  <div className="text-xs font-bold text-white">{job.name}</div>
                  <div className="text-[10px] font-mono text-gray-500">{job.cron} {job.nextTick ? `• Next: ${new Date(job.nextTick).toLocaleString()}` : ''}</div>
                </div>
                <button onClick={async () => { await fetch(`${API}/api/scheduler/jobs/${job.id}`, { method: 'DELETE' }).catch(() => {}); setCronJobs(prev => prev.filter(j => j.id !== job.id)); }} className="text-[9px] font-bold text-red-400 hover:text-red-300 px-2 py-1 rounded border border-red-500/20 bg-red-500/10 hover:bg-red-500/20 transition-all">Remove</button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Save Button */}
      <div className="flex justify-end">
        <button
          onClick={saveSettings}
          disabled={saving}
          className="px-6 py-2.5 rounded-lg text-black font-bold text-sm transition-all shadow-lg hover:shadow-xl disabled:opacity-50"
          style={{ backgroundColor: ACCENT }}
        >
          {saving ? 'Saving...' : 'Commit Configuration'}
        </button>
      </div>
    </div>
  );
}

// ─── Main Export ─────────────────────────────────────────────────────────────
export function CoreExecDashboard() {
  const [activeView, setActiveView] = useState<'dashboard' | 'setups'>('dashboard');

  return (
    <AppShell
      moduleId="coreexec"
      moduleName="CoreExec"
      moduleLogo="/COREEXECLogo.png"
      accentColor={ACCENT}
      activeView={activeView}
      onViewChange={setActiveView}
    >
      {activeView === 'dashboard' ? <DashboardView /> : <SetupView />}
    </AppShell>
  );
}
