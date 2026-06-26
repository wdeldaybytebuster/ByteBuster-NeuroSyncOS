
import React, { useState, useEffect } from 'react';


export function RouteSwitchDashboard() {
  useEffect(() => {
    // Make sure lucid icons render on initial mount
    try {
      (window as any).lucide?.createIcons();
    } catch(e) {}
  }, []);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        /* CSS Variable System for Stealth Black & High-Glow Amber Morphing */
        :root {
            /* Dark Mode: Deep Stealth Black & High-Contrast Amber Glow */
            --bg-base: #000000; 
            --bg-surface: #050505;
            --bg-surface-glass: rgba(5, 5, 5, 0.45); 
            --bg-nested: rgba(255, 179, 0, 0.05); /* Amber nested bg */
            
            /* Maximized Glow Values per request */
            --border-glow: rgba(255, 179, 0, 0.35);
            --text-primary: #fafafa;
            --text-muted: #8f8f9d;
            --accent: #FFB300; /* RouteSwitch Logo Amber */
            --accent-glow: rgba(255, 179, 0, 0.75); /* Pumped up neon glow */
            --card-border: rgba(35, 30, 20, 0.8);
            --grid-color: rgba(255, 179, 0, 0.08); /* Stronger grid contrast */
            --grid-line: rgba(255, 255, 255, 0.03);
            --glow-color: rgba(255, 179, 0, 0.25);
            --terminal-bg: #030303;
            --terminal-text: #FFB300;
        }

        .light {
            /* Light Mode: Structured Paper & Deep Amber */
            --bg-base: #f8fafc;
            --bg-surface: #ffffff;
            --bg-surface-glass: rgba(255, 255, 255, 0.85);
            --bg-nested: rgba(217, 119, 6, 0.04);
            --border-glow: rgba(217, 119, 6, 0.1);
            --text-primary: #0f172a;
            --text-muted: #64748b;
            --accent: #d97706;
            --accent-glow: rgba(217, 119, 6, 0.25);
            --card-border: rgba(203, 213, 225, 0.8);
            --grid-color: rgba(217, 119, 6, 0.03);
            --grid-line: rgba(217, 119, 6, 0.03);
            --glow-color: rgba(217, 119, 6, 0.05);
            --terminal-bg: #0f172a;
            --terminal-text: #fbbf24;
        }

        body {
            background-color: var(--bg-base);
            color: var(--text-primary);
            font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            background-image: 
                radial-gradient(circle at 50% 50%, var(--grid-color) 0%, transparent 70%),
                linear-gradient(var(--grid-line) 1px, transparent 1px),
                linear-gradient(90deg, var(--grid-line) 1px, transparent 1px);
            background-size: 100% 100%, 24px 24px, 24px 24px;
            transition: background-color 0.4s ease, color 0.4s ease, background-image 0.4s ease;
        }

        /* High-Glow Stealth Card Design */
        .glow-card {
            border: 1px solid var(--card-border);
            background-color: var(--bg-surface-glass);
            backdrop-filter: blur(10px);
            -webkit-backdrop-filter: blur(10px);
            /* Boosted default shadow */
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.8), 0 0 15px var(--glow-color);
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .glow-card:hover {
            border-color: rgba(255, 179, 0, 0.6);
            /* Massive neon bleed on hover */
            box-shadow: 0 6px 25px rgba(0, 0, 0, 0.9), 0 0 35px var(--accent-glow);
            transform: translateY(-1px);
        }

        /* Focus rings */
        .focusable:focus-visible {
            outline: 2px solid var(--accent);
            outline-offset: 2px;
        }

        /* Custom Scrollbar */
        ::-webkit-scrollbar {
            width: 6px;
            height: 6px;
        }
        ::-webkit-scrollbar-track {
            background: transparent;
        }
        ::-webkit-scrollbar-thumb {
            background: var(--card-border);
            border-radius: 3px;
        }
        ::-webkit-scrollbar-thumb:hover {
            background: var(--accent);
        }

        /* Traffic Routing Line Connector */
        .route-connector::before {
            content: '';
            position: absolute;
            top: 24px;
            left: 11px;
            bottom: -16px;
            width: 2px;
            background: var(--card-border);
            z-index: 0;
        }
        .route-item:last-child .route-connector::before {
            display: none;
        }
    ` }} />
      

    
    <header className="w-full h-16 border-b border-[var(--card-border)] bg-[var(--bg-surface-glass)] backdrop-blur-md px-6 flex items-center justify-between z-40 fixed top-0 left-0 transition-colors duration-300">
        <div className="flex items-center space-x-3">
            
            <button  className="w-9 h-9 rounded-lg border border-[var(--card-border)] bg-[var(--bg-nested)] hover:border-zinc-500 flex items-center justify-center text-[var(--accent)] focusable transition-colors shadow-[0_0_8px_var(--glow-color)]" aria-label="Open Suite Switcher Menu">
                <i data-lucide="menu" className="w-5 h-5"></i>
            </button>

            
            <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-black/20 border border-[var(--card-border)] shadow-[0_0_12px_var(--glow-color)]">
                <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" className="w-7 h-7">
                    <polyline points="20,70 20,20 40,20" fill="none" stroke="currentColor" strokeWidth="3" opacity="0.5" className="text-[var(--accent)]"/>
                    <polyline points="80,30 80,80 60,80" fill="none" stroke="currentColor" strokeWidth="3" opacity="0.5" className="text-[var(--accent)]"/>
                    <g transform="translate(50,50) scale(0.6) translate(-50,-50)">
                        <g transform="rotate(45,50,50)">
                            <path d="M 56 85 L 56 68 L 60 68 L 60 45 L 75 30 L 75 10 L 58 10 L 58 28 L 42 28 L 42 10 L 25 10 L 25 30 L 40 45 L 40 68 L 44 68 L 44 85 Z" fill="rgba(255,179,0,0.15)" stroke="currentColor" strokeWidth="4" strokeLinejoin="round" className="text-[var(--accent)]"/>
                            <rect x="46" y="74" width="3" height="5" fill="#0D0E15"/>
                            <rect x="51" y="74" width="3" height="5" fill="#0D0E15"/>
                            <rect x="48" y="40" width="4" height="24" rx="2" fill="currentColor" className="text-[var(--accent)]"/>
                        </g>
                    </g>
                </svg>
            </div>
            
            <div className="hidden sm:block ml-1">
                <span className="font-black text-sm tracking-wider uppercase text-[var(--text-primary)]" style={{ textShadow: '0 0 8px var(--glow-color)' }}>ROUTESWITCH ENGINE</span>
                <span className="text-[9px] uppercase font-bold text-[var(--accent)] tracking-widest block -mt-1 drop-shadow-md">NeuroSync Sovereign Suite</span>
            </div>
        </div>

        
        <div className="flex bg-[var(--bg-nested)] p-1 rounded-xl border border-[var(--card-border)] items-center space-x-1 shadow-[0_0_10px_var(--glow-color)]" role="tablist" aria-label="Route Navigation">
            <button id="tab-dashboard"  className="px-5 py-1.5 rounded-lg text-sm font-semibold transition-all duration-200 flex items-center space-x-2 text-black bg-[var(--accent)] shadow-[0_0_15px_var(--accent-glow)] focusable" role="tab" aria-selected="true" aria-controls="panel-dashboard">
                <i data-lucide="git-merge" className="w-4 h-4 text-black"></i>
                <span>Routing</span>
            </button>
            <button id="tab-setups"  className="px-5 py-1.5 rounded-lg text-sm font-semibold transition-all duration-200 flex items-center space-x-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] focusable hover:shadow-[0_0_10px_var(--glow-color)]" role="tab" aria-selected="false" aria-controls="panel-setups">
                <i data-lucide="settings-2" className="w-4 h-4"></i>
                <span>Quotas & Fallbacks</span>
            </button>
        </div>

        
        <div className="flex items-center space-x-2">
            <button  className="w-9 h-9 rounded-lg border border-[var(--card-border)] bg-[var(--bg-nested)] hover:border-[var(--accent)] hover:shadow-[0_0_15px_var(--accent-glow)] flex items-center justify-center transition-all focusable" aria-label="Toggle visual theme">
                <i id="theme-icon" data-lucide="sun" className="w-4 h-4 text-[var(--accent)]"></i>
            </button>
            <button className="w-9 h-9 rounded-lg border border-[var(--card-border)] bg-[var(--bg-nested)] hover:border-[var(--accent)] hover:shadow-[0_0_15px_var(--accent-glow)] flex items-center justify-center transition-all focusable" aria-label="Toggle system cognitive tags schema">
                <i data-lucide="network" className="w-4 h-4 text-[var(--accent)]"></i>
            </button>
            <button  className="w-9 h-9 rounded-lg border border-[var(--card-border)] bg-[var(--bg-nested)] hover:border-[var(--accent)] hover:shadow-[0_0_15px_var(--accent-glow)] flex items-center justify-center text-[var(--accent)] focusable" aria-label="Toggle command workspace panel">
                <i data-lucide="sidebar" className="w-5 h-5"></i>
            </button>
        </div>
    </header>

    
    <aside id="suite-switcher" className="fixed left-0 top-16 h-[calc(100vh-4rem)] w-72 bg-[var(--bg-surface-glass)] backdrop-blur-xl border-r border-[var(--card-border)] z-30 transition-transform duration-300 transform -translate-x-full shadow-[5px_0_25px_rgba(0,0,0,0.9)] flex flex-col">
        <div className="p-4 border-b border-[var(--card-border)] flex items-center justify-between">
            <div className="flex items-center space-x-2 text-[var(--accent)] drop-shadow-md">
                <i data-lucide="compass" className="w-4 h-4"></i>
                <h3 className="font-bold text-xs tracking-wider uppercase">Sovereign Suite Switcher</h3>
            </div>
            <button  className="p-1 rounded hover:bg-[var(--accent)]/20 text-[var(--text-muted)] hover:text-[var(--accent)] transition" aria-label="Close suite navigation">
                <i data-lucide="x" className="w-4 h-4"></i>
            </button>
        </div>

        <nav className="flex-1 p-4 space-y-2 overflow-y-auto font-medium">
            <button className="w-full flex items-center p-3 rounded-xl hover:bg-[var(--bg-nested)] border border-transparent hover:border-[var(--card-border)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition text-left focusable">
                <i data-lucide="cpu" className="w-4 h-4 mr-3"></i>
                <span className="text-xs font-bold uppercase tracking-wider">CoreExec (Orchestrator)</span>
            </button>
            <button className="w-full flex items-center p-3 rounded-xl hover:bg-[var(--bg-nested)] border border-transparent hover:border-[var(--card-border)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition text-left focusable">
                <i data-lucide="vault" className="w-4 h-4 mr-3"></i>
                <span className="text-xs font-bold uppercase tracking-wider">BaseVault (Database)</span>
            </button>
            <button className="w-full flex items-center p-3 rounded-xl hover:bg-[var(--bg-nested)] border border-transparent hover:border-[var(--card-border)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition text-left focusable">
                <i data-lucide="grid-3x3" className="w-4 h-4 mr-3"></i>
                <span className="text-xs font-bold uppercase tracking-wider">PortGrid (Skills Hub)</span>
            </button>
            <a href="#" className="flex items-center justify-between p-3 rounded-xl bg-[var(--accent)]/15 border border-[var(--accent)] text-[var(--text-primary)] transition focusable shadow-[0_0_20px_var(--glow-color)]">
                <div className="flex items-center space-x-3">
                    <i data-lucide="shuffle" className="w-4 h-4 text-[var(--accent)]"></i>
                    <span className="text-xs font-bold uppercase tracking-wider text-white" style={{ textShadow: '0 0 5px var(--accent-glow)' }}>RouteSwitch (Router)</span>
                </div>
                <span className="w-2 h-2 rounded-full bg-[var(--accent)] animate-pulse shadow-[0_0_12px_var(--accent)]"></span>
            </a>
            <button className="w-full flex items-center p-3 rounded-xl hover:bg-[var(--bg-nested)] border border-transparent hover:border-[var(--card-border)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition text-left focusable">
                <i data-lucide="file-question" className="w-4 h-4 mr-3"></i>
                <span className="text-xs font-bold uppercase tracking-wider">ScopeLogic (Proposal)</span>
            </button>
            <button className="w-full flex items-center p-3 rounded-xl hover:bg-[var(--bg-nested)] border border-transparent hover:border-[var(--card-border)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition text-left focusable">
                <i data-lucide="radar" className="w-4 h-4 mr-3"></i>
                <span className="text-xs font-bold uppercase tracking-wider">ScoutDaemon (Predictive)</span>
            </button>
        </nav>
        <div className="p-4 border-t border-[var(--card-border)] bg-zinc-900/40 text-[10px] text-[var(--accent)]/60 font-mono flex flex-col space-y-1">
            <span>Universal Traffic Director</span>
            <span>Free Mode Governor Active</span>
        </div>
    </aside>

    
    <aside id="sidebar-panel" className="fixed right-0 top-16 h-[calc(100vh-4rem)] w-80 bg-[var(--bg-surface-glass)] backdrop-blur-xl border-l border-[var(--card-border)] z-30 transition-transform duration-300 transform translate-x-0 shadow-[-5px_0_25px_rgba(0,0,0,0.9)] flex flex-col">
        <div className="p-4 border-b border-[var(--card-border)] flex items-center justify-between">
            <div className="flex items-center space-x-2 text-[var(--accent)] drop-shadow-md">
                <i data-lucide="network" className="w-4 h-4"></i>
                <h3 className="font-bold text-sm tracking-wider uppercase">Active Connections</h3>
            </div>
            <button  className="p-1 rounded hover:bg-[var(--accent)]/20 text-[var(--text-muted)] hover:text-[var(--accent)] transition" aria-label="Close panel">
                <i data-lucide="x" className="w-4 h-4"></i>
            </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-5">
            
            <div className="space-y-2">
                <label className="text-xs font-semibold text-[var(--text-muted)] tracking-wider uppercase block">Provider Registry Health</label>
                <div className="space-y-2">
                    <div className="flex items-center justify-between p-2 rounded-lg bg-black/60 border border-green-500/20 shadow-[0_0_8px_rgba(34,197,94,0.1)]">
                        <div className="flex items-center space-x-2">
                            <i data-lucide="server" className="w-3.5 h-3.5 text-green-500"></i>
                            <span className="text-xs font-bold text-white">Local Mock Provider</span>
                        </div>
                        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse shadow-[0_0_5px_rgba(34,197,94,0.8)]"></span>
                    </div>
                    <div className="flex items-center justify-between p-2 rounded-lg bg-black/60 border border-[var(--card-border)]">
                        <div className="flex items-center space-x-2">
                            <i data-lucide="cloud" className="w-3.5 h-3.5 text-zinc-400"></i>
                            <span className="text-xs font-bold text-zinc-300">OpenRouter (Free Tier)</span>
                        </div>
                        <span className="w-2 h-2 rounded-full bg-orange-500 shadow-[0_0_5px_rgba(249,115,22,0.8)]"></span>
                    </div>
                    <div className="flex items-center justify-between p-2 rounded-lg bg-black/60 border border-[var(--card-border)]">
                        <div className="flex items-center space-x-2">
                            <i data-lucide="cloud-off" className="w-3.5 h-3.5 text-zinc-600"></i>
                            <span className="text-xs font-bold text-zinc-500">OpenCode Zen (Paid)</span>
                        </div>
                        <span className="text-[9px] font-mono font-bold text-zinc-600 border border-zinc-700 px-1 rounded bg-black">DISABLED</span>
                    </div>
                </div>
            </div>

            
            <div className="bg-[var(--bg-nested)] border border-[var(--card-border)] rounded-lg p-3 space-y-3 shadow-[0_0_15px_var(--glow-color)]">
                <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[var(--accent)] uppercase tracking-wider flex items-center space-x-1.5 drop-shadow-md">
                        <i data-lucide="plug" className="w-3.5 h-3.5"></i>
                        <span>MCP Adapters</span>
                    </span>
                    <span className="px-1.5 py-0.5 bg-[var(--accent)]/10 text-[var(--accent)] rounded text-[9px] uppercase font-bold tracking-widest border border-[var(--accent)]/30">2 Active</span>
                </div>
                <div className="space-y-1">
                    <div className="flex justify-between text-[11px] font-mono">
                        <span className="text-zinc-300 font-semibold">SQLite Vector Adapter</span>
                        <span className="text-green-400 font-bold">stdio</span>
                    </div>
                    <div className="flex justify-between text-[11px] font-mono">
                        <span className="text-zinc-300 font-semibold">GitNexus Map</span>
                        <span className="text-green-400 font-bold">stdio</span>
                    </div>
                </div>
                <p className="text-[10px] text-zinc-500 leading-relaxed font-medium pt-1 border-t border-[var(--card-border)]">
                    Local model context protocols ensure tools are executed without remote SDK point-to-point connections.
                </p>
            </div>
        </div>

        <div className="p-3 border-t border-[var(--card-border)] bg-zinc-900/40 text-[10px] text-[var(--accent)]/60 font-mono text-center">
            P99 Latency: <span className="text-[var(--accent)] font-bold drop-shadow-sm">48ms</span>
        </div>
    </aside>

    
    <div className="flex-1 flex pt-16 relative overflow-hidden">
        <main className="flex-1 flex flex-col md:flex-row transition-all duration-300 p-6 space-y-6 md:space-y-0 md:space-x-6 min-h-[calc(100vh-4rem)] lg:mr-80" id="main-content-layout">

            
            <div id="panel-dashboard" className="flex-1 flex flex-col lg:flex-row space-y-6 lg:space-y-0 lg:space-x-6 w-full animate-fade-in" role="tabpanel" aria-labelledby="tab-dashboard">
                
                
                <div className="flex-1 glow-card rounded-2xl p-5 flex flex-col relative overflow-hidden transition-colors duration-300">
                    <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(circle at top, var(--grid-color) 0%, transparent 75%)" }}></div>
                    
                    <div className="relative z-10 flex flex-col h-full space-y-5">
                        <div className="flex items-center justify-between border-b border-[var(--card-border)] pb-3">
                            <div>
                                <h1 className="text-xl font-black tracking-wide text-white drop-shadow-md">Live Traffic & Cascade Routing</h1>
                                <p className="text-[11px] text-[var(--text-muted)] mt-0.5 font-bold uppercase tracking-wider">Tracking outbound payload intercept: <span className="text-[var(--accent)] drop-shadow-sm">req_992x_gamma</span></p>
                            </div>
                            <button  className="px-4 py-2 rounded-lg bg-[var(--accent)] hover:bg-white text-black text-xs font-black flex items-center space-x-2 transition-all shadow-[0_0_20px_var(--accent-glow)] focusable">
                                <i data-lucide="send-to-back" className="w-3.5 h-3.5"></i>
                                <span>Inject Mock Request</span>
                            </button>
                        </div>

                        
                        <div className="flex-1 overflow-y-auto px-2 py-4 space-y-4" id="routing-container">
                            
                            
                            <div className="route-item relative pl-10">
                                <div className="route-connector">
                                    <div className="absolute left-0 top-1 w-6 h-6 rounded-full bg-green-500/10 border border-green-500 flex items-center justify-center z-10 shadow-[0_0_12px_rgba(34,197,94,0.4)]">
                                        <i data-lucide="calculator" className="w-3 h-3 text-green-400"></i>
                                    </div>
                                </div>
                                <div className="p-3 rounded-xl bg-black/60 border border-green-500/30">
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="text-xs font-bold text-white">1. Token & Call Forecast Module</span>
                                        <span className="text-[9px] px-1.5 py-0.5 bg-green-500/10 text-green-400 rounded border border-green-500/20 font-mono">APPROVED</span>
                                    </div>
                                    <p className="text-[10px] text-zinc-400 font-mono">Worst-case DAG token burn: <span className="text-green-400">1,200 tokens.</span> Daily limit safe.</p>
                                </div>
                            </div>

                            
                            <div className="route-item relative pl-10" id="primary-route">
                                <div className="route-connector">
                                    <div className="absolute left-0 top-1 w-6 h-6 rounded-full bg-red-500/10 border border-red-500 flex items-center justify-center z-10 shadow-[0_0_12px_rgba(239,68,68,0.4)]">
                                        <i data-lucide="x" className="w-3 h-3 text-red-400"></i>
                                    </div>
                                </div>
                                <div className="p-3 rounded-xl border border-red-500/40 bg-red-500/5">
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="text-xs font-bold text-white">2. Level 1 (Agent Preference)</span>
                                        <span className="text-[9px] px-1.5 py-0.5 bg-red-500/10 text-red-400 rounded border border-red-500/20 font-mono">429 RATE LIMIT</span>
                                    </div>
                                    <p className="text-[10px] text-zinc-400 font-mono">Provider: <span className="text-red-400">OpenRouter (deepseek-v4-flash-free)</span></p>
                                    <p className="text-[10px] text-zinc-500 italic mt-1 border-t border-red-500/20 pt-1">Error Normalizer: "NLMRateLimitError - Daily Free Tier Exhausted"</p>
                                </div>
                            </div>

                            
                            <div className="route-item relative pl-10 opacity-50" id="fallback-route">
                                <div className="route-connector">
                                    <div className="absolute left-0 top-1 w-6 h-6 rounded-full bg-zinc-900 border border-zinc-700 flex items-center justify-center z-10">
                                        <i data-lucide="rotate-ccw" className="w-3 h-3 text-zinc-500"></i>
                                    </div>
                                </div>
                                <div className="border border-[var(--card-border)] bg-black/40 p-3 rounded-xl">
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="text-xs font-bold text-white">3. Level 2 (Category Default Fallback)</span>
                                        <span className="text-[9px] px-1.5 py-0.5 bg-zinc-800 text-zinc-400 rounded border border-zinc-700 font-mono">AWAITING</span>
                                    </div>
                                    <p className="text-[10px] text-zinc-500 font-mono">Target: Local Mock Offline Provider...</p>
                                </div>
                            </div>

                        </div>
                    </div>
                </div>

                
                <div className="w-full lg:w-80 flex flex-col space-y-6">
                    
                    
                    <div className="glow-card rounded-2xl p-5 relative overflow-hidden transition-colors duration-300">
                        <div className="flex items-center justify-between border-b border-[var(--card-border)] pb-3 mb-4">
                            <div className="flex items-center space-x-2 text-[var(--accent)] drop-shadow-md">
                                <i data-lucide="bar-chart-2" className="w-4 h-4"></i>
                                <h3 className="font-bold text-xs tracking-wider uppercase">Free Mode Mentrix</h3>
                            </div>
                            <span className="text-[9px] font-mono text-zinc-500 font-bold">Ledger Active</span>
                        </div>

                        
                        <div className="space-y-1 mb-4">
                            <div className="flex justify-between text-[11px] font-bold">
                                <span className="text-white">Daily Token Quota Burn</span>
                                <span className="text-[var(--accent)] drop-shadow-sm font-mono">34,500 / 50k</span>
                            </div>
                            <div className="w-full h-2 bg-black/80 rounded-full border border-[var(--card-border)] overflow-hidden shadow-inner">
                                <div className="h-full bg-gradient-to-r from-orange-600 to-[var(--accent)] w-[69%] shadow-[0_0_10px_var(--accent)]"></div>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3 text-center text-xs">
                            <div className="bg-black/60 p-2 rounded-xl border border-[var(--card-border)] shadow-inner">
                                <span className="text-[9px] text-[var(--text-muted)] font-bold uppercase block mb-0.5">Blocked Spends</span>
                                <span className="text-sm font-black text-green-500 font-mono">14</span>
                            </div>
                            <div className="bg-black/60 p-2 rounded-xl border border-[var(--card-border)] shadow-inner">
                                <span className="text-[9px] text-[var(--text-muted)] font-bold uppercase block mb-0.5">Fallbacks</span>
                                <span className="text-sm font-black text-[var(--accent)] font-mono drop-shadow-sm">48</span>
                            </div>
                        </div>
                    </div>

                    
                    <div className="flex-1 flex flex-col min-h-[250px]">
                        <div className="flex items-center justify-between mb-2">
                            <label className="text-xs font-semibold text-[var(--text-muted)] tracking-wider uppercase">Route Ledger Logs</label>
                        </div>
                        <div id="pino-logger" className="flex-1 bg-black border border-[var(--card-border)] rounded-xl p-3 font-mono text-[9px] text-zinc-400 overflow-y-auto space-y-1.5 shadow-inner">
                            <div><span className="text-zinc-600">[11:42:01]</span> ROUTESWITCH: Booting traffic director...</div>
                            <div><span className="text-zinc-600">[11:42:02]</span> QUOTA_LEDGER: Daily limits initialized at 50,000.</div>
                            <div className="text-[var(--accent)]"><span className="text-zinc-600">[11:45:10]</span> FORECAST: DAG workflow wf_092x mathematically safe.</div>
                            <div className="text-red-400"><span className="text-zinc-600">[11:45:12]</span> ERROR_NORMALIZE: Caught 429 Rate Limit from OpenRouter.</div>
                            <div className="text-[var(--accent)]"><span className="text-zinc-600">[11:45:13]</span> CASCADE: Fallback to Local Mock initiated.</div>
                        </div>
                    </div>

                </div>
            </div>

            
            <div id="panel-setups" className="flex-1 hidden flex-col lg:flex-row space-y-6 lg:space-y-0 lg:space-x-6 w-full animate-fade-in" role="tabpanel" aria-labelledby="tab-setups">
                
                
                <div className="flex-1 glow-card rounded-2xl p-5 flex flex-col relative overflow-hidden transition-colors duration-300">
                    <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(circle at top, var(--grid-color) 0%, transparent 75%)" }}></div>

                    <div className="relative z-10 flex flex-col h-full space-y-4">
                        <div className="border-b border-[var(--card-border)] pb-3">
                            <h1 className="text-xl font-black tracking-wide text-white drop-shadow-md">Quota & Routing Set-ups</h1>
                            <p className="text-xs text-[var(--text-muted)] mt-0.5 font-medium">Configure Free Mode limits, provider fallback cascades, and Intelligent Rotation policies.</p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                            
                            
                            <div className="space-y-4">
                                <h3 className="text-sm font-black text-[var(--accent)] flex items-center space-x-2 drop-shadow-sm">
                                    <i data-lucide="scale" className="w-4 h-4"></i>
                                    <span>Free Mode Governor</span>
                                </h3>

                                <div className="space-y-4 bg-black/60 border border-[var(--card-border)] rounded-xl p-4 shadow-inner">
                                    <div className="space-y-2">
                                        <div className="flex justify-between text-xs font-bold">
                                            <span className="text-[var(--text-muted)]">Daily Token Cap</span>
                                            <span id="quota-display" className="text-[var(--accent)] font-mono">50,000 (Safe)</span>
                                        </div>
                                        <input type="range" min="10000" max="100000" step="5000" value="50000" onInput={() => {}} className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-[var(--accent)] shadow-[0_0_10px_var(--accent-glow)]" />
                                    </div>
                                    
                                    <div className="flex items-center justify-between p-2 rounded bg-black/80 border border-[var(--card-border)]">
                                        <div>
                                            <span className="text-xs font-bold text-white block">Token & Call Forecasting</span>
                                            <span className="text-[9px] text-zinc-500 font-semibold block">Mathematically block doomed DAGs</span>
                                        </div>
                                        <input type="checkbox" checked className="w-4 h-4 text-[var(--accent)] bg-black border-zinc-700 rounded focus:ring-[var(--accent)]" />
                                    </div>
                                </div>
                            </div>

                            
                            <div className="space-y-4">
                                <h3 className="text-sm font-black text-[var(--accent)] flex items-center space-x-2 drop-shadow-sm">
                                    <i data-lucide="refresh-ccw" className="w-4 h-4"></i>
                                    <span>Provider Rotation Engine</span>
                                </h3>

                                <div className="space-y-3 bg-black/60 border border-[var(--card-border)] rounded-xl p-4 shadow-inner">
                                    <div className="flex items-center justify-between p-2 rounded bg-black/80 border border-[var(--card-border)]">
                                        <div>
                                            <span className="text-xs font-bold text-white block">Usage-Based Rotation</span>
                                            <span className="text-[9px] text-zinc-500 font-semibold block">Dynamically switch free-tier providers</span>
                                        </div>
                                        <input type="checkbox" checked className="w-4 h-4 text-[var(--accent)] bg-black border-zinc-700 rounded focus:ring-[var(--accent)]" />
                                    </div>
                                    
                                    <div className="space-y-1 mt-2">
                                        <label className="text-xs font-bold text-[var(--text-muted)]">Rotation Strategy</label>
                                        <select className="w-full bg-black/80 border border-[var(--card-border)] rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-[var(--accent)] focusable">
                                            <option value="latency">Latency Optimized (Fastest First)</option>
                                            <option value="quota">Quota Balanced (Spread Usage)</option>
                                            <option value="strict">Strict Priority Fallback</option>
                                        </select>
                                    </div>
                                </div>
                            </div>

                            
                            <div className="space-y-4 md:col-span-2">
                                <h3 className="text-sm font-black text-[var(--accent)] flex items-center space-x-2 drop-shadow-sm">
                                    <i data-lucide="list-ordered" className="w-4 h-4"></i>
                                    <span>Fallback Cascade Priority (Generalist)</span>
                                </h3>
                                
                                <div className="bg-black/60 border border-[var(--card-border)] rounded-xl p-4 shadow-inner space-y-2">
                                     <div className="flex items-center justify-between p-2 rounded border border-zinc-700 bg-black/40">
                                         <div className="flex items-center space-x-3">
                                            <span className="text-xs font-bold text-[var(--accent)] font-mono">1</span>
                                            <span className="text-xs text-white font-semibold">Qwen-2.5-72B-Free (OpenRouter)</span>
                                         </div>
                                         <i data-lucide="grip-vertical" className="w-4 h-4 text-zinc-600 cursor-move"></i>
                                     </div>
                                     <div className="flex items-center justify-between p-2 rounded border border-zinc-700 bg-black/40">
                                        <div className="flex items-center space-x-3">
                                           <span className="text-xs font-bold text-[var(--accent)] font-mono">2</span>
                                           <span className="text-xs text-white font-semibold">Llama-3-70B-Free (OpenRouter)</span>
                                        </div>
                                        <i data-lucide="grip-vertical" className="w-4 h-4 text-zinc-600 cursor-move"></i>
                                    </div>
                                    <div className="flex items-center justify-between p-2 rounded border border-zinc-700 bg-black/40 opacity-70">
                                        <div className="flex items-center space-x-3">
                                           <span className="text-xs font-bold text-[var(--text-muted)] font-mono">3</span>
                                           <span className="text-xs text-white font-semibold">Local Mock Offline Provider (Air-Gapped)</span>
                                        </div>
                                        <i data-lucide="lock" className="w-4 h-4 text-zinc-600"></i>
                                    </div>
                                    <p className="text-[9px] text-zinc-500 font-medium pt-1">
                                        Level 3 generalist fallbacks are engaged only when Level 1 Agent Preferences and Level 2 Category Defaults throw 429/402 exceptions.
                                    </p>
                                </div>
                            </div>

                        </div>

                        <div className="flex justify-end space-x-3 pt-6 border-t border-[var(--card-border)] mt-auto">
                            <button className="px-5 py-2 rounded-lg bg-transparent hover:bg-white/5 text-xs font-bold border border-[var(--card-border)] transition focusable">Revert</button>
                            <button className="px-5 py-2 rounded-lg bg-[var(--accent)] hover:bg-white text-black font-black text-xs transition shadow-[0_0_20px_var(--accent-glow)] focusable">Commit Policy</button>
                        </div>
                    </div>
                </div>

                
                <div className="w-full lg:w-80 flex flex-col space-y-6">
                    
                    <div className="glow-card rounded-2xl p-5 relative overflow-hidden transition-colors duration-300">
                        <div className="flex items-center justify-between border-b border-[var(--card-border)] pb-3 mb-4">
                            <div className="flex items-center space-x-2 text-green-400 drop-shadow-sm">
                                <i data-lucide="shield-check" className="w-4 h-4"></i>
                                <h3 className="font-bold text-xs tracking-wider uppercase text-white">Financial Guardrails</h3>
                            </div>
                            <span className="text-[9px] text-[var(--accent)] font-bold uppercase tracking-wider font-mono border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-1 rounded shadow-[0_0_8px_var(--glow-color)]">SECURED</span>
                        </div>

                        <div className="space-y-3 text-xs">
                            <div className="flex items-start space-x-2 border-b border-[var(--card-border)] pb-2">
                                <i data-lucide="check-circle-2" className="w-4 h-4 text-[var(--accent)] mt-0.5"></i>
                                <div>
                                    <span className="font-bold block text-white">Zero Cloud Dependency</span>
                                    <p className="text-[10px] text-zinc-500 font-medium">RouteSwitch intercepts and blocks any paid API request if a valid key is missing.</p>
                                </div>
                            </div>
                            <div className="flex items-start space-x-2 border-b border-[var(--card-border)] pb-2">
                                <i data-lucide="check-circle-2" className="w-4 h-4 text-[var(--accent)] mt-0.5"></i>
                                <div>
                                    <span className="font-bold block text-white">Pino Redaction Layer</span>
                                    <p className="text-[10px] text-zinc-500 font-medium">All API keys and provider credentials are stripped at the serializer level before logging.</p>
                                </div>
                            </div>
                            <div className="flex items-start space-x-2">
                                <i data-lucide="check-circle-2" className="w-4 h-4 text-[var(--accent)] mt-0.5"></i>
                                <div>
                                    <span className="font-bold block text-white">Idempotent Networking</span>
                                    <p className="text-[10px] text-zinc-500 font-medium">Network timeouts trigger local fallbacks instead of endless retries, preventing runaways.</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

            </div>
        </main>
    </div>

    
    <footer className="w-full h-8 bg-black border-t border-[var(--card-border)] px-4 flex items-center justify-between text-[10px] text-zinc-600 font-mono z-25 relative transition-colors duration-300">
        <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-1.5">
                <span className="w-2 h-2 rounded-full bg-[var(--accent)] animate-pulse shadow-[0_0_8px_var(--accent)]"></span>
                <span className="font-bold text-[var(--accent)] uppercase drop-shadow-sm">RouteSwitch Gateway Online</span>
            </div>
            <span>|</span>
            <span>Policy: <strong className="text-white">Strict Rotation</strong></span>
            <span>|</span>
            <span>Database: <strong className="text-white">BaseVault.db</strong></span>
        </div>
        <div className="flex items-center space-x-4">
            <span>Quota Blocks Today: <strong className="text-green-400 font-bold">14</strong></span>
            <span>|</span>
            <span>Node.js: <strong className="text-white">v22 LTS</strong></span>
        </div>
    </footer>

    
    <div id="chat-sentinel" className="fixed bottom-12 right-6 z-50 flex flex-col items-end">
        <button  className="w-12 h-12 rounded-full bg-[var(--accent)] text-black flex items-center justify-center shadow-[0_0_25px_var(--accent-glow)] hover:scale-105 transform transition duration-200 focusable" aria-label="Toggle Cerebro chatbot assistant">
            <i data-lucide="bot-message-square" className="w-6 h-6"></i>
        </button>

        <div id="chat-box" className="w-80 h-96 bg-[var(--bg-surface-glass)] backdrop-blur-xl border border-[var(--card-border)] rounded-2xl shadow-[0_0_30px_rgba(0,0,0,0.9)] mt-3 hidden flex-col overflow-hidden transition-all duration-300">
            <div className="bg-black/90 p-3 flex items-center justify-between border-b border-[var(--card-border)]">
                <div className="flex items-center space-x-2">
                    <span className="w-2 h-2 rounded-full bg-[var(--accent)] shadow-[0_0_8px_var(--accent)]"></span>
                    <span className="text-xs font-bold tracking-wide uppercase text-white">Cerebro Assist Sentinel</span>
                </div>
                <button  className="text-zinc-500 hover:text-[var(--accent)] transition">
                    <i data-lucide="minus" className="w-4 h-4"></i>
                </button>
            </div>

            <div id="chat-conversation" className="flex-1 overflow-y-auto p-4 space-y-3 text-xs">
                <div className="bg-black border border-[var(--accent)]/30 p-2.5 rounded-xl rounded-tl-none self-start max-w-[85%] leading-relaxed text-zinc-300 shadow-[0_0_10px_var(--glow-color)]">
                    <span className="font-black text-[10px] text-[var(--accent)] block mb-1">CEREBRO:</span>
                    Welcome, Billie. Let us synthesize and map your network topology. Ask me anything about Free Mode Governor logic, fallback cascades, or dynamic provider registry limits.
                </div>
            </div>

            <div className="p-2 border-t border-[var(--card-border)] bg-black/80 flex items-center space-x-1">
                <input id="chat-input-field" type="text" placeholder="Query routing policy..." className="flex-1 bg-black/60 border border-[var(--card-border)] text-xs rounded-lg px-3 py-2 text-white focus:outline-none focus:border-[var(--accent)] focus:shadow-[0_0_10px_var(--glow-color)]"  />
                <button  className="p-2 bg-[var(--accent)] text-black rounded-lg transition focusable hover:bg-white hover:shadow-[0_0_15px_var(--accent-glow)]">
                    <i data-lucide="send" className="w-3.5 h-3.5"></i>
                </button>
            </div>
        </div>
    </div>

    
    

    </>
  );
}
