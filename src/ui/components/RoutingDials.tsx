import React, { useState, useEffect } from 'react';

type Priority = 'Speed' | 'Cost' | 'Intelligence';

export function RoutingDials() {
  const [priority, setPriority] = useState<Priority>('Intelligence');
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  useEffect(() => {
    fetch('/api/system/settings')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.settings && data.settings.scoutlogic_priority) {
          setPriority(data.settings.scoutlogic_priority as Priority);
        }
      })
      .catch(console.error);
  }, []);

  const handleChange = async (newPriority: Priority) => {
    setPriority(newPriority);
    setLoading(true);
    setStatusMsg('');
    try {
      const res = await fetch('/api/system/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scoutlogic_priority: newPriority })
      });
      const data = await res.json();
      if (data.success) {
        setStatusMsg('✅ Priority updated');
      } else {
        setStatusMsg(`❌ Error: ${data.error}`);
      }
    } catch (err: any) {
      setStatusMsg(`❌ Failed: ${err.message}`);
    } finally {
      setLoading(false);
      setTimeout(() => setStatusMsg(''), 3000);
    }
  };

  const options: { label: Priority; icon: string; desc: string; color: string; gradient: string }[] = [
    { label: 'Speed', icon: '⚡', desc: 'Prioritize low latency and fast TPS', color: 'text-yellow-400', gradient: 'from-yellow-500/20 to-yellow-600/5' },
    { label: 'Cost', icon: '💰', desc: 'Prioritize cheap or local models', color: 'text-green-400', gradient: 'from-green-500/20 to-green-600/5' },
    { label: 'Intelligence', icon: '🧠', desc: 'Prioritize reasoning capabilities', color: 'text-purple-400', gradient: 'from-purple-500/20 to-purple-600/5' }
  ];

  return (
    <div className="flex flex-col gap-4 p-5 bg-gray-800/80 backdrop-blur-md rounded-xl border border-gray-700 shadow-2xl relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none"></div>
      <div className="relative z-10 flex flex-col gap-1">
        <div className="flex justify-between items-center">
          <h3 className="text-white font-bold text-lg flex items-center gap-2">
            <span className="text-blue-400">🎛️</span> ScoutLogic Routing Priority
          </h3>
          <span className="text-xs text-gray-400 h-4 font-semibold">{loading ? 'Saving...' : statusMsg}</span>
        </div>
        <p className="text-xs text-gray-400">
          Dynamically route tasks to models optimized for your selected priority.
        </p>
      </div>
      
      <div className="relative z-10 grid grid-cols-3 gap-3">
        {options.map((opt) => (
          <button
            key={opt.label}
            onClick={() => handleChange(opt.label)}
            className={`
              relative flex flex-col items-center p-4 rounded-lg border transition-all duration-300 ease-out group overflow-hidden
              ${priority === opt.label 
                ? 'border-blue-500/50 bg-gray-800 shadow-[0_0_15px_rgba(59,130,246,0.3)] scale-[1.02]' 
                : 'border-gray-700 bg-gray-900/50 hover:border-gray-600 hover:bg-gray-800 hover:scale-[1.02] opacity-70 hover:opacity-100'}
            `}
          >
            {priority === opt.label && (
              <div className={`absolute inset-0 bg-gradient-to-b ${opt.gradient} opacity-50`}></div>
            )}
            
            <div className="relative z-10 flex flex-col items-center gap-2">
              <span className={`text-2xl transition-transform duration-300 ${priority === opt.label ? 'scale-110 drop-shadow-md' : 'group-hover:scale-110'}`}>
                {opt.icon}
              </span>
              <span className={`text-sm font-bold tracking-wide ${priority === opt.label ? opt.color : 'text-gray-300'}`}>
                {opt.label}
              </span>
              <span className="text-[10px] text-gray-400 text-center leading-tight">
                {opt.desc}
              </span>
            </div>
            
            {priority === opt.label && (
              <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-blue-400 shadow-[0_0_8px_#60A5FA] animate-pulse"></div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
