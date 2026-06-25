import React, { useEffect, useState, useCallback } from 'react';
import { Clock, RefreshCw } from 'lucide-react';

interface ScheduleJob {
  id: string;
  name: string;
  cron: string;
  nextTick: number | null;
}

interface ScheduleResponse {
  success: boolean;
  count?: number;
  now?: number;
  jobs: ScheduleJob[];
  error?: string;
}

function msCountdown(target: number, now: number): string {
  const delta = target - now;
  if (delta <= 0) return 'now';
  const sec = Math.floor(delta / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ${sec % 60}s`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ${min % 60}m`;
  const day = Math.floor(hr / 24);
  return `${day}d ${hr % 24}h`;
}

function formatTick(ts: number | null): string {
  if (ts == null) return '—';
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return '—';
  }
}

export function CronSummary() {
  const [data, setData] = useState<ScheduleResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0); // force countdown re-render every second

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch('/api/scheduler/jobs');
      const json: ScheduleResponse = await res.json();
      setData(json);
    } catch (e) {
      setData({ success: false, jobs: [], error: 'fetch failed' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // Tick is read just to satisfy the linter & force re-renders; countdown uses data?.now.
  void tick;

  const now = data?.now ?? Date.now();
  const jobs = data?.jobs ?? [];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2 text-[10px] tracking-widest uppercase font-semibold text-sterling-silver/60">
          <Clock size={12} className="text-route-switch" />
          Scheduled Workflows ({jobs.length})
        </div>
        <button
          onClick={fetchJobs}
          disabled={loading}
          className="text-[10px] px-2 py-1 rounded border border-route-switch/30 text-route-switch hover:bg-route-switch/10 disabled:opacity-50 transition-all flex items-center gap-1"
        >
          <RefreshCw size={10} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {loading && <div className="text-xs text-gray-500 font-mono">Loading schedules…</div>}

      {!loading && jobs.length === 0 && (
        <div className="text-xs text-gray-500 font-mono bg-void/40 rounded p-3 border border-white/5">
          No workflows with cron_schedule set.
        </div>
      )}

      <ul className="flex flex-col gap-2 max-h-[200px] overflow-y-auto pr-1 custom-scrollbar">
        {jobs.map((job) => (
          <li key={job.id} className="bg-void/40 rounded-md p-3 border border-white/5 hover:border-route-switch/30 transition-all">
            <div className="flex justify-between items-start gap-2">
              <div className="flex-1 min-w-0">
                <div className="text-sm text-white font-semibold truncate">{job.name}</div>
                <div className="text-[10px] text-sterling-silver/60 font-mono mt-0.5 break-all">{job.cron}</div>
              </div>
              <div className="text-right text-[10px] font-mono whitespace-nowrap">
                <div className="text-route-switch">{msCountdown(job.nextTick ?? 0, now)}</div>
                <div className="text-gray-500 mt-0.5">{formatTick(job.nextTick)}</div>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
