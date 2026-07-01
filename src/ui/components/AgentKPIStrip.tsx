import React, { useEffect, useState } from 'react';
import { Cpu, Zap, Layers, Users } from 'lucide-react';

const API = 'http://localhost:3743';

interface PoolMetrics {
  busyWorkerNodes?: number;
  idleWorkerNodes?: number;
  queuedTasks?: number;
  workerNodes?: number;
}

interface TelemetryFrame {
  utilization?: number;
  cores?: number;
  maxWorkersConfig?: number;
  pool?: PoolMetrics;
}

function Stat({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string | number; accent: string }) {
  return (
    <div className={`bg-void/50 rounded-lg p-4 border border-white/5 shadow-glass-inner flex-1 min-w-[140px] transition-all duration-300 hover:border-${accent}/40`}>
      <div className="flex items-center gap-2 text-[10px] tracking-widest uppercase font-semibold text-sterling-silver/60 mb-2">
        {icon}
        {label}
      </div>
      <div className={`font-mono text-2xl font-bold text-${accent} drop-shadow-glow-${accent.split('-').pop()}`}>
        {value}
      </div>
    </div>
  );
}

export function AgentKPIStrip() {
  const [frame, setFrame] = useState<TelemetryFrame | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const source = new EventSource(`${API}/api/system/metrics`);
    source.addEventListener('telemetry', (ev) => {
      try {
        const parsed: TelemetryFrame = JSON.parse((ev as MessageEvent).data);
        setFrame(parsed);
        setError(null);
      } catch (e: any) {
        setError(e?.message ?? 'parse error');
      }
    });
    source.onerror = () => {
      setError('SSE disconnected — retrying');
    };
    return () => {
      source.close();
    };
  }, []);

  const pool = frame?.pool ?? {};
  const active = pool.busyWorkerNodes ?? 0;
  const idle = pool.idleWorkerNodes ?? 0;
  const queued = pool.queuedTasks ?? 0;
  const max = frame?.maxWorkersConfig ?? 0;

  return (
    <div className="flex flex-wrap gap-3">
      <Stat icon={<Zap size={12} className="text-report-green" />} label="Active Agents" value={active} accent="report-green" />
      <Stat icon={<Cpu size={12} className="text-core-exec" />} label="Idle Agents" value={idle} accent="core-exec" />
      <Stat icon={<Layers size={12} className="text-route-switch" />} label="Queued Tasks" value={queued} accent="route-switch" />
      <Stat icon={<Users size={12} className="text-neural-blue" />} label="Max Workers" value={max} accent="neural-blue" />
      {error && (
        <div className="text-[10px] text-yellow-500/80 font-mono self-end pb-1">{error}</div>
      )}
    </div>
  );
}
