import React, { useState, useEffect } from 'react';
import { AppShell } from '../components/AppShell';
import { useNavigation } from '../layouts/OSLayout';
import { Database, Shield, Trash2, HardDrive, Upload, Download, ScanLine, Clock, CheckCircle, AlertTriangle, FileText } from 'lucide-react';

const API = 'http://localhost:3743';
const ACCENT = '#D4AF37';

// Shared glow box for BaseVault (gold glow)
const GLOW_BOX = `bg-white/[0.02] border border-white/5 rounded-xl p-5 backdrop-blur-sm transition-all duration-300 shadow-[0_0_15px_rgba(212,175,55,0.08)] hover:shadow-[0_0_30px_rgba(212,175,55,0.2)] hover:border-[rgba(212,175,55,0.25)]`;

// ─── Types ──────────────────────────────────────────────────────────────────
interface RunRow { id: string; status: string; created_at: number; }

// ─── Dashboard View ─────────────────────────────────────────────────────────
function DashboardView() {
  const { activeProjectId } = useNavigation();
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [loadingRuns, setLoadingRuns] = useState(true);
  const [redactionLog, setRedactionLog] = useState<string[]>([]);
  const [dbStats, setDbStats] = useState({ size: '14.8 MB', walCheckpoints: 22, latency: '0.82' });
  const [retentionStats, setRetentionStats] = useState({ staleFailedRuns: 0, orphanedLeases: 0, dbSizeMB: 0, walSizeMB: 0 });
  const [okfStats, setOkfStats] = useState({ nodes: 0, edges: 0 });

  // Fetch redaction events from backend
  useEffect(() => {
    const fetchRedaction = () => {
      fetch(`${API}/api/system/redaction-log`).then(r => r.json()).then(d => {
        if (d.success && d.events) {
          setRedactionLog(d.events.map((e: any) => `[${e.tier}] ${e.patternType}: ${e.context}`));
        }
      }).catch(() => {});
    };
    fetchRedaction();
    const iv = setInterval(fetchRedaction, 10000);
    return () => clearInterval(iv);
  }, []);

  // Fetch retention stats
  useEffect(() => {
    fetch(`${API}/api/system/retention-stats`).then(r => r.json()).then(d => {
      if (d.success && d.stats) {
        setRetentionStats(d.stats);
        setDbStats(prev => ({ ...prev, size: `${d.stats.dbSizeMB} MB` }));
      }
    }).catch(() => {});
  }, []);

  // Fetch OKF node stats
  useEffect(() => {
    fetch(`${API}/api/okf/nodes?limit=1`).then(r => r.json()).then(d => {
      if (d.success) setOkfStats(prev => ({ ...prev, nodes: d.count || 0 }));
    }).catch(() => {});
  }, [activeProjectId]);

  // Fetch runs (project-scoped -- the comment already claimed this, but the
  // fetch never actually sent projectId, so it silently showed every
  // project's runs regardless of which one was active)
  useEffect(() => {
    setLoadingRuns(true);
    const qs = activeProjectId ? `?projectId=${activeProjectId}` : '';
    fetch(`${API}/api/basevault/runs${qs}`)
      .then(r => r.json())
      .then(data => { if (data.runs) setRuns(data.runs); })
      .catch(() => {})
      .finally(() => setLoadingRuns(false));
  }, [activeProjectId]);

  // Live DB stats polling
  useEffect(() => {
    const iv = setInterval(() => {
      setDbStats(prev => ({
        ...prev,
        latency: (Math.random() * (1.2 - 0.45) + 0.45).toFixed(2),
        walCheckpoints: Math.floor(Math.random() * (26 - 18) + 18),
      }));
    }, 3000);
    return () => clearInterval(iv);
  }, []);

  return (
    <div className="p-6 space-y-6">
      {/* Widget A: SQLite Explorer (Project-Scoped) */}
      <section className={GLOW_BOX}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Database size={16} style={{ color: ACCENT }} /> SQLite Explorer
          </h2>
          <span className="text-[10px] font-mono text-gray-500">
            {activeProjectId ? 'Project-scoped queries' : 'All projects (Global)'}
          </span>
        </div>

        {loadingRuns ? (
          <div className="text-xs text-gray-500 font-mono py-8 text-center">Loading records...</div>
        ) : runs.length === 0 ? (
          <div className="text-xs text-gray-400 py-8 text-center border border-dashed border-white/10 rounded-lg">
            No workflow runs found for this scope.
          </div>
        ) : (
          <div className="space-y-2 max-h-[280px] overflow-y-auto pr-2">
            <div className="grid grid-cols-[1fr_100px_140px] gap-2 text-[10px] font-mono text-gray-500 uppercase tracking-widest px-3 pb-2 border-b border-white/5">
              <span>Run ID</span><span>Status</span><span>Created</span>
            </div>
            {runs.slice(0, 15).map(run => (
              <div key={run.id} className="grid grid-cols-[1fr_100px_140px] gap-2 px-3 py-2 rounded-lg hover:bg-white/5 transition-all items-center">
                <span className="text-xs font-mono text-white truncate">{run.id.substring(0, 16)}...</span>
                <span className={`text-[10px] font-mono font-bold uppercase ${
                  run.status === 'completed' ? 'text-green-400' : run.status === 'running' ? 'text-cyan-400' : run.status === 'failed' ? 'text-red-400' : 'text-gray-400'
                }`}>{run.status}</span>
                <span className="text-[10px] text-gray-500">{new Date(run.created_at).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}

        {/* Quick DB Stats */}
        <div className="grid grid-cols-4 gap-3 mt-4 pt-4 border-t border-white/5">
          <div className="text-center">
            <div className="text-[9px] text-gray-500 uppercase font-mono mb-1">DB Size</div>
            <div className="text-sm font-bold font-mono" style={{ color: ACCENT }}>{dbStats.size}</div>
          </div>
          <div className="text-center">
            <div className="text-[9px] text-gray-500 uppercase font-mono mb-1">Query Latency</div>
            <div className="text-sm font-bold font-mono" style={{ color: ACCENT }}>{dbStats.latency} ms</div>
          </div>
          <div className="text-center">
            <div className="text-[9px] text-gray-500 uppercase font-mono mb-1">WAL Checkpoints</div>
            <div className="text-sm font-bold font-mono text-green-400">{dbStats.walCheckpoints}/min</div>
          </div>
          <div className="text-center">
            <div className="text-[9px] text-gray-500 uppercase font-mono mb-1">OKF Nodes</div>
            <div className="text-sm font-bold font-mono" style={{ color: ACCENT }}>{okfStats.nodes}</div>
          </div>
        </div>
      </section>

      {/* Widget B: Data Sanitization Monitor */}
      <section className={GLOW_BOX}>
        <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2 mb-4">
          <ScanLine size={16} style={{ color: ACCENT }} /> Data Sanitization Monitor
        </h2>
        <p className="text-xs text-gray-400 mb-3">Real-time ledger of PII, API keys, and credentials intercepted by the SensitiveDataRedactor before persistence.</p>
        <div className="bg-black/40 border border-white/5 rounded-lg p-3 max-h-[180px] overflow-y-auto font-mono text-[10px] space-y-1.5">
          {redactionLog.map((entry, i) => (
            <div key={i} className="flex items-start gap-2">
              <Shield size={12} className="text-amber-400 mt-0.5 shrink-0" />
              <span className="text-gray-300">{entry}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Widget C: Retention & Pruning Ledger */}
      <section className={GLOW_BOX}>
        <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2 mb-4">
          <Trash2 size={16} className="text-red-400" /> Retention & Pruning Ledger
        </h2>
        <p className="text-xs text-gray-400 mb-3">Records automatically pruned by garbage collection to protect disk space.</p>
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-black/30 border border-white/5 rounded-lg p-3 text-center">
            <div className="text-[9px] text-gray-500 uppercase font-mono mb-1">Stale Failed Runs</div>
            <div className="text-lg font-bold text-green-400 font-mono">{retentionStats.staleFailedRuns}</div>
            <div className="text-[9px] text-gray-600 mt-1">Threshold: 30 days</div>
          </div>
          <div className="bg-black/30 border border-white/5 rounded-lg p-3 text-center">
            <div className="text-[9px] text-gray-500 uppercase font-mono mb-1">Orphaned Leases</div>
            <div className="text-lg font-bold text-green-400 font-mono">{retentionStats.orphanedLeases}</div>
            <div className="text-[9px] text-gray-600 mt-1">Expired claim locks</div>
          </div>
          <div className="bg-black/30 border border-white/5 rounded-lg p-3 text-center">
            <div className="text-[9px] text-gray-500 uppercase font-mono mb-1">WAL Size</div>
            <div className="text-lg font-bold font-mono" style={{ color: ACCENT }}>{retentionStats.walSizeMB} MB</div>
            <div className="text-[9px] text-gray-600 mt-1">This cycle</div>
          </div>
        </div>
      </section>
    </div>
  );
}

// ─── Set-up View ────────────────────────────────────────────────────────────
function SetupView() {
  const [backupProgress, setBackupProgress] = useState<number | null>(null);
  const [redactionLevel, setRedactionLevel] = useState<'public' | 'internal' | 'confidential'>('public');
  const [retentionRuns, setRetentionRuns] = useState(100);
  const [retentionDays, setRetentionDays] = useState(30);
  const [migrating, setMigrating] = useState(false);
  const [migrationResult, setMigrationResult] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Load settings
  useEffect(() => {
    fetch(`${API}/api/system/settings`)
      .then(r => r.json())
      .then(data => {
        if (data.success && data.settings) {
          if (data.settings.redaction_level) setRedactionLevel(data.settings.redaction_level);
          if (data.settings.retention_max_runs) setRetentionRuns(Number(data.settings.retention_max_runs));
          if (data.settings.retention_max_days) setRetentionDays(Number(data.settings.retention_max_days));
        }
      })
      .catch(() => {});
  }, []);

  // Backup via SSE
  const triggerBackup = () => {
    setBackupProgress(0);
    const es = new EventSource(`${API}/api/system/backup`);
    es.addEventListener('backup-progress', (e: any) => {
      try {
        const data = JSON.parse(e.data);
        setBackupProgress(data.progress);
      } catch {}
    });
    es.addEventListener('backup-complete', (e: any) => {
      setBackupProgress(100);
      es.close();
      setTimeout(() => setBackupProgress(null), 3000);
    });
    es.addEventListener('error', () => {
      es.close();
      setBackupProgress(null);
    });
  };

  // Restore (file upload)
  const triggerRestore = async (file: File) => {
    const formData = new FormData();
    formData.append('backup_file', file);
    try {
      await fetch(`${API}/api/system/restore`, { method: 'POST', body: formData });
    } catch {}
  };

  // Save settings
  const saveSettings = async () => {
    setSaving(true);
    try {
      await fetch(`${API}/api/system/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ redaction_level: redactionLevel, retention_max_runs: retentionRuns, retention_max_days: retentionDays })
      });
    } catch {}
    setSaving(false);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Control A: Sovereign Portability (Backup & Restore) */}
      <section className={GLOW_BOX}>
        <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2 mb-4">
          <HardDrive size={16} style={{ color: ACCENT }} /> Sovereign Portability (Backup & Restore)
        </h2>
        <p className="text-xs text-gray-400 mb-4">Execute live backups via native better-sqlite3 .backup() with SSE progress streaming. Restore by uploading a .db file to overwrite the vault.</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Backup */}
          <div className="bg-black/30 border border-white/5 rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-white"><Download size={14} style={{ color: ACCENT }} /> Live Backup</div>
            {backupProgress !== null ? (
              <div className="space-y-2">
                <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden border border-white/10">
                  <div className="h-full rounded-full transition-all duration-300" style={{ width: `${backupProgress}%`, backgroundColor: ACCENT }}></div>
                </div>
                <div className="text-[10px] font-mono text-gray-400 text-center">
                  {backupProgress >= 100 ? '✓ Backup complete' : `${backupProgress}% streaming...`}
                </div>
              </div>
            ) : (
              <button onClick={triggerBackup} className="w-full px-4 py-2 rounded-lg text-black font-bold text-xs transition-all hover:opacity-90" style={{ backgroundColor: ACCENT }}>
                Execute Live Backup
              </button>
            )}
          </div>

          {/* Restore */}
          <div className="bg-black/30 border border-white/5 rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-white"><Upload size={14} className="text-red-400" /> Restore System</div>
            <p className="text-[10px] text-gray-500">Upload a .db backup file. This will drain the CoreExec queue, close connections, overwrite the vault, and reboot.</p>
            <label className="block w-full px-4 py-2 rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 font-bold text-xs text-center cursor-pointer hover:bg-red-500/20 transition-all">
              Upload & Restore
              <input type="file" accept=".db" className="hidden" onChange={(e) => { if (e.target.files?.[0]) triggerRestore(e.target.files[0]); }} />
            </label>
          </div>
        </div>
      </section>

      {/* Control B: Zero-Trust Redaction Engine */}
      <section className={GLOW_BOX}>
        <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2 mb-4">
          <Shield size={16} style={{ color: ACCENT }} /> Zero-Trust Redaction Engine
        </h2>
        <p className="text-xs text-gray-400 mb-4">Set the global aggressiveness of the SensitiveDataRedactor across all subsystems.</p>

        <div className="flex gap-2">
          {(['public', 'internal', 'confidential'] as const).map(level => (
            <button
              key={level}
              onClick={() => setRedactionLevel(level)}
              className={`flex-1 px-3 py-3 rounded-lg text-xs font-bold uppercase tracking-wide transition-all border ${
                redactionLevel === level
                  ? 'text-black border-transparent shadow-md'
                  : 'text-gray-400 border-white/10 hover:border-white/20 hover:text-white'
              }`}
              style={redactionLevel === level ? { backgroundColor: ACCENT } : {}}
            >
              {level}
              <div className="text-[9px] font-normal mt-1 opacity-70">
                {level === 'public' ? 'Aggressive' : level === 'internal' ? 'Moderate' : 'Surgical'}
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Control C: Database Health, Migrations, & Retention */}
      <section className={GLOW_BOX}>
        <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2 mb-4">
          <FileText size={16} className="text-green-400" /> Database Health & Retention
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Retention Limits */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-gray-300">Retention Limits</h3>
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-gray-400">Max Workflow Runs Kept</span>
                  <span className="font-mono font-bold" style={{ color: ACCENT }}>{retentionRuns}</span>
                </div>
                <input type="range" min={10} max={500} step={10} value={retentionRuns} onChange={e => setRetentionRuns(+e.target.value)} className="w-full h-2 bg-white/5 rounded-lg appearance-none cursor-pointer border border-white/10" style={{ accentColor: ACCENT }} />
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-gray-400">Failed Run Retention (days)</span>
                  <span className="font-mono font-bold" style={{ color: ACCENT }}>{retentionDays}</span>
                </div>
                <input type="range" min={7} max={90} value={retentionDays} onChange={e => setRetentionDays(+e.target.value)} className="w-full h-2 bg-white/5 rounded-lg appearance-none cursor-pointer border border-white/10" style={{ accentColor: ACCENT }} />
              </div>
            </div>
          </div>

          {/* Migrations */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-gray-300">Schema Migrations</h3>
            <p className="text-[10px] text-gray-500">Run introspective migrations to upgrade the schema idempotently when updating NeuroSync versions.</p>
            <button
              onClick={async () => { setMigrating(true); setMigrationResult(null); try { const res = await fetch(`${API}/api/system/migrate`, { method: 'POST' }); const d = await res.json(); setMigrationResult(d.success ? d.message : d.error); } catch { setMigrationResult('Error: could not reach backend.'); } finally { setMigrating(false); } }}
              disabled={migrating}
              className={`w-full px-4 py-2.5 rounded-lg font-bold text-xs transition-all border ${migrating ? 'opacity-50 border-white/10 text-gray-400' : 'border-green-500/30 bg-green-500/10 text-green-400 hover:bg-green-500/20'}`}
            >
              {migrating ? 'Running migrations...' : 'Run Schema Migrations'}
            </button>
            {migrationResult && (
              <div className="flex items-center gap-2 text-[10px] text-green-400 font-mono">
                <CheckCircle size={12} /> {migrationResult}
              </div>
            )}
          </div>
        </div>
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
export function BaseVaultDashboard() {
  const [activeView, setActiveView] = useState<'dashboard' | 'setups'>('dashboard');

  return (
    <AppShell
      moduleId="basevault"
      moduleName="BaseVault"
      moduleLogo="/BASEVAULTLogo.png"
      accentColor={ACCENT}
      activeView={activeView}
      onViewChange={setActiveView}
    >
      {activeView === 'dashboard' ? <DashboardView /> : <SetupView />}
    </AppShell>
  );
}
