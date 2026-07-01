import { useState } from 'react';
import { CheckCircle, XCircle } from 'lucide-react';

export interface DeferenceTask {
  id: string;
  description: string;
  confidence: number;
}

interface DeferenceUIProps {
  tasks: DeferenceTask[];
  accentColor: string;
  onApproveAll: (ids: string[]) => void | Promise<void>;
  onRejectAll: (ids: string[]) => void | Promise<void>;
}

// Deference UI — spec's "Pill Row": high-confidence (>=0.70) items get a
// quiet, non-blocking bulk-approve strip instead of a per-item modal row.
export function DeferenceUI({ tasks, accentColor, onApproveAll, onRejectAll }: DeferenceUIProps) {
  const [loading, setLoading] = useState(false);

  if (tasks.length === 0) return null;

  const handleApprove = async () => {
    setLoading(true);
    try {
      await onApproveAll(tasks.map((t) => t.id));
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async () => {
    setLoading(true);
    try {
      await onRejectAll(tasks.map((t) => t.id));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      role="region"
      aria-live="polite"
      aria-label="Pending Approvals"
      className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-black/70 border border-white/10 backdrop-blur-md px-6 py-3 rounded-full shadow-[0_0_25px_rgba(0,0,0,0.4)] z-50"
    >
      <div className="text-xs font-mono text-gray-300" id="deference-approval-count">
        <span className="font-bold" style={{ color: accentColor }}>{tasks.length}</span>{' '}
        high-confidence {tasks.length === 1 ? 'task' : 'tasks'} pending approval
      </div>

      <div className="flex gap-1.5" aria-describedby="deference-approval-count">
        <button
          onClick={handleReject}
          disabled={loading}
          aria-label={`Reject all ${tasks.length} pending tasks`}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold text-red-400 bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 transition-all disabled:opacity-50"
        >
          <XCircle size={13} aria-hidden="true" />
          Reject
        </button>
        <button
          onClick={handleApprove}
          disabled={loading}
          aria-label={`Approve all ${tasks.length} pending tasks`}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold text-green-400 bg-green-500/10 border border-green-500/30 hover:bg-green-500/20 transition-all disabled:opacity-50"
        >
          <CheckCircle size={13} aria-hidden="true" />
          Approve All
        </button>
      </div>
    </div>
  );
}
