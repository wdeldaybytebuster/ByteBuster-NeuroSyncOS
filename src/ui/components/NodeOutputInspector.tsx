import React, { useState, useEffect } from 'react';
import { X, RotateCcw, RefreshCw, Edit3 } from 'lucide-react';

interface NodeOutputInspectorProps {
  runId: string;
  nodeId: string;
  status: string;
  outputData: string | null;
  onClose: () => void;
  onRetryFailedNodes?: (runId: string) => void;
  onEditRerun?: (runId: string) => void;
  onRefresh?: () => Promise<void> | void;
}

/**
 * §1.3 — Inspector panel for a single DAG node's execution output.
 * Shows stdout/stderr payloads in tabs; offers Retry Failed Nodes
 * (escalates the run for re-execution) and Edit & Re-run (returns
 * to the chat stage so the user can amend prompts).
 */
export function NodeOutputInspector({
  runId,
  nodeId,
  status,
  outputData,
  onClose,
  onRetryFailedNodes,
  onEditRerun,
  onRefresh,
}: NodeOutputInspectorProps) {
  const [tab, setTab] = useState<'output' | 'metadata' | 'errors'>('output');
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    // Each fetch of run detail gives us a created_at / completed_at pair —
    // here we synthesize a placeholder duration if not provided in the
    // payload, so the inspector still has a useful "execution time" cell.
    if (outputData) {
      try {
        const parsed = JSON.parse(outputData);
        if (parsed && typeof parsed.durationMs === 'number') setElapsedMs(parsed.durationMs);
      } catch { /* not JSON; ignore */ }
    }
  }, [outputData]);

  const prettyJson = (() => {
    if (!outputData) return null;
    try {
      return JSON.stringify(JSON.parse(outputData), null, 2);
    } catch {
      return outputData;
    }
  })();

  const isFailed = status === 'failed' || status === 'parked' || status === 'error';

  return (
    <div
      role="dialog"
      aria-label="Node output inspector"
      style={{
        position: 'fixed',
        right: 16,
        bottom: 16,
        width: '460px',
        maxWidth: 'calc(100vw - 32px)',
        maxHeight: 'calc(100vh - 96px)',
        zIndex: 200,
        background: 'var(--bg-glass)',
        border: '1px solid var(--border-glass)',
        borderRadius: '12px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
      className="glass-panel animate-fade-in"
    >
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 14px', borderBottom: '1px solid var(--border-glass)',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <strong style={{ fontSize: '0.9rem', color: 'var(--text-main)' }}>
            🔍 Node Inspector
          </strong>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
            run: {runId.substring(0, 8)}… &nbsp; node: {nodeId.substring(0, 8)}…
          </span>
        </div>
        <button
          className="btn-icon"
          onClick={onClose}
          aria-label="Close inspector"
          title="Close"
        >
          <X size={16} />
        </button>
      </div>

      <div style={{ display: 'flex', gap: '4px', padding: '8px 14px 0' }}>
        {(['output', 'metadata', 'errors'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={tab === t ? 'btn-primary' : 'btn-secondary'}
            style={{ fontSize: '0.75rem', padding: '6px 10px' }}
          >
            {t}
          </button>
        ))}
      </div>

      <div style={{
        padding: '12px 14px',
        overflowY: 'auto',
        fontFamily: 'monospace',
        fontSize: '0.78rem',
        flex: 1,
      }}>
        {tab === 'output' && (
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'var(--text-main)' }}>
            {prettyJson ?? <em style={{ color: 'var(--text-muted)' }}>No output captured yet.</em>}
          </pre>
        )}

        {tab === 'metadata' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', color: 'var(--text-main)' }}>
            <div><strong>Status:</strong> <span style={{ color: status === 'completed' ? '#4ade80' : status === 'failed' ? '#f87171' : 'var(--accent)' }}>{status}</span></div>
            <div><strong>Execution time:</strong> {elapsedMs !== null ? `${elapsedMs} ms` : <em style={{ color: 'var(--text-muted)' }}>n/a (engine pre-Phase-7)</em>}</div>
            <div><strong>Run id:</strong> <code>{runId}</code></div>
            <div><strong>Node id:</strong> <code>{nodeId}</code></div>
          </div>
        )}

        {tab === 'errors' && (
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#f87171' }}>
            {isFailed ? (prettyJson ?? 'No error payload recorded.') : '✓ No errors.'}
          </pre>
        )}
      </div>

      <div style={{
        display: 'flex', gap: '8px', justifyContent: 'flex-end',
        padding: '10px 14px', borderTop: '1px solid var(--border-glass)',
      }}>
        {isFailed && onRetryFailedNodes && (
          <button
            className="btn-primary"
            onClick={() => onRetryFailedNodes(runId)}
            title="Re-enqueue any failed tasks in this run"
            style={{ fontSize: '0.78rem' }}
          >
            <RotateCcw size={14} style={{ marginRight: 6 }} /> Retry Failed Nodes
          </button>
        )}
        {onEditRerun && (
          <button
            className="btn-secondary"
            onClick={() => onEditRerun(runId)}
            title="Return to interview to amend prompts and re-approve"
            style={{ fontSize: '0.78rem' }}
          >
            <Edit3 size={14} style={{ marginRight: 6 }} /> Edit &amp; Re-run
          </button>
        )}
        <button
          className="btn-secondary"
          onClick={async () => {
            if (!onRefresh || refreshing) return;
            setRefreshing(true);
            try { await onRefresh(); } finally { setRefreshing(false); }
          }}
          disabled={!onRefresh || refreshing}
          title={onRefresh ? 'Refetch this task from the server' : 'No opener \u2014 open via canvas click'}
          style={{ fontSize: '0.78rem' }}
        >
          <RefreshCw size={14} style={{ marginRight: 6, animation: refreshing ? 'spin 1s linear infinite' : 'none' }} /> {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
    </div>
  );
}
