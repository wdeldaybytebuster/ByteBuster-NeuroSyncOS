import React, { useState, useEffect } from 'react';
import App from '../App';

export function CoreExecDashboard() {
  const [activeWorkers, setActiveWorkers] = useState(0);
  const [maxWorkers, setMaxWorkers] = useState(0);
  const [queueDepth, setQueueDepth] = useState(0);
  const [liveThreads, setLiveThreads] = useState<{id: number, state: string}[]>([]);
  const [projectConstraint, setProjectConstraint] = useState(4);

  useEffect(() => {
    const sse = new EventSource('/api/system/metrics');
    sse.addEventListener('telemetry', (e) => {
      const data = JSON.parse(e.data);
      if (data.pool) {
        setActiveWorkers(data.pool.workerNodes || 0);
        setMaxWorkers(data.pool.maxSize || 0);
        setQueueDepth(data.pool.queuedTasks || 0);
        
        // Mocking the live thread states since poolifier doesn't expose thread-specific state easily without deeper inspection
        // We simulate based on busy vs idle
        const threads = [];
        for (let i = 0; i < data.pool.busyWorkerNodes; i++) {
          threads.push({ id: i + 1, state: 'BUSY' });
        }
        for (let i = 0; i < data.pool.idleWorkerNodes; i++) {
          threads.push({ id: data.pool.busyWorkerNodes + i + 1, state: 'IDLE' });
        }
        setLiveThreads(threads);
      }
      if (data.maxWorkersConfig) {
        // Only update local constraint if it hasn't been manually edited, or initialize it
        setProjectConstraint((prev) => prev === 4 ? data.maxWorkersConfig : prev);
      }
    });

    return () => sse.close();
  }, []);

  const handleApplyConstraint = async () => {
    try {
      const res = await fetch('/api/system/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxWorkers: projectConstraint })
      });
      if (res.ok) {
        alert('Constraint applied.');
      } else {
        alert('Failed to apply constraint.');
      }
    } catch (err) {
      alert('Error applying constraint.');
    }
  };
  return (
    <div className="relative w-full h-full text-[#E2E4E9] overflow-y-auto">
      {/* CoreExec Specific Background Grid */}
      <div className="absolute inset-0 z-0 pointer-events-none opacity-40" style={{
        backgroundImage: `
          radial-gradient(circle at 50% 0%, rgba(0, 229, 255, 0.15), transparent 50%),
          linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)
        `,
        backgroundSize: '100% 100%, 40px 40px, 40px 40px'
      }}></div>

      <div className="p-8 max-w-7xl mx-auto flex flex-col gap-10 animate-fade-in relative z-10 pb-24">
        
        <header className="border-b border-core-exec/20 pb-6">
          <h1 className="text-4xl font-heading font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-core-exec via-white to-gray-500 flex items-center gap-4">
            <img src="/COREEXECLogo.png" alt="CoreExec Logo" className="w-12 h-12 drop-shadow-glow-blue object-contain" />
            CoreExec Engine
          </h1>
          <p className="text-sm tracking-widest uppercase text-sterling-silver/60 font-mono mt-2">Deterministic Orchestration & Worker Pool</p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Main Workspace Column */}
          <div className="lg:col-span-2 flex flex-col gap-8">
            <div className="glass-enclave rounded-xl p-1 shadow-glow-blue transition-all hover:border-core-exec/30">
              <div className="bg-gunmetal/60 p-6 rounded-lg h-[400px]">
                <h3 className="font-heading font-bold text-lg text-white border-b border-white/10 pb-3">DAG Canvas</h3>
                <div className="h-full flex items-center justify-center text-gray-500 font-mono text-sm uppercase tracking-widest border border-dashed border-white/10 mt-4 rounded-lg bg-void/30">
                  DAG Visualization Node Disabled (Slim Mode)
                </div>
              </div>
            </div>

            {/* Task Execution Logs Bottom Panel */}
            <div className="glass-enclave rounded-xl p-1 shadow-xl transition-all border border-white/5 relative z-10 mt-2">
              <div className="bg-gunmetal/60 p-5 rounded-lg flex flex-col gap-4">
                <h3 className="font-heading font-bold text-white border-b border-white/10 pb-2 flex justify-between items-center text-sm uppercase tracking-widest">
                  Task Execution Drill-Down Logs
                  <button className="text-[10px] bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-1 rounded text-gray-300 transition-colors uppercase tracking-widest font-bold">Clear Logs</button>
                </h3>
                <div className="bg-void/80 font-mono text-xs text-gray-400 p-4 rounded h-40 overflow-y-auto custom-scrollbar border border-white/5 shadow-glass-inner">
                  <div className="text-report-green shadow-glow-cyan"><span className="text-gray-500">[14:22:01]</span> [Thread #1] SUCCESS - Evaluated ScopeLogic Intent: "Build Pipeline"</div>
                  <div className="text-core-exec"><span className="text-gray-500">[14:22:05]</span> [Thread #2] INFO - Fetching SQLite BaseVault mapping for "Pipeline"</div>
                  <div className="text-route-switch"><span className="text-gray-500">[14:22:12]</span> [Thread #3] PARKED - Awaiting user 2FA confirmation for LLM execution...</div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Control Column */}
          <div className="flex flex-col gap-8">
            
            {/* Worker Pool Status */}
            <div className="glass-enclave rounded-xl p-1 shadow-2xl transition-all border border-core-exec/10 hover:border-core-exec/30">
              <div className="bg-gunmetal/80 p-6 rounded-lg flex flex-col gap-5 h-full">
                <h3 className="font-heading font-bold text-lg text-core-exec border-b border-core-exec/20 pb-3 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-core-exec animate-pulse shadow-glow-blue"></div>
                  Pool Status
                </h3>
                
                <div className="flex justify-between items-center bg-void/50 p-4 rounded border border-white/5 shadow-glass-inner">
                  <span className="text-sterling-silver text-xs font-semibold uppercase tracking-widest">Active Workers</span>
                  <span className="font-mono text-xl text-core-exec">{activeWorkers} / {maxWorkers}</span>
                </div>
                
                <div className="flex justify-between items-center bg-void/50 p-4 rounded border border-white/5 shadow-glass-inner">
                  <span className="text-sterling-silver text-xs font-semibold uppercase tracking-widest">Queue Depth</span>
                  <span className={`font-mono text-xl ${queueDepth > 0 ? 'text-route-switch' : 'text-report-green'}`}>{queueDepth}</span>
                </div>
                
                {/* Live Threads */}
                <div className="mt-2 flex flex-col gap-2">
                  <h4 className="text-[10px] font-bold text-sterling-silver/50 uppercase tracking-widest border-b border-white/5 pb-1">Live Thread States</h4>
                  <div className="max-h-[150px] overflow-y-auto custom-scrollbar pr-2 flex flex-col gap-2 mt-2">
                    {liveThreads.length === 0 && <span className="text-gray-500 text-xs italic font-mono">No active threads</span>}
                    {liveThreads.map(t => (
                      <div key={t.id} className="bg-void/50 p-3 rounded flex justify-between items-center text-xs border border-white/5">
                        <span className="text-gray-300 font-mono">Thread_#{t.id}</span>
                        <span className={`px-2 py-1 rounded font-bold tracking-widest text-[10px] ${t.state === 'BUSY' ? 'bg-core-exec/20 text-core-exec shadow-[inset_0_0_10px_rgba(0,229,255,0.2)]' : 'bg-neural-blue/10 text-neural-blue'}`}>
                          {t.state}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Project Constraints */}
            <div className="glass-enclave rounded-xl p-1 shadow-2xl transition-all border border-white/5 hover:border-white/20">
              <div className="bg-gunmetal/60 p-6 rounded-lg flex flex-col gap-4">
                <h3 className="font-heading font-bold text-lg text-white border-b border-white/10 pb-3">Project Governor</h3>
                <div className="flex flex-col gap-3">
                  <label className="text-[10px] text-sterling-silver/70 font-bold uppercase tracking-widest">Max Allowed Workers</label>
                  <input 
                    type="number" 
                    value={projectConstraint} 
                    onChange={e => setProjectConstraint(Number(e.target.value))}
                    className="bg-void/50 border border-white/10 text-core-exec font-mono text-lg p-3 rounded outline-none focus:border-core-exec shadow-glass-inner" 
                  />
                </div>
                <button 
                  onClick={handleApplyConstraint}
                  className="w-full bg-core-exec/10 hover:bg-core-exec/30 border border-core-exec/30 text-core-exec py-3 rounded transition-all duration-300 text-xs uppercase tracking-widest font-bold mt-2 shadow-[0_0_15px_rgba(0,229,255,0.1)] hover:shadow-glow-blue"
                >
                  Apply Constraint
                </button>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
