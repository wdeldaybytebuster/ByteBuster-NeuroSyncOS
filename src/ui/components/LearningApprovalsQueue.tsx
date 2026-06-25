import React, { useState, useEffect } from 'react';
import { Check, X, Database } from 'lucide-react';

interface ApprovalItem {
  id: string;
  fact: string;
  confidence: number;
  status: string;
  source_run_id: string;
  created_at: number;
}

export function LearningApprovalsQueue() {
  const [queue, setQueue] = useState<ApprovalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchQueue = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/cerebro/learning-approvals');
      const data = await res.json();
      if (data.success) {
        setQueue(data.queue);
      } else {
        setError(data.error);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQueue();
    // Poll every 10 seconds for new learnings
    const interval = setInterval(fetchQueue, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleApprove = async (id: string) => {
    try {
      await fetch(`/api/cerebro/learning-approvals/${id}/approve`, { method: 'POST' });
      setQueue(prev => prev.filter(item => item.id !== id));
    } catch (err) {
      console.error('Failed to approve', err);
    }
  };

  const handleReject = async (id: string) => {
    try {
      await fetch(`/api/cerebro/learning-approvals/${id}/reject`, { method: 'POST' });
      setQueue(prev => prev.filter(item => item.id !== id));
    } catch (err) {
      console.error('Failed to reject', err);
    }
  };

  if (loading && queue.length === 0) {
    return <div className="text-sterling-silver/50 text-sm animate-pulse">Loading approvals queue...</div>;
  }

  if (error) {
    return <div className="text-red-500 text-sm">Error loading queue: {error}</div>;
  }

  if (queue.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-sterling-silver/30 border border-dashed border-sterling-silver/10 rounded-lg p-6">
        <Database size={32} className="mb-3 opacity-20" />
        <span className="text-xs uppercase tracking-widest font-bold">Queue is empty</span>
        <span className="text-[10px] mt-2 max-w-[200px] text-center">No new facts pending confirmation.</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 max-h-[300px] overflow-y-auto custom-scrollbar pr-2">
      {queue.map(item => (
        <div key={item.id} className="bg-void/80 border border-white/5 rounded p-4 flex flex-col gap-3 shadow-glass-inner">
          <div className="flex justify-between items-start gap-4">
            <p className="text-sm text-gray-200 flex-1 leading-relaxed">
              "{item.fact}"
            </p>
            <div className="flex items-center gap-2">
              <span className={`text-[10px] font-mono font-bold px-2 py-1 rounded ${item.confidence < 0.5 ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20' : 'bg-neural-blue/10 text-neural-blue border border-neural-blue/20'}`}>
                Conf: {item.confidence.toFixed(2)}
              </span>
            </div>
          </div>
          
          <div className="flex justify-end gap-2 mt-2 pt-2 border-t border-white/5">
            <button 
              onClick={() => handleReject(item.id)}
              className="text-xs flex items-center gap-1 text-gray-400 hover:text-red-400 transition-colors px-3 py-1.5"
            >
              <X size={14} /> Reject
            </button>
            <button 
              onClick={() => handleApprove(item.id)}
              className="text-xs flex items-center gap-1 bg-neural-blue/20 hover:bg-neural-blue/30 text-neural-blue border border-neural-blue/30 rounded transition-colors px-3 py-1.5 font-bold tracking-wide"
            >
              <Check size={14} /> Approve Fact
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
