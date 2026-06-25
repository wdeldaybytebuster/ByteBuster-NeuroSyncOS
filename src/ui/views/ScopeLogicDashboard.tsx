import React, { useState } from 'react';

export function ScopeLogicDashboard() {
  const [interviewStatus, setInterviewStatus] = useState('Idle');

  return (
    <div className="relative w-full h-full text-[#E2E4E9] overflow-y-auto">
      {/* ScopeLogic Specific Background Grid */}
      <div className="absolute inset-0 z-0 pointer-events-none opacity-40" style={{
        backgroundImage: `
          radial-gradient(circle at 0% 0%, rgba(255, 64, 129, 0.15), transparent 50%),
          linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)
        `,
        backgroundSize: '100% 100%, 30px 30px, 30px 30px'
      }}></div>

      <div className="p-8 max-w-7xl mx-auto flex flex-col gap-10 animate-fade-in relative z-10 pb-24">
        <header className="border-b border-[#FF4081]/20 pb-6">
          <h1 className="text-4xl font-heading font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-[#FF4081] via-white to-gray-500 flex items-center gap-4">
            <img src="/SCOPELOGICLogo.png" alt="ScopeLogic Logo" className="w-12 h-12 object-contain drop-shadow-[0_0_15px_rgba(255,64,129,0.5)]" />
            ScopeLogic
          </h1>
          <p className="text-sm tracking-widest uppercase text-sterling-silver/60 font-mono mt-2">Research & Synthesis Engine | Requirements Gathering</p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          {/* Interview Console */}
          <div className="glass-enclave rounded-xl p-1 shadow-xl transition-all border border-white/5 hover:border-white/20 h-[500px]">
            <div className="bg-gunmetal/60 p-6 rounded-lg flex flex-col gap-4 h-full">
              <h3 className="font-heading font-bold text-lg text-white border-b border-white/10 pb-3 flex items-center justify-between">
                Interview Console
                <span className="text-[10px] font-mono tracking-widest px-2 py-1 bg-void/50 rounded border border-white/10">{interviewStatus}</span>
              </h3>
              <p className="text-[10px] uppercase tracking-widest text-sterling-silver/50 font-bold">
                Conducts iterative requirements gathering before DAG synthesis.
              </p>
              <div className="flex-1 bg-void/80 border border-white/5 rounded p-4 font-mono text-xs text-gray-400 overflow-y-auto shadow-glass-inner">
                <div className="text-center italic mt-10">Awaiting new project brief to initiate interview sequence...</div>
              </div>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  placeholder="Enter high-level objective..." 
                  className="flex-1 bg-void/50 border border-white/10 text-gray-200 font-mono text-sm rounded p-3 focus:outline-none focus:border-[#FF4081] shadow-glass-inner"
                />
                <button className="bg-[#FF4081]/10 hover:bg-[#FF4081]/30 border border-[#FF4081]/30 text-[#FF4081] px-6 rounded text-xs uppercase tracking-widest font-bold transition-all shadow-[0_0_15px_rgba(255,64,129,0.2)]">Start</button>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-8">
            {/* Draft DAG Proposal Surface */}
            <div className="glass-enclave rounded-xl p-1 shadow-xl transition-all border border-white/5 hover:border-white/20 h-[350px]">
              <div className="bg-gunmetal/60 p-6 rounded-lg flex flex-col gap-4 h-full">
                <h3 className="font-heading font-bold text-lg text-white border-b border-white/10 pb-3">Draft DAG Synthesis</h3>
                <p className="text-[10px] uppercase tracking-widest text-sterling-silver/50 font-bold mb-2">
                  Draft-only workflows waiting to be promoted to CoreExec.
                </p>
                <div className="flex-1 border border-dashed border-white/10 rounded flex items-center justify-center bg-void/30 text-gray-500 font-mono text-xs uppercase tracking-widest">
                  No Draft DAGs Available
                </div>
              </div>
            </div>
            
            {/* Hallucination Filter */}
            <div className="glass-enclave rounded-xl p-1 shadow-xl transition-all border border-white/5 hover:border-white/20">
              <div className="bg-gunmetal/60 p-6 rounded-lg flex flex-col gap-4">
                <h3 className="font-heading font-bold text-lg text-white border-b border-white/10 pb-3">Hallucination Filter Gate</h3>
                <div className="flex justify-between items-center text-xs font-mono border border-white/5 bg-void/50 p-4 rounded shadow-glass-inner">
                  <span className="text-gray-400">Strict Fact Verification</span>
                  <span className="text-report-green shadow-glow-cyan font-bold tracking-widest">ENFORCED</span>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
