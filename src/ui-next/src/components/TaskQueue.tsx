'use client';

import { useState, useEffect } from 'react';
import DeferenceUI, { DeferenceTask } from './DeferenceUI';

export default function TaskQueue() {
  const [tasks, setTasks] = useState<DeferenceTask[]>([]);

  useEffect(() => {
    const eventSource = new EventSource('/api/scout/events');
    
    eventSource.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'new_task') {
          setTasks(prev => [...prev, data.task]);
        } else if (data.type === 'remove_task') {
          setTasks(prev => prev.filter(t => t.id !== data.taskId));
        } else if (data.type === 'sync_tasks') {
          setTasks(data.tasks);
        }
      } catch (err) {
        console.error('Failed to parse SSE data', err);
      }
    };

    return () => {
      eventSource.close();
    };
  }, []);

  const handleApproveAll = async (ids: string[]) => {
    try {
      await fetch('/api/scout/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids })
      });
      setTasks(prev => prev.filter(t => !ids.includes(t.id)));
    } catch (err) {
      console.error('Failed to approve tasks', err);
    }
  };

  const handleRejectAll = async (ids: string[]) => {
    try {
      await fetch('/api/scout/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids })
      });
      setTasks(prev => prev.filter(t => !ids.includes(t.id)));
    } catch (err) {
      console.error('Failed to reject tasks', err);
    }
  };

  return (
    <>
      <div className="glass-enclave rounded-2xl p-6">
        <h3 className="text-lg font-heading font-semibold mb-4">Task Queue (Live)</h3>
        {tasks.length === 0 ? (
          <p className="opacity-50 italic text-sm">No pending tasks...</p>
        ) : (
          <ul className="space-y-3">
            {tasks.map((t) => (
              <li key={t.id} className="flex justify-between items-center bg-[var(--bg-dots)] p-4 rounded-xl border border-[var(--color-glass-border)] dynamic-interactive">
                <span className="text-sm opacity-90">{t.description}</span>
                <span className="text-xs font-mono text-[var(--color-report-green)]">{t.confidence}%</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <DeferenceUI 
        tasks={tasks} 
        onApproveAll={handleApproveAll} 
        onRejectAll={handleRejectAll} 
      />
    </>
  );
}
