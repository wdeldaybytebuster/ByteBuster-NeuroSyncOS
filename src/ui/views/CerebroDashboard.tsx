import React, { useState } from 'react';
import { LearningApprovalsQueue } from '../components/LearningApprovalsQueue';

export function CerebroDashboard() {
  const [query, setQuery] = useState('SELECT * FROM cerebro_memories_meta ORDER BY created_at DESC LIMIT 5;');
  const [queryResults, setQueryResults] = useState('');
  const [vectorQuery, setVectorQuery] = useState('');
  const [vectorResults, setVectorResults] = useState<any[]>([]);
  const [isHabituating, setIsHabituating] = useState(false);

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

  const handleHabituate = async () => {
    setIsHabituating(true);
    try {
      await fetch('/api/cerebro/habituate', { method: 'POST' });
      alert('Reflection cycle initiated.');
    } catch (err) {
      alert('Failed to trigger reflection cycle.');
    }
    setIsHabituating(false);
  };

  const handleVectorSearch = async () => {
    try {
      const res = await fetch('/api/cerebro/vector-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: vectorQuery })
      });
      const data = await res.json();
      if (data.success) {
        setVectorResults(data.results);
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="relative w-full h-full text-[#E2E4E9] overflow-y-auto">
      {/* Cerebro Specific Background Grid */}
      <div className="absolute inset-0 z-0 pointer-events-none opacity-40" style={{
        backgroundImage: `
          radial-gradient(circle at 0% 100%, rgba(138, 43, 226, 0.15), transparent 50%),
          radial-gradient(circle at 100% 0%, rgba(65, 105, 225, 0.1), transparent 50%),
          linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)
        `,
        backgroundSize: '100% 100%, 100% 100%, 30px 30px, 30px 30px'
      }}></div>

      <div className="p-8 max-w-7xl mx-auto flex flex-col gap-10 animate-fade-in relative z-10 pb-24">
        <header className="border-b border-neural-blue/20 pb-6">
          <h1 className="text-4xl font-heading font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-neural-blue via-white to-gray-500 flex items-center gap-4">
            <img src="/BASEVAULTLogo.png" alt="Cerebro Logo" className="w-12 h-12 drop-shadow-[0_0_15px_rgba(138,43,226,0.5)] object-contain" />
            Cerebro Logic Matrix
          </h1>
          <p className="text-sm tracking-widest uppercase text-sterling-silver/60 font-mono mt-2">Knowledge Graph Curation & Vector Memory Staging</p>
        </header>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
          <div className="flex flex-col gap-8">
            <div className="glass-enclave rounded-xl p-1 shadow-[0_0_20px_rgba(138,43,226,0.1)] transition-all hover:border-neural-blue/30 flex-1">
              <div className="bg-gunmetal/60 p-6 rounded-lg h-full flex flex-col">
                <h3 className="font-heading font-bold text-lg text-neural-blue border-b border-neural-blue/20 pb-3">Learning Approvals Queue</h3>
                <p className="text-[10px] uppercase tracking-widest text-sterling-silver/50 font-bold mb-4 mt-3">
                  Low-confidence inferences waiting for human confirmation before persisting to the permanent Knowledge Graph.
                </p>
                <div className="flex-1 min-h-[300px]">
                  <LearningApprovalsQueue />
                </div>
              </div>
            </div>

            <div className="glass-enclave rounded-xl p-1 shadow-xl transition-all border border-white/5 hover:border-white/20">
              <div className="bg-gunmetal/60 p-6 rounded-lg flex flex-col gap-4">
                <h3 className="font-heading font-bold text-lg text-white border-b border-white/10 pb-3">Habituation Triggers</h3>
                <p className="text-[10px] uppercase tracking-widest text-sterling-silver/50 font-bold">
                  Force an asynchronous reflection cycle to consolidate short-term `_working.md` logs into permanent structural memory.
                </p>
                <button 
                  onClick={handleHabituate}
                  disabled={isHabituating}
                  className="w-full bg-neural-blue/10 hover:bg-neural-blue/30 border border-neural-blue/30 text-neural-blue py-3 rounded transition-all duration-300 text-xs uppercase tracking-widest font-bold mt-2 shadow-[0_0_15px_rgba(138,43,226,0.1)] hover:shadow-[0_0_20px_rgba(138,43,226,0.3)] disabled:opacity-50"
                >
                  {isHabituating ? 'Initiating Synaptic Consolidation...' : 'Run Reflection Cycle Now'}
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-8">


            <div className="glass-enclave rounded-xl p-1 shadow-xl transition-all border border-white/5 hover:border-white/20 flex-1">
              <div className="bg-gunmetal/60 p-6 rounded-lg flex flex-col gap-4 h-full">
                <h3 className="font-heading font-bold text-lg text-white border-b border-white/10 pb-3">Vector Search Tuner</h3>
                <p className="text-[10px] uppercase tracking-widest text-sterling-silver/50 font-bold mb-2">
                  Test semantic weights against the local `sqlite-vec` index and keyword fallback engine.
                </p>
                <div className="flex gap-3">
                  <input 
                    type="text" 
                    value={vectorQuery}
                    onChange={e => setVectorQuery(e.target.value)}
                    placeholder="Enter semantic query..."
                    className="flex-1 bg-void/50 border border-white/10 text-gray-200 font-mono text-sm rounded p-3 focus:outline-none focus:border-neural-blue shadow-glass-inner"
                  />
                  <button 
                    onClick={handleVectorSearch}
                    className="bg-neural-blue/10 hover:bg-neural-blue/20 border border-neural-blue/20 text-neural-blue px-6 rounded text-xs uppercase tracking-widest font-bold transition-all shadow-[0_0_10px_rgba(138,43,226,0.1)]"
                  >
                    Search
                  </button>
                </div>
                <div className="bg-void/80 border border-white/5 rounded p-4 flex-1 overflow-y-auto mt-2 flex flex-col gap-2 shadow-glass-inner custom-scrollbar min-h-[150px]">
                  {vectorResults.length === 0 && <span className="text-sterling-silver/50 italic text-[10px] uppercase tracking-widest text-center mt-4">Semantic weights will appear here</span>}
                  {vectorResults.map((r, i) => (
                    <div key={i} className="text-xs border-b border-white/5 pb-2">
                      <span className="text-neural-blue font-mono font-bold mr-3 shadow-[0_0_10px_rgba(138,43,226,0.3)]">[{r.distance?.toFixed(3) || 'N/A'}]</span>
                      <span className="text-gray-400 font-mono">{r.text || JSON.stringify(r)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
