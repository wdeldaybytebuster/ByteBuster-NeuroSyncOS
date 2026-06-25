import React, { useState } from 'react';

export function ScoutDaemonDashboard() {
  const [quarantineItems, setQuarantineItems] = useState([]);

  return (
    <div className="relative w-full h-full text-[#E2E4E9] overflow-y-auto">
      {/* ScoutDaemon Specific Background Grid */}
      <div className="absolute inset-0 z-0 pointer-events-none opacity-40" style={{
        backgroundImage: `
          radial-gradient(circle at 50% 50%, rgba(0, 200, 83, 0.1), transparent 60%),
          linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)
        `,
        backgroundSize: '100% 100%, 40px 40px, 40px 40px'
      }}></div>

      <div className="p-8 max-w-7xl mx-auto flex flex-col gap-10 animate-fade-in relative z-10 pb-24">
        <header className="border-b border-[#00C853]/20 pb-6">
          <h1 className="text-4xl font-heading font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-[#00C853] via-white to-gray-500 flex items-center gap-4">
            <img src="/SCOUTDAEMONLogo.png" alt="ScoutDaemon Logo" className="w-12 h-12 object-contain drop-shadow-[0_0_15px_rgba(0,200,83,0.5)]" />
            ScoutDaemon
          </h1>
          <p className="text-sm tracking-widest uppercase text-sterling-silver/60 font-mono mt-2">Proactive Foresight Engine & Vanguard Monitor</p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          {/* Quarantine Staging */}
          <div className="glass-enclave rounded-xl p-1 shadow-xl transition-all border border-white/5 hover:border-white/20 h-[500px]">
            <div className="bg-gunmetal/60 p-6 rounded-lg flex flex-col gap-4 h-full">
              <h3 className="font-heading font-bold text-lg text-white border-b border-white/10 pb-3 flex justify-between items-center">
                Quarantine Staging
                <span className="text-[10px] font-mono tracking-widest px-2 py-1 bg-void/50 rounded border border-white/10 text-gray-400">0 ITEMS</span>
              </h3>
              <p className="text-[10px] uppercase tracking-widest text-sterling-silver/50 font-bold mb-2">
                Review market shifts, API updates, and local dependency audits discovered during system idle time.
              </p>
              <div className="flex-1 bg-void/80 border border-white/5 rounded p-4 flex flex-col items-center justify-center shadow-glass-inner">
                <span className="text-gray-600 font-mono text-sm uppercase tracking-widest text-center">No Discoveries in Quarantine</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-8">
            {/* Vanguard Settings */}
            <div className="glass-enclave rounded-xl p-1 shadow-xl transition-all border border-white/5 hover:border-white/20">
              <div className="bg-gunmetal/60 p-6 rounded-lg flex flex-col gap-4">
                <h3 className="font-heading font-bold text-lg text-white border-b border-white/10 pb-3">Vanguard Monitoring Rules</h3>
                
                <div className="flex justify-between items-center text-xs font-mono border border-white/5 bg-void/50 p-4 rounded shadow-glass-inner">
                  <span className="text-gray-400">NPM Dependency Audits</span>
                  <span className="text-[#00C853] shadow-[0_0_10px_rgba(0,200,83,0.3)] font-bold tracking-widest">ACTIVE</span>
                </div>
                
                <div className="flex justify-between items-center text-xs font-mono border border-white/5 bg-void/50 p-4 rounded shadow-glass-inner">
                  <span className="text-gray-400">Market Research Scraper</span>
                  <span className="text-route-switch shadow-glow-amber font-bold tracking-widest">PAUSED</span>
                </div>
                
                <div className="flex justify-between items-center text-xs font-mono border border-white/5 bg-void/50 p-4 rounded shadow-glass-inner">
                  <span className="text-gray-400">API Documentation Diffing</span>
                  <span className="text-[#00C853] shadow-[0_0_10px_rgba(0,200,83,0.3)] font-bold tracking-widest">ACTIVE</span>
                </div>

                <button className="w-full bg-[#00C853]/10 hover:bg-[#00C853]/30 border border-[#00C853]/30 text-[#00C853] py-3 rounded transition-all duration-300 text-xs uppercase tracking-widest font-bold mt-2 shadow-[0_0_15px_rgba(0,200,83,0.1)] hover:shadow-[0_0_20px_rgba(0,200,83,0.3)]">
                  Edit Monitoring Targets
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
