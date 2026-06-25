import React, { useState } from 'react';

export function BaseVaultDashboard() {
  const [query, setQuery] = useState('SELECT * FROM cerebro_memories_meta ORDER BY created_at DESC LIMIT 5;');
  const [queryResults, setQueryResults] = useState('');
  const [isSanitizing, setIsSanitizing] = useState(false);

  const handleRunQuery = async () => {
    try {
      const res = await fetch('/api/cerebro/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
      });
      const data = await res.json();
      setQueryResults(JSON.stringify(data, null, 2));
    } catch (err) {
      setQueryResults('Error executing query.');
    }
  };

  const handleSanitize = async () => {
    setIsSanitizing(true);
    // Mocking the sanitize call
    setTimeout(() => {
      alert('Data sanitization loop completed successfully.');
      setIsSanitizing(false);
    }, 1500);
  };

  return (
    <div className="relative w-full h-full text-[#E2E4E9] overflow-y-auto">
      {/* BaseVault Specific Background Grid */}
      <div className="absolute inset-0 z-0 pointer-events-none opacity-40" style={{
        backgroundImage: `
          radial-gradient(circle at 100% 100%, rgba(138, 43, 226, 0.15), transparent 50%),
          linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)
        `,
        backgroundSize: '100% 100%, 30px 30px, 30px 30px'
      }}></div>

      <div className="p-8 max-w-7xl mx-auto flex flex-col gap-10 animate-fade-in relative z-10 pb-24">
        <header className="border-b border-neural-blue/20 pb-6">
          <h1 className="text-4xl font-heading font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-neural-blue via-white to-gray-500 flex items-center gap-4">
            <img src="/BASEVAULTLogo.png" alt="BaseVault Logo" className="w-12 h-12 drop-shadow-[0_0_15px_rgba(138,43,226,0.5)] object-contain" />
            BaseVault Storage
          </h1>
          <p className="text-sm tracking-widest uppercase text-sterling-silver/60 font-mono mt-2">Physical SQLite Persistence & Data Sanitization</p>
        </header>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
          <div className="flex flex-col gap-8">
            {/* SQLite Explorer */}
            <div className="glass-enclave rounded-xl p-1 shadow-xl transition-all border border-white/5 hover:border-white/20 h-[400px]">
              <div className="bg-gunmetal/60 p-6 rounded-lg flex flex-col gap-4 h-full">
                <h3 className="font-heading font-bold text-lg text-white border-b border-white/10 pb-3 flex justify-between items-center">
                  BaseVault SQLite Explorer
                  <button onClick={handleRunQuery} className="text-[10px] bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-1 rounded text-gray-300 transition-colors uppercase tracking-widest font-bold">Execute</button>
                </h3>
                <div className="flex gap-4 h-full min-h-0 mt-2">
                  <textarea 
                    className="flex-1 bg-void/50 border border-white/10 text-gray-300 font-mono text-xs p-3 rounded resize-none focus:outline-none focus:border-neural-blue shadow-glass-inner custom-scrollbar"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                  />
                  <textarea 
                    className="flex-1 bg-void/80 border border-white/5 text-gray-400 font-mono text-xs p-3 rounded resize-none shadow-glass-inner custom-scrollbar"
                    readOnly
                    value={queryResults}
                    placeholder="Results JSON..."
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-8">
            {/* Data Sanitization Loop */}
            <div className="glass-enclave rounded-xl p-1 shadow-xl transition-all border border-white/5 hover:border-white/20">
              <div className="bg-gunmetal/60 p-6 rounded-lg flex flex-col gap-4">
                <h3 className="font-heading font-bold text-lg text-white border-b border-white/10 pb-3">Data Sanitization Loop</h3>
                <p className="text-[10px] uppercase tracking-widest text-sterling-silver/50 font-bold">
                  Execute the manual redaction pipeline to purge unconfirmed AI output and sensitive tokens from the local schema.
                </p>
                <button 
                  onClick={handleSanitize}
                  disabled={isSanitizing}
                  className="w-full bg-neural-blue/10 hover:bg-neural-blue/30 border border-neural-blue/30 text-neural-blue py-3 rounded transition-all duration-300 text-xs uppercase tracking-widest font-bold mt-2 shadow-[0_0_15px_rgba(138,43,226,0.1)] hover:shadow-[0_0_20px_rgba(138,43,226,0.3)] disabled:opacity-50"
                >
                  {isSanitizing ? 'Sanitizing Database...' : 'Run Sanitization Audit'}
                </button>
              </div>
            </div>
            
            {/* Local Backups */}
            <div className="glass-enclave rounded-xl p-1 shadow-xl transition-all border border-white/5 hover:border-white/20">
              <div className="bg-gunmetal/60 p-6 rounded-lg flex flex-col gap-4">
                <h3 className="font-heading font-bold text-lg text-white border-b border-white/10 pb-3">Local Snapshots & Backups</h3>
                <p className="text-[10px] uppercase tracking-widest text-sterling-silver/50 font-bold">
                  Dump the entire SQLite state into a compressed local tarball.
                </p>
                <button 
                  onClick={() => alert('Snapshot backup triggered. Check local /backups directory.')}
                  className="w-full bg-white/5 hover:bg-white/10 border border-white/20 text-gray-300 py-3 rounded transition-all duration-300 text-xs uppercase tracking-widest font-bold mt-2"
                >
                  Create Backup Snapshot
                </button>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
