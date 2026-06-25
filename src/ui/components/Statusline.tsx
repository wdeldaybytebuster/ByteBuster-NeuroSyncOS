import React, { useState, useEffect } from 'react';
import { IntentPreview } from './IntentPreview';
import { Activity, ShieldAlert, Cpu } from 'lucide-react';

export function Statusline() {
  const [status, setStatus] = useState<'idle' | 'working' | 'warning'>('idle');
  const [logs, setLogs] = useState<any[]>([]);
  const [isIntentPreviewOpen, setIntentPreviewOpen] = useState(false);

  useEffect(() => {
    const sse = new EventSource('http://localhost:3743/api/scout/events');
    let timeout: ReturnType<typeof setTimeout>;

    sse.addEventListener('scout-update', (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'TASK_STATUS') {
          if (data.status === 'claimed') {
             setStatus('working');
          } else if (data.status === 'parked' || data.status === 'failed') {
             setStatus('warning');
          } else {
             setStatus('working'); // completed
          }

          setLogs(prev => {
             const newLogs = [...prev, data];
             if (newLogs.length > 50) newLogs.shift();
             return newLogs;
          });
          
          clearTimeout(timeout);
          timeout = setTimeout(() => {
            setStatus('idle');
          }, 4000);
        } else if (data.type === 'RUN_STATUS') {
          if (data.status === 'completed') {
             setStatus('idle');
          } else if (data.status === 'failed') {
             setStatus('warning');
          }
        }
      } catch (e) {
        console.error('Statusline SSE parsing error:', e);
      }
    });

    return () => {
      sse.close();
      clearTimeout(timeout);
    };
  }, []);

  const getStatusConfig = () => {
    switch (status) {
      case 'idle':
        return { color: 'text-gray-400', bg: 'bg-white/5', border: 'border-white/10', text: 'System Idle', icon: Cpu, pulse: false };
      case 'working':
        return { color: 'text-blue-400', bg: 'bg-blue-500/10 shadow-[0_0_15px_rgba(59,130,246,0.3)]', border: 'border-blue-500/30', text: 'Scout Active', icon: Activity, pulse: true };
      case 'warning':
        return { color: 'text-amber-400', bg: 'bg-amber-500/10 shadow-[0_0_15px_rgba(251,191,36,0.3)]', border: 'border-amber-500/30', text: 'Anomaly Detected', icon: ShieldAlert, pulse: true };
    }
  };

  const config = getStatusConfig();
  const Icon = config.icon;

  return (
    <>
      <div 
        onClick={() => setIntentPreviewOpen(true)}
        className={`flex items-center gap-3 px-4 py-1.5 rounded-full border cursor-pointer transition-all duration-500 hover:brightness-125 hover:bg-white/10 ${config.bg} ${config.border}`}
        title="View Decision Node Audit"
      >
        <Icon size={14} className={`${config.color} ${config.pulse ? 'animate-pulse' : ''}`} />
        <span className={`text-[11px] font-bold tracking-[0.15em] uppercase ${config.color}`}>
          {config.text}
        </span>
      </div>

      {isIntentPreviewOpen && (
        <IntentPreview 
          logs={logs} 
          onClose={() => setIntentPreviewOpen(false)} 
        />
      )}
    </>
  );
}
