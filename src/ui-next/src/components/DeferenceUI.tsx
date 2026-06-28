'use client';

import { useState } from 'react';
import { CheckCircle, XCircle } from 'lucide-react';

export interface DeferenceTask {
  id: string;
  description: string;
  confidence: number;
}

interface DeferenceUIProps {
  tasks: DeferenceTask[];
  onApproveAll: (ids: string[]) => void;
  onRejectAll: (ids: string[]) => void;
}

export default function DeferenceUI({ tasks, onApproveAll, onRejectAll }: DeferenceUIProps) {
  const [loading, setLoading] = useState(false);

  if (tasks.length === 0) return null;

  const handleApprove = async () => {
    setLoading(true);
    await onApproveAll(tasks.map((t) => t.id));
    setLoading(false);
  };

  const handleReject = async () => {
    setLoading(true);
    await onRejectAll(tasks.map((t) => t.id));
    setLoading(false);
  };

  return (
    <div 
      role="region" 
      aria-live="polite" 
      aria-label="Pending Approvals"
      className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-4 glass-enclave px-6 py-3 rounded-full shadow-2xl z-50 dynamic-interactive"
    >
      <div className="text-sm font-medium opacity-80" id="approval-count">
        <span className="font-bold text-[var(--color-sovereign-gold)]">{tasks.length}</span> high-confidence {tasks.length === 1 ? 'task' : 'tasks'} pending approval
      </div>
      
      <div className="flex gap-2 ml-4" aria-describedby="approval-count">
        <button
          onClick={handleReject}
          disabled={loading}
          aria-label={`Reject all ${tasks.length} pending tasks`}
          className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 transition-colors disabled:opacity-50"
        >
          <XCircle size={16} aria-hidden="true" />
          Reject
        </button>
        <button
          onClick={handleApprove}
          disabled={loading}
          aria-label={`Approve all ${tasks.length} pending tasks`}
          className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold text-[var(--color-report-green)] bg-[var(--color-report-green)]/10 hover:bg-[var(--color-report-green)]/20 transition-colors disabled:opacity-50"
        >
          <CheckCircle size={16} aria-hidden="true" />
          Approve All
        </button>
      </div>
    </div>
  );
}
