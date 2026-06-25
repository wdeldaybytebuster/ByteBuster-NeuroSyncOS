import React, { useEffect, useState } from 'react';
import { BrainCircuit, Database, Activity } from 'lucide-react';

interface HealthResponse {
  success: boolean;
  vectorCount?: number;
  lastReflection?: number | null;
  status?: 'cold' | 'nominal' | 'stale' | 'warning';
  now?: number;
  error?: string;
}

const STATUS_COLOR: Record<NonNullable<HealthResponse['status']>, string> = {
  cold: 'neural-blue',
  nominal: 'report-green',
  stale: 'route-switch',
  warning: 'red-400',
};

const STATUS_ACCENT_BG: Record<NonNullable<HealthResponse['status']>, string> = {
  cold: 'bg-neural-blue/10 text-neural-blue border-neural-blue/30',
  nominal: 'bg-report-green/10 text-report-green border-report-green/30',
  stale: 'bg-route-switch/10 text-route-switch border-route-switch/30',
  warning: 'bg-red-400/10 text-red-400 border-red-400/30',
};

function formatLast(ts: number | null | undefined): string {
  if (ts == null) return 'never';
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return '—';
  }
}

export function CerebroHealthWidget() {
  const [data, setData] = useState<HealthResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch('/api/cerebro/health');
        const json: HealthResponse = await res.json();
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) setData({ success: false, error: 'fetch failed' });
      }
    };
    poll();
    const id = setInterval(poll, 10000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const status = data?.status ?? 'cold';
  const color = STATUS_COLOR[status];
  const accent = STATUS_ACCENT_BG[status];
  const vectorCount = data?.vectorCount ?? 0;
  const lastReflection = data?.lastReflection ?? null;

  return (
    <div className={`flex flex-col gap-3 rounded-lg p-4 border ${accent} bg-void/40`}>
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2 text-[10px] tracking-widest uppercase font-bold">
          <BrainCircuit size={14} />
          Cerebro Memory Health
        </div>
        <span className={`text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 rounded border ${accent}`}>
          {status}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 mt-1">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-widest text-sterling-silver/60 flex items-center gap-1">
            <Database size={10} /> Vector Count
          </span>
          <span className={`font-mono text-xl font-bold text-${color}`}>{vectorCount}</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-widest text-sterling-silver/60 flex items-center gap-1">
            <Activity size={10} /> Last Reflection
          </span>
          <span className={`font-mono text-sm text-${color}`}>{formatLast(lastReflection)}</span>
        </div>
      </div>

      {data?.error && (
        <div className="text-[10px] text-red-400/80 font-mono">⚠ {data.error}</div>
      )}
    </div>
  );
}
