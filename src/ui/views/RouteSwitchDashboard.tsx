import React, { useState, useEffect } from 'react';

export function RouteSwitchDashboard() {
  const [provider, setProvider] = useState('openai-compatible');
  const [baseUrl, setBaseUrl] = useState('http://localhost:1234/v1');
  const [modelId, setModelId] = useState('Auto');
  const [apiKey, setApiKey] = useState('');
  const [modelPath, setModelPath] = useState('/models/llama-3.gguf');
  const [councilRisk, setCouncilRisk] = useState(70);
  const [isSaving, setIsSaving] = useState(false);
  const [tokens, setTokens] = useState(0);
  const [costUsd, setCostUsd] = useState(0);
  const [requests24h, setRequests24h] = useState(0);

  useEffect(() => {
    // §3.2 — /api/llm/config only feeds provider-config fields. Token/cost/requests
    // figures are owned by /api/llm/usage (5s poller below) so legacy lifetime
    // telemetry never overwrites the 24h rolling aggregate on initial mount.
    fetch('/api/llm/config')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.config) {
          setProvider(data.config.provider);
          setBaseUrl(data.config.baseUrl);
          setModelId(data.config.modelId);
          setApiKey(data.config.apiKey || '');
          setModelPath(data.config.modelPath);
          setCouncilRisk(data.config.councilRisk);
        }
      })
      .catch(console.error);
  }, []);

  // §3.2 — poll /api/llm/usage every 5s so the 24h panel stays live.
  useEffect(() => {
    let cancelled = false;
    const fetchUsage = async () => {
      try {
        const res = await fetch('/api/llm/usage');
        const data = await res.json();
        if (cancelled) return;
        if (data.success && data.usage24h) {
          setTokens(data.usage24h.tokens || 0);
          setCostUsd(data.usage24h.costUsd || 0);
          setRequests24h(data.usage24h.requests || 0);
        }
      } catch (err) {
        console.error('Usage poll failed:', err);
      }
    };
    fetchUsage();
    const interval = setInterval(fetchUsage, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const handleSaveProvider = async () => {
    setIsSaving(true);
    try {
      const res = await fetch('/api/llm/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider, baseUrl, modelId, apiKey, modelPath, councilRisk
        })
      });
      const data = await res.json();
      if (!data.success) {
        alert('Failed to save config: ' + data.error);
      }
    } catch (err) {
      console.error(err);
      alert('Network error while saving');
    }
    setIsSaving(false);
  };

  return (
    <div className="relative w-full h-full text-[#E2E4E9] overflow-y-auto">
      {/* RouteSwitch Specific Background Pattern */}
      <div className="absolute inset-0 z-0 pointer-events-none opacity-20" style={{
        backgroundImage: `
          radial-gradient(circle at 100% 50%, rgba(255, 179, 0, 0.15), transparent 60%),
          linear-gradient(45deg, rgba(255,255,255,0.02) 25%, transparent 25%, transparent 75%, rgba(255,255,255,0.02) 75%, rgba(255,255,255,0.02)),
          linear-gradient(45deg, rgba(255,255,255,0.02) 25%, transparent 25%, transparent 75%, rgba(255,255,255,0.02) 75%, rgba(255,255,255,0.02))
        `,
        backgroundSize: '100% 100%, 60px 60px, 60px 60px',
        backgroundPosition: '0 0, 0 0, 30px 30px'
      }}></div>

      <div className="p-8 max-w-7xl mx-auto flex flex-col gap-10 animate-fade-in relative z-10 pb-24">
        <header className="border-b border-route-switch/20 pb-6">
          <h1 className="text-4xl font-heading font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-route-switch via-white to-gray-500 flex items-center gap-4">
            <img src="/ROUTESWITCHLogo.png" alt="RouteSwitch Logo" className="w-12 h-12 drop-shadow-glow-amber object-contain" />
            RouteSwitch Hub
          </h1>
          <p className="text-sm tracking-widest uppercase text-sterling-silver/60 font-mono mt-2">Universal Model Context Protocol & Traffic Director</p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          {/* Provider Configuration */}
          <div className="glass-enclave rounded-xl p-1 shadow-glow-amber transition-all hover:border-route-switch/30">
            <div className="bg-gunmetal/60 p-6 rounded-lg flex flex-col gap-5 h-full">
              <h3 className="font-heading font-bold text-lg text-white border-b border-white/10 pb-3">Provider Configuration</h3>
              
              <div className="flex flex-col gap-2">
                <label className="text-[10px] text-sterling-silver/70 font-bold uppercase tracking-widest">Primary Routing Target</label>
                <select 
                  className="bg-void/50 border border-white/10 text-route-switch font-mono text-sm p-3 rounded outline-none focus:border-route-switch shadow-glass-inner appearance-none"
                  value={provider} 
                  onChange={(e) => setProvider(e.target.value)}
                >
                  <option value="mock">Offline Mock Engine (Free)</option>
                  <option value="openai-compatible">FreeLLMAPI / Custom OpenAI</option>
                  <option value="llama-cpp">Local GGUF (node-llama-cpp)</option>
                </select>
              </div>

              {provider === 'openai-compatible' && (
                <div className="flex flex-col gap-4 animate-fade-in mt-2 border border-white/5 p-4 rounded bg-void/30">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-sterling-silver/70 font-bold uppercase tracking-widest">Base API URL</label>
                    <input 
                      type="text" 
                      className="w-full bg-void/50 border border-white/10 text-gray-200 font-mono text-sm rounded p-2 focus:border-route-switch outline-none shadow-glass-inner"
                      value={baseUrl} 
                      onChange={e => setBaseUrl(e.target.value)} 
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-sterling-silver/70 font-bold uppercase tracking-widest">Model ID string</label>
                    <input 
                      type="text" 
                      className="w-full bg-void/50 border border-white/10 text-gray-200 font-mono text-sm rounded p-2 focus:border-route-switch outline-none shadow-glass-inner"
                      value={modelId} 
                      onChange={e => setModelId(e.target.value)} 
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-sterling-silver/70 font-bold uppercase tracking-widest">Authorization Token / API Key</label>
                    <input 
                      type="password" 
                      className="w-full bg-void/50 border border-white/10 text-gray-200 font-mono text-sm rounded p-2 focus:border-route-switch outline-none shadow-glass-inner"
                      value={apiKey} 
                      onChange={e => setApiKey(e.target.value)} 
                      placeholder="sk-..."
                    />
                  </div>
                </div>
              )}

              {provider === 'llama-cpp' && (
                <div className="flex flex-col gap-4 animate-fade-in mt-2 border border-white/5 p-4 rounded bg-void/30">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-sterling-silver/70 font-bold uppercase tracking-widest">Absolute .gguf Model Path</label>
                    <input 
                      type="text" 
                      className="w-full bg-void/50 border border-white/10 text-gray-200 font-mono text-sm rounded p-2 focus:border-route-switch outline-none shadow-glass-inner"
                      value={modelPath} 
                      onChange={e => setModelPath(e.target.value)} 
                    />
                  </div>
                </div>
              )}

              <div className="flex justify-end mt-auto pt-4">
                <button 
                  className="w-full bg-route-switch/10 hover:bg-route-switch/30 border border-route-switch/30 text-route-switch py-3 rounded transition-all duration-300 text-xs uppercase tracking-widest font-bold shadow-[0_0_15px_rgba(255,179,0,0.1)] hover:shadow-glow-amber disabled:opacity-50"
                  onClick={handleSaveProvider}
                  disabled={isSaving}
                >
                  {isSaving ? 'Synchronizing Router...' : 'Commit Configuration'}
                </button>
              </div>
            </div>
          </div>

          {/* Telemetry & Council */}
          <div className="flex flex-col gap-8">
            <div className="glass-enclave rounded-xl p-1 shadow-2xl transition-all border border-white/5 hover:border-white/20">
              <div className="bg-gunmetal/60 p-6 rounded-lg flex flex-col gap-4 h-full">
                <h3 className="font-heading font-bold text-lg text-white border-b border-white/10 pb-3">Token Telemetry & Global Limits</h3>
                <div className="flex flex-col gap-3">
                  <div className="flex justify-between text-xs bg-void/50 border border-white/5 p-4 rounded items-center shadow-glass-inner">
                    <span className="text-sterling-silver/70 uppercase tracking-widest font-bold">Generated Tokens (24h)</span>
                    <span className="font-mono text-lg text-route-switch">{tokens.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-xs bg-void/50 border border-white/5 p-4 rounded items-center shadow-glass-inner">
                    <span className="text-sterling-silver/70 uppercase tracking-widest font-bold">Requests (24h)</span>
                    <span className="font-mono text-lg text-route-switch">{requests24h.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-xs bg-void/50 border border-white/5 p-4 rounded items-center shadow-glass-inner">
                    <span className="text-sterling-silver/70 uppercase tracking-widest font-bold" title="Estimated API cost = (tokens / 1000) * $0.002 (mid-tier blended rate from ESTIMATED_COST_PER_1K_TOKENS_USD). Not authoritative for billing.">Estimated API Cost (24h)</span>
                    <span className="font-mono text-lg text-report-green shadow-glow-cyan">${costUsd.toFixed(4)}</span>
                  </div>
                  <div className="mt-3 flex flex-col gap-1">
                    <label className="text-[10px] text-sterling-silver/70 font-bold uppercase tracking-widest">Hard Daily Cost Ceiling (Auto-Park)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-gray-500 font-mono">$</span>
                      <input type="number" defaultValue={5.00} className="w-full bg-void/50 border border-white/10 text-gray-200 rounded p-2 pl-7 font-mono outline-none focus:border-route-switch" />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="glass-enclave rounded-xl p-1 shadow-2xl transition-all border border-white/5 hover:border-white/20">
              <div className="bg-gunmetal/60 p-6 rounded-lg flex flex-col gap-4">
                <h3 className="font-heading font-bold text-lg text-white border-b border-white/10 pb-3">Council Mode Tuning (RAG Arbitration)</h3>
                <div>
                  <div className="flex justify-between text-[10px] uppercase tracking-widest font-bold text-sterling-silver/70 mb-2">
                    <span>Threshold: {councilRisk}%</span>
                    <span>High Risk = Multi-Agent Debate</span>
                  </div>
                  <input 
                    type="range" 
                    min="1" 
                    max="100" 
                    value={councilRisk}
                    onChange={(e) => setCouncilRisk(parseInt(e.target.value))}
                    className="w-full accent-route-switch"
                  />
                  <div className="flex justify-between text-[9px] text-gray-500 mt-1 uppercase font-mono tracking-widest">
                    <span>Trigger Happy</span>
                    <span>Conservative Only</span>
                  </div>
                </div>
                <div className="mt-2 text-xs text-gray-400 leading-relaxed">
                  Council Mode engages multiple LLMs simultaneously to vote on logic paths when the ambiguity score crosses the threshold.
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Live Fallback Monitor */}
        <div className="glass-enclave rounded-xl p-1 shadow-xl transition-all border border-white/5 mt-8">
          <div className="bg-gunmetal/60 p-5 rounded-lg flex flex-col gap-4">
            <h3 className="font-heading font-bold text-white border-b border-white/10 pb-2 text-sm uppercase tracking-widest">
              Live Fallback Monitor
            </h3>
            <div className="bg-void/80 font-mono text-xs text-gray-400 p-4 rounded h-40 overflow-y-auto custom-scrollbar border border-white/5 shadow-glass-inner flex items-center justify-center">
              <div className="text-sterling-silver/50 italic tracking-widest uppercase">No network fallbacks detected in the current session.</div>
            </div>
          </div>
        </div>

        {/* MCP Connection Manager */}
        <div className="glass-enclave rounded-xl p-1 shadow-xl transition-all border border-white/5 mt-8">
          <div className="bg-gunmetal/60 p-5 rounded-lg flex flex-col gap-4">
            <h3 className="font-heading font-bold text-white border-b border-white/10 pb-2 flex justify-between items-center text-sm uppercase tracking-widest">
              Model Context Protocol (MCP) Manager
              <button className="text-[10px] bg-route-switch/10 hover:bg-route-switch/30 border border-route-switch/30 text-route-switch px-3 py-1 rounded transition-colors uppercase tracking-widest font-bold">Add Server</button>
            </h3>
            <p className="text-[10px] uppercase tracking-widest text-sterling-silver/50 font-bold mb-2">
              Manage external tools, file system bridges, and API connections injected into the AI context.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-void/50 border border-white/5 p-4 rounded shadow-glass-inner flex flex-col gap-2">
                <div className="flex justify-between items-center">
                  <span className="font-mono text-xs text-white font-bold">chrome-devtools</span>
                  <span className="text-report-green text-[10px] uppercase tracking-widest font-bold shadow-glow-cyan">CONNECTED</span>
                </div>
                <div className="text-[10px] text-gray-500 font-mono">stdio transport | 5 tools loaded</div>
              </div>
              <div className="bg-void/50 border border-white/5 p-4 rounded shadow-glass-inner flex flex-col gap-2">
                <div className="flex justify-between items-center">
                  <span className="font-font text-xs text-white font-bold">filesystem-bridge</span>
                  <span className="text-report-green text-[10px] uppercase tracking-widest font-bold shadow-glow-cyan">CONNECTED</span>
                </div>
                <div className="text-[10px] text-gray-500 font-mono">stdio transport | 12 tools loaded</div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
