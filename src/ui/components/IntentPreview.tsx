import React from 'react';
import { X, CheckCircle, AlertTriangle, Clock, Layers } from 'lucide-react';

export function IntentPreview({ logs, onClose }: { logs: any[], onClose: () => void }) {
  // Aggregate logs into a unique list of tasks to show the DAG history (Test-Fix-Retest steps).
  const tasks = new Map();
  logs.forEach(l => {
    if (l.type === 'TASK_STATUS') {
       tasks.set(l.taskId, l);
    }
  });

  const taskList = Array.from(tasks.values());

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-900/80 backdrop-blur-md animate-fade-in">
      <div className="glass-panel w-full max-w-3xl max-h-[85vh] flex flex-col p-6 rounded-xl border border-[var(--color-glass-border)] shadow-2xl relative overflow-hidden" style={{
        background: 'var(--color-gunmetal)',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
      }}>
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--color-glass-border)] pb-4 mb-4">
          <div className="flex items-center gap-3">
            <Layers className="text-core-exec" size={24} />
            <h2 className="text-xl font-bold text-gray-100">Intent Execution Plan</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-100 transition-colors bg-gray-800 hover:bg-gray-700 rounded-full p-1.5">
            <X size={18} />
          </button>
        </div>
        
        {/* Body */}
        <div className="overflow-y-auto flex-1 custom-scrollbar">
          {taskList.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-gray-500 gap-3">
              <Clock size={32} className="opacity-50" />
              <span className="text-sm italic tracking-widest uppercase">No active decision nodes.</span>
            </div>
          ) : (
            <div className="flex flex-col gap-6 relative">
               {/* Vertical Tree Line */}
               <div className="absolute left-[19px] top-4 bottom-4 w-[2px] bg-gradient-to-b from-white/20 via-white/10 to-transparent" />
               
               {taskList.map((task, i) => (
                 <div key={i} className="flex gap-5 relative z-10 group">
                   <div className={`mt-1 bg-gunmetal rounded-full p-1.5 border shadow-lg transition-transform group-hover:scale-110 ${task.status === 'completed' ? 'border-green-500/50 text-green-400 shadow-green-500/20' : task.status === 'parked' ? 'border-amber-500/50 text-amber-400 shadow-amber-500/20' : 'border-blue-500/50 text-blue-400 animate-pulse shadow-blue-500/20'}`}>
                     {task.status === 'completed' ? <CheckCircle size={18} /> : task.status === 'parked' || task.status === 'failed' ? <AlertTriangle size={18} /> : <Clock size={18} />}
                   </div>
                   
                   <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex-1 flex flex-col gap-1.5 backdrop-blur-sm transition-all hover:bg-white/10">
                      <div className="flex justify-between items-center">
                        <div className="text-sm font-mono text-gray-200 font-bold">{task.taskId}</div>
                        <div className={`text-[10px] uppercase tracking-widest font-bold px-2 py-0.5 rounded-full ${task.status === 'completed' ? 'bg-green-500/10 text-green-400' : task.status === 'parked' ? 'bg-amber-500/10 text-amber-400' : 'bg-blue-500/10 text-blue-400'}`}>
                          {task.status}
                        </div>
                      </div>
                      
                      {task.output && (
                        <div className="text-xs text-gray-400 mt-2 p-2 bg-black/30 rounded border border-white/5 font-mono overflow-x-auto">
                          {typeof task.output === 'object' ? JSON.stringify(task.output) : task.output}
                        </div>
                      )}
                      
                      {task.error && (
                        <div className="text-xs text-red-400 mt-2 p-2 bg-red-500/10 rounded border border-red-500/20 font-mono">
                          {task.error}
                        </div>
                      )}
                   </div>
                 </div>
               ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
