import React, { useState, useEffect, useCallback } from 'react';
import { Database, RefreshCw, CheckCircle, AlertTriangle, XCircle, FileText, Folder } from 'lucide-react';

const API = 'http://localhost:3743';

interface IndexedFile {
  id: string;
  relativePath: string;
  confidence: number;
  type: string;
  title: string | null;
}

interface OKFStatus {
  success: boolean;
  projectId: string;
  folderPath: string;
  folderExists: boolean;
  diskFiles: string[];
  indexedFiles: IndexedFile[];
  isSynced: boolean;
  drift: { unindexed: string[]; orphaned: IndexedFile[] };
  counts: { disk: number; indexed: number; unindexed: number; orphaned: number };
  error?: string;
}

interface OKFWorkspaceWidgetProps {
  projectId: string | null;
  accentColor?: string;
}

const GLOW_BOX = `bg-white/[0.02] border border-white/5 rounded-xl p-5 backdrop-blur-sm transition-all duration-300 shadow-[0_0_15px_rgba(0,255,204,0.08)] hover:shadow-[0_0_30px_rgba(0,255,204,0.2)] hover:border-[rgba(0,255,204,0.25)]`;

export function OKFWorkspaceWidget({ projectId, accentColor = '#00FFCC' }: OKFWorkspaceWidgetProps) {
  const [status, setStatus] = useState<OKFStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scannedDocs, setScannedDocs] = useState<{relativePath:string;extension:string;sizeKB:string;isProcessed:boolean}[]>([]);
  const [scanning, setScanning] = useState(false);
  const [converting, setConverting] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    if (!projectId) { setStatus(null); setError(null); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/api/okf/status?projectId=${encodeURIComponent(projectId)}`);
      const data = await res.json();
      if (data.success) {
        setStatus(data);
      } else {
        setError(data.error || 'Failed to fetch OKF status');
        setStatus(null);
      }
    } catch {
      setError('Network error — could not reach backend.');
      setStatus(null);
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const scanProject = useCallback(async () => {
    if (!projectId) return;
    setScanning(true);
    try {
      const res = await fetch(`${API}/api/okf/scan-project`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });
      const data = await res.json();
      if (data.success) {
        setScannedDocs([...data.unprocessed, ...data.processed]);
      }
    } catch {}
    setScanning(false);
  }, [projectId]);

  useEffect(() => {
    scanProject();
  }, [scanProject]);

  const handleConvert = async (filePath: string) => {
    if (!projectId) return;
    setConverting(filePath);
    try {
      const res = await fetch(`${API}/api/okf/convert-document`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, filePath }),
      });
      const data = await res.json();
      if (data.success) {
        // Mark as processed locally
        setScannedDocs(prev => prev.map(d => d.relativePath === filePath ? { ...d, isProcessed: true } : d));
        // Refresh OKF status
        await fetchStatus();
      } else {
        setError(data.error || 'Conversion failed');
      }
    } catch {
      setError('Network error during conversion.');
    }
    setConverting(null);
  };

  const handleSync = async () => {
    if (!projectId) return;
    setSyncing(true);
    try {
      const res = await fetch(`${API}/api/okf/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || 'Sync failed');
      }
    } catch {
      setError('Network error during sync.');
    }
    setSyncing(false);
    // Refresh status after sync
    await fetchStatus();
  };

  // No project selected state
  if (!projectId) {
    return (
      <section className={GLOW_BOX}>
        <div className="flex items-center gap-2 mb-3">
          <Database size={16} style={{ color: accentColor }} />
          <h2 className="text-sm font-bold text-white uppercase tracking-wider">OKF Workspace</h2>
        </div>
        <div className="text-xs text-gray-500 text-center py-6 border border-dashed border-white/10 rounded-lg">
          Select a project from the Right Bar to view its OKF workspace health.
        </div>
      </section>
    );
  }

  // Loading state
  if (loading && !status) {
    return (
      <section className={GLOW_BOX}>
        <div className="flex items-center gap-2 mb-3">
          <Database size={16} style={{ color: accentColor }} />
          <h2 className="text-sm font-bold text-white uppercase tracking-wider">OKF Workspace</h2>
        </div>
        <div className="text-xs text-gray-500 text-center py-6 font-mono">Loading workspace status...</div>
      </section>
    );
  }

  // Error / no OKF folder state
  if (error || (status && !status.folderExists)) {
    return (
      <section className={GLOW_BOX}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Database size={16} style={{ color: accentColor }} />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">OKF Workspace</h2>
          </div>
          <span className="text-[9px] font-mono font-bold uppercase px-2 py-0.5 rounded border border-red-500/30 bg-red-500/10 text-red-400">No OKF Folder</span>
        </div>
        <div className="flex items-center gap-3 p-4 rounded-lg bg-red-500/5 border border-red-500/20">
          <XCircle size={16} className="text-red-400 shrink-0" />
          <div>
            <div className="text-xs font-bold text-red-400">No OKF Folder Found</div>
            <div className="text-[10px] text-gray-500 mt-0.5">
              {error || 'The .neurosync/project_okf/ directory does not exist. Trigger a sync to create it, or ensure the project has a root path configured.'}
            </div>
          </div>
        </div>
        <button onClick={handleSync} disabled={syncing} className="mt-3 w-full px-4 py-2 rounded-lg border border-white/10 bg-white/5 text-xs font-bold text-gray-300 hover:bg-white/10 hover:text-white transition-all disabled:opacity-50 flex items-center justify-center gap-2">
          <RefreshCw size={12} className={syncing ? 'animate-spin' : ''} />
          {syncing ? 'Initializing...' : 'Initialize OKF Workspace'}
        </button>
      </section>
    );
  }

  if (!status) return null;

  // Determine status badge
  const statusBadge = status.isSynced
    ? { label: 'Synced', color: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/30' }
    : status.counts.unindexed > 0
      ? { label: 'Drift Detected', color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30' }
      : { label: 'Unindexed', color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/30' };

  return (
    <section className={GLOW_BOX}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Database size={16} style={{ color: accentColor }} />
          <h2 className="text-sm font-bold text-white uppercase tracking-wider">OKF Workspace</h2>
        </div>
        <span className={`text-[9px] font-mono font-bold uppercase px-2 py-0.5 rounded border ${statusBadge.bg} ${statusBadge.border} ${statusBadge.color}`}>
          {statusBadge.label}
        </span>
      </div>

      {/* Folder path */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-black/30 border border-white/5 mb-4">
        <Folder size={12} className="text-amber-400 shrink-0" />
        <span className="text-[10px] font-mono text-gray-400 truncate">{status.folderPath}</span>
      </div>

      {/* Counts strip */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        <div className="bg-black/30 border border-white/5 rounded-lg p-2 text-center">
          <div className="text-[9px] text-gray-500 uppercase font-mono">Disk</div>
          <div className="text-sm font-bold font-mono" style={{ color: accentColor }}>{status.counts.disk}</div>
        </div>
        <div className="bg-black/30 border border-white/5 rounded-lg p-2 text-center">
          <div className="text-[9px] text-gray-500 uppercase font-mono">Indexed</div>
          <div className="text-sm font-bold font-mono text-green-400">{status.counts.indexed}</div>
        </div>
        <div className="bg-black/30 border border-white/5 rounded-lg p-2 text-center">
          <div className="text-[9px] text-gray-500 uppercase font-mono">Unindexed</div>
          <div className="text-sm font-bold font-mono text-amber-400">{status.counts.unindexed}</div>
        </div>
        <div className="bg-black/30 border border-white/5 rounded-lg p-2 text-center">
          <div className="text-[9px] text-gray-500 uppercase font-mono">Orphaned</div>
          <div className="text-sm font-bold font-mono text-red-400">{status.counts.orphaned}</div>
        </div>
      </div>

      {/* Split view: Disk vs Indexed */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        {/* Disk Documents */}
        <div className="bg-black/20 border border-white/5 rounded-lg p-3">
          <div className="text-[9px] font-mono text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-1">
            <FileText size={10} /> Raw/Disk ({status.diskFiles.length})
          </div>
          <div className="space-y-1 max-h-[140px] overflow-y-auto">
            {status.diskFiles.length === 0 ? (
              <div className="text-[10px] text-gray-600 text-center py-3">No files</div>
            ) : (
              status.diskFiles.map((f, i) => {
                const isIndexed = status.indexedFiles.some(idx => idx.relativePath === f);
                return (
                  <div key={i} className="flex items-center gap-2 px-2 py-1 rounded bg-white/[0.02]">
                    <span className={`w-1.5 h-1.5 rounded-full ${isIndexed ? 'bg-green-400' : 'bg-amber-400'}`} style={{ boxShadow: isIndexed ? '0 0 4px #22c55e' : '0 0 4px #fbbf24' }}></span>
                    <span className="text-[10px] font-mono text-gray-300 truncate">{f}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Indexed Nodes */}
        <div className="bg-black/20 border border-white/5 rounded-lg p-3">
          <div className="text-[9px] font-mono text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-1">
            <Database size={10} /> Indexed ({status.indexedFiles.length})
          </div>
          <div className="space-y-1 max-h-[140px] overflow-y-auto">
            {status.indexedFiles.length === 0 ? (
              <div className="text-[10px] text-gray-600 text-center py-3">No indexed nodes</div>
            ) : (
              status.indexedFiles.map((f, i) => (
                <div key={i} className="flex items-center gap-2 px-2 py-1 rounded bg-white/[0.02]">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400" style={{ boxShadow: '0 0 4px #22c55e' }}></span>
                  <span className="text-[10px] font-mono text-gray-300 truncate flex-1">{f.title || f.relativePath}</span>
                  <span className="text-[8px] font-mono text-gray-600">{f.confidence.toFixed(2)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Project Documentation Discovery */}
      <div className="bg-black/20 border border-white/5 rounded-lg p-3 mb-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[9px] font-mono text-gray-500 uppercase tracking-widest flex items-center gap-1">
            <FileText size={10} /> Project Documents ({scannedDocs.filter(d => !d.isProcessed).length} unprocessed)
          </div>
          <button onClick={scanProject} disabled={scanning} className="text-[9px] font-bold text-gray-400 hover:text-white transition-colors">
            {scanning ? 'Scanning...' : 'Rescan'}
          </button>
        </div>

        {scannedDocs.length === 0 ? (
          <div className="text-[10px] text-gray-600 text-center py-3">
            {scanning ? 'Scanning project tree for documentation...' : 'No documentation files found in project tree.'}
          </div>
        ) : (
          <div className="space-y-1 max-h-[180px] overflow-y-auto">
            {scannedDocs.filter(d => !d.isProcessed).map((doc, i) => (
              <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded bg-white/[0.02] group">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" style={{ boxShadow: '0 0 4px #fbbf24' }}></span>
                <span className="text-[10px] font-mono text-gray-300 truncate flex-1">{doc.relativePath}</span>
                <span className="text-[8px] font-mono text-gray-600">{doc.sizeKB}KB</span>
                <button
                  onClick={() => handleConvert(doc.relativePath)}
                  disabled={converting === doc.relativePath}
                  className="opacity-0 group-hover:opacity-100 px-2 py-0.5 rounded text-[8px] font-bold bg-teal-500/10 border border-teal-500/30 text-teal-400 hover:bg-teal-500/20 transition-all disabled:opacity-50"
                >
                  {converting === doc.relativePath ? '...' : 'Convert'}
                </button>
              </div>
            ))}
            {scannedDocs.filter(d => d.isProcessed).length > 0 && (
              <details className="mt-2">
                <summary className="text-[9px] text-gray-600 cursor-pointer hover:text-gray-400">
                  {scannedDocs.filter(d => d.isProcessed).length} already processed
                </summary>
                <div className="mt-1 space-y-1">
                  {scannedDocs.filter(d => d.isProcessed).map((doc, i) => (
                    <div key={i} className="flex items-center gap-2 px-2 py-1 rounded bg-white/[0.01]">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-400" style={{ boxShadow: '0 0 4px #22c55e' }}></span>
                      <span className="text-[10px] font-mono text-gray-500 truncate">{doc.relativePath}</span>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        )}
      </div>

      {/* Sync button */}
      <button onClick={handleSync} disabled={syncing} className="w-full px-4 py-2.5 rounded-lg font-bold text-xs transition-all flex items-center justify-center gap-2 disabled:opacity-50"
        style={{ backgroundColor: syncing ? 'transparent' : accentColor, color: syncing ? accentColor : 'black', border: syncing ? `1px solid ${accentColor}40` : 'none' }}>
        <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
        {syncing ? 'Syncing OKF Index...' : 'Trigger OKF Conversion & Sync'}
      </button>
    </section>
  );
}
