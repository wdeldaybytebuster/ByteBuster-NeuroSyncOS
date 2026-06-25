import React, { useState, useEffect } from 'react';
import type { WorkflowRun } from '../../core/basevault/schema';

// §3.3 — Run derives from WorkflowRun so the UI locksteps the schema enum.
// Future enum extensions in src/core/basevault/schema.ts immediately surface
// here as TS errors instead of silently degrading to a `STATUS_ICONS[run.status]` fallback.
type Run = Pick<WorkflowRun, 'id' | 'status' | 'created_at'>;

interface RunHistoryProps {
  onSelectRun?: (runId: string) => void;
  activeRunId?: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  pending:   'var(--text-muted)',
  running:   'var(--accent)',
  completed: '#4ade80',
  failed:    '#f87171',
  // §3.3 — amber-warning. Distinct from 'failed' (#f87171 red) so blocked runs
  // read as awaiting attention rather than terminal failure.
  'blocked-by-validation': '#fbbf24',
};

const STATUS_ICONS: Record<string, string> = {
  pending:   '⏳',
  running:   '⚡',
  completed: '✅',
  failed:    '❌',
  // §3.3 — hard-stop sign, visually distinct from generic failure. The
  // NotificationCenter reads the same TODO_ESCALATED scout event so the
  // operator can resolve from either surface.
  'blocked-by-validation': '⛔',
};

function formatTime(epochMs: number): string {
  const d = new Date(epochMs);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function RunHistory({ onSelectRun, activeRunId }: RunHistoryProps) {
  const [runs, setRuns] = useState<Run[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchRuns = async () => {
      try {
        const res = await fetch('http://localhost:3743/api/basevault/runs');
        const data = await res.json();
        if (data.runs) setRuns(data.runs);
        setError(null);
      } catch {
        setError('Cannot reach backend');
      }
    };

    fetchRuns();
    const interval = setInterval(fetchRuns, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="glass-panel animate-fade-in" style={{
      padding: '16px',
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
      width: '260px',
      maxHeight: '380px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-main)', fontWeight: 700 }}>
          📋 Run History
        </h3>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', background: 'var(--bg-glass)', borderRadius: '12px', padding: '2px 8px' }}>
          {runs.length}
        </span>
      </div>

      {error && (
        <div style={{ fontSize: '0.75rem', color: '#f87171' }}>{error}</div>
      )}

      <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {runs.length === 0 && !error && (
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center', padding: '20px 0' }}>
            No runs yet. Approve a DAG to start.
          </div>
        )}
        {runs.map(run => {
          const isActive = activeRunId === run.id;
          return (
            <div
              key={run.id}
              onClick={() => onSelectRun?.(run.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelectRun?.(run.id); }}
              title={`Click to rehydrate run ${run.id.substring(0, 8)} onto canvas`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 10px',
                borderRadius: '8px',
                background: isActive ? 'rgba(212, 175, 55, 0.18)' : 'rgba(255,255,255,0.04)',
                border: isActive ? '1px solid var(--accent, #D4AF37)' : '1px solid rgba(255,255,255,0.06)',
                fontSize: '0.78rem',
                cursor: onSelectRun ? 'pointer' : 'default',
                transition: 'background 120ms ease, border-color 120ms ease',
              }}
              onMouseEnter={(e) => {
                if (onSelectRun) e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = isActive ? 'rgba(212, 175, 55, 0.18)' : 'rgba(255,255,255,0.04)';
              }}
            >
              <span style={{ fontSize: '1rem' }}>{STATUS_ICONS[run.status] || '❓'}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: STATUS_COLORS[run.status], fontWeight: 600 }}>
                  {run.status.toUpperCase()}
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', fontFamily: 'monospace' }}>
                  {run.id.substring(0, 8)}…
                </div>
              </div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', whiteSpace: 'nowrap' }}>
                {formatTime(run.created_at)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
