
import React, { useState, useEffect } from 'react';


export function ScoutDaemonDashboard() {
  useEffect(() => {
    // Make sure lucid icons render on initial mount
    try {
      (window as any).lucide?.createIcons();
    } catch(e) {}
  }, []);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        /* CSS Variable System for Stealth Black & High-Glow Purple Morphing */
        :root {
            /* Dark Mode: Deep Stealth Black & High-Contrast Purple Glow */
            --bg-base: #000000; 
            --bg-surface: #050505;
            --bg-surface-glass: rgba(5, 5, 5, 0.45); 
            --bg-nested: rgba(142, 36, 170, 0.05); /* Purple nested bg */
            
            /* Maximized Glow Values */
            --border-glow: rgba(142, 36, 170, 0.35);
            --text-primary: #fafafa;
            --text-muted: #8f8f9d;
            --accent: #8E24AA; /* ScoutDaemon Logo Purple */
            --accent-glow: rgba(142, 36, 170, 0.75); /* Pumped up neon glow */
            --card-border: rgba(30, 20, 35, 0.8);
            --grid-color: rgba(142, 36, 170, 0.08); /* Stronger grid contrast */
            --grid-line: rgba(255, 255, 255, 0.03);
            --glow-color: rgba(142, 36, 170, 0.25);
            --terminal-bg: #030303;
            --terminal-text: #d05ce3; /* Slightly lighter purple for text readability */
        }

        .light {
            /* Light Mode: Structured Paper & Deep Purple */
            --bg-base: #f8fafc;
            --bg-surface: #ffffff;
            --bg-surface-glass: rgba(255, 255, 255, 0.85);
            --bg-nested: rgba(107, 33, 168, 0.04);
            --border-glow: rgba(107, 33, 168, 0.1);
            --text-primary: #0f172a;
            --text-muted: #64748b;
            --accent: #7e22ce;
            --accent-glow: rgba(107, 33, 168, 0.25);
            --card-border: rgba(203, 213, 225, 0.8);
            --grid-color: rgba(107, 33, 168, 0.03);
            --grid-line: rgba(107, 33, 168, 0.03);
            --glow-color: rgba(107, 33, 168, 0.05);
            --terminal-bg: #0f172a;
            --terminal-text: #d8b4fe;
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
            border-color: rgba(142, 36, 170, 0.6);
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

        /* Sensing Stream Line Connector */
        .stream-connector::before {
            content: '';
            position: absolute;
            top: 24px;
            left: 11px;
            bottom: -16px;
            width: 2px;
            background: var(--card-border);
            z-index: 0;
        }
        .stream-item:last-child .stream-connector::before {
            display: none;
        }

        /* Danger / Kill Switch Styling */
        .kill-switch {
            background: rgba(220, 38, 38, 0.1);
            border: 1px solid rgba(220, 38, 38, 0.4);
            box-shadow: 0 0 15px rgba(220, 38, 38, 0.2) inset;
        }
        .kill-switch:hover {
            background: rgba(220, 38, 38, 0.2);
            border-color: rgba(220, 38, 38, 0.8);
            box-shadow: 0 0 25px rgba(220, 38, 38, 0.4) inset, 0 0 15px rgba(220, 38, 38, 0.3);
        }
    ` }} />
      

    
    <header className="w-full h-16 border-b border-[var(--card-border)] bg-[var(--bg-surface-glass)] backdrop-blur-md px-6 flex items-center justify-between z-40 fixed top-0 left-0 transition-colors duration-300">
        <div className="flex items-center space-x-3">
            
            <button  className="w-9 h-9 rounded-lg border border-[var(--card-border)] bg-[var(--bg-nested)] hover:border-zinc-500 flex items-center justify-center text-[var(--terminal-text)] focusable transition-colors shadow-[0_0_8px_var(--glow-color)]" aria-label="Open Suite Switcher Menu">
                <i data-lucide="menu" className="w-5 h-5"></i>
            </button>

            
            <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-black/20 border border-[var(--card-border)] shadow-[0_0_12px_var(--glow-color)]">
                <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" className="w-7 h-7 text-[var(--accent)]">
                    <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.3"/>
                    <circle cx="50" cy="50" r="30" fill="none" stroke="currentColor" strokeWidth="1.5" stroke-dasharray="6 6" opacity="0.6"/>
                    <g transform="translate(50,50) scale(0.5) translate(-50,-50)">
                        <g transform="rotate(45,50,50)">
                            <path d="M 56 85 L 56 68 L 60 68 L 60 45 L 75 30 L 75 10 L 58 10 L 58 28 L 42 28 L 42 10 L 25 10 L 25 30 L 40 45 L 40 68 L 44 68 L 44 85 Z" fill="rgba(142,36,170,0.15)" stroke="currentColor" strokeWidth="4" strokeLinejoin="round"/>
                            <rect x="46" y="74" width="3" height="5" fill="#0D0E15"/>
                            <rect x="51" y="74" width="3" height="5" fill="#0D0E15"/>
                            <rect x="48" y="40" width="4" height="24" rx="2" fill="currentColor" />
                        </g>
                    </g>
                </svg>
            </div>
            
            <div className="hidden sm:block ml-1">
                <span className="font-black text-sm tracking-wider uppercase text-[var(--text-primary)]" style={{ textShadow: '0 0 8px var(--glow-color)' }}>SCOUTDAEMON ENGINE</span>
                <span className="text-[9px] uppercase font-bold text-[var(--terminal-text)] tracking-widest block -mt-1 drop-shadow-md">NeuroSync Sovereign Suite</span>
            </div>
        </div>

        
        <div className="flex bg-[var(--bg-nested)] p-1 rounded-xl border border-[var(--card-border)] items-center space-x-1 shadow-[0_0_10px_var(--glow-color)]" role="tablist" aria-label="Daemon Navigation">
            <button id="tab-dashboard"  className="px-5 py-1.5 rounded-lg text-sm font-semibold transition-all duration-200 flex items-center space-x-2 text-white bg-[var(--accent)] shadow-[0_0_15px_var(--accent-glow)] focusable" role="tab" aria-selected="true" aria-controls="panel-dashboard">
                <i data-lucide="radar" className="w-4 h-4 text-white"></i>
                <span>Sensing</span>
            </button>
            <button id="tab-setups"  className="px-5 py-1.5 rounded-lg text-sm font-semibold transition-all duration-200 flex items-center space-x-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] focusable hover:shadow-[0_0_10px_var(--glow-color)]" role="tab" aria-selected="false" aria-controls="panel-setups">
                <i data-lucide="cpu" className="w-4 h-4"></i>
                <span>Governance</span>
            </button>
        </div>

        
        <div className="flex items-center space-x-2">
            <button  className="w-9 h-9 rounded-lg border border-[var(--card-border)] bg-[var(--bg-nested)] hover:border-[var(--accent)] hover:shadow-[0_0_15px_var(--accent-glow)] flex items-center justify-center transition-all focusable" aria-label="Toggle visual theme">
                <i id="theme-icon" data-lucide="sun" className="w-4 h-4 text-[var(--terminal-text)]"></i>
            </button>
            <button className="w-9 h-9 rounded-lg border border-[var(--card-border)] bg-[var(--bg-nested)] hover:border-[var(--accent)] hover:shadow-[0_0_15px_var(--accent-glow)] flex items-center justify-center transition-all focusable" aria-label="Toggle system cognitive tags schema">
                <i data-lucide="database" className="w-4 h-4 text-[var(--terminal-text)]"></i>
            </button>
            <button  className="w-9 h-9 rounded-lg border border-[var(--card-border)] bg-[var(--bg-nested)] hover:border-[var(--accent)] hover:shadow-[0_0_15px_var(--accent-glow)] flex items-center justify-center text-[var(--terminal-text)] focusable" aria-label="Toggle command workspace panel">
                <i data-lucide="sidebar" className="w-5 h-5"></i>
            </button>
        </div>
    </header>

    
    <aside id="suite-switcher" className="fixed left-0 top-16 h-[calc(100vh-4rem)] w-72 bg-[var(--bg-surface-glass)] backdrop-blur-xl border-r border-[var(--card-border)] z-30 transition-transform duration-300 transform -translate-x-full shadow-[5px_0_25px_rgba(0,0,0,0.9)] flex flex-col">
        <div className="p-4 border-b border-[var(--card-border)] flex items-center justify-between">
            <div className="flex items-center space-x-2 text-[var(--terminal-text)] drop-shadow-md">
                <i data-lucide="compass" className="w-4 h-4"></i>
                <h3 className="font-bold text-xs tracking-wider uppercase">Sovereign Suite Switcher</h3>
            </div>
            <button  className="p-1 rounded hover:bg-[var(--accent)]/20 text-[var(--text-muted)] hover:text-[var(--terminal-text)] transition" aria-label="Close suite navigation">
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
            <button className="w-full flex items-center p-3 rounded-xl hover:bg-[var(--bg-nested)] border border-transparent hover:border-[var(--card-border)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition text-left focusable">
                <i data-lucide="shuffle" className="w-4 h-4 mr-3"></i>
                <span className="text-xs font-bold uppercase tracking-wider">RouteSwitch (Router)</span>
            </button>
            <button className="w-full flex items-center p-3 rounded-xl hover:bg-[var(--bg-nested)] border border-transparent hover:border-[var(--card-border)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition text-left focusable">
                <i data-lucide="file-question" className="w-4 h-4 mr-3"></i>
                <span className="text-xs font-bold uppercase tracking-wider">ScopeLogic (Proposal)</span>
            </button>
            <a href="#" className="flex items-center justify-between p-3 rounded-xl bg-[var(--accent)]/15 border border-[var(--accent)] text-[var(--text-primary)] transition focusable shadow-[0_0_20px_var(--glow-color)]">
                <div className="flex items-center space-x-3">
                    <i data-lucide="radar" className="w-4 h-4 text-[var(--terminal-text)]"></i>
                    <span className="text-xs font-bold uppercase tracking-wider text-white" style={{ textShadow: '0 0 5px var(--accent-glow)' }}>ScoutDaemon (Predictive)</span>
                </div>
                <span className="w-2 h-2 rounded-full bg-[var(--terminal-text)] animate-pulse shadow-[0_0_12px_var(--terminal-text)]"></span>
            </a>
        </nav>
        <div className="p-4 border-t border-[var(--card-border)] bg-zinc-900/40 text-[10px] text-[var(--terminal-text)]/60 font-mono flex flex-col space-y-1">
            <span>Proactive Foresight Vanguard</span>
            <span>OS-Level Decoupling Active</span>
        </div>
    </aside>

    
    <aside id="sidebar-panel" className="fixed right-0 top-16 h-[calc(100vh-4rem)] w-80 bg-[var(--bg-surface-glass)] backdrop-blur-xl border-l border-[var(--card-border)] z-30 transition-transform duration-300 transform translate-x-0 shadow-[-5px_0_25px_rgba(0,0,0,0.9)] flex flex-col">
        <div className="p-4 border-b border-[var(--card-border)] flex items-center justify-between">
            <div className="flex items-center space-x-2 text-[var(--terminal-text)] drop-shadow-md">
                <i data-lucide="activity" className="w-4 h-4"></i>
                <h3 className="font-bold text-sm tracking-wider uppercase">Hardware Telemetry</h3>
            </div>
            <button  className="p-1 rounded hover:bg-[var(--accent)]/20 text-[var(--text-muted)] hover:text-[var(--terminal-text)] transition" aria-label="Close panel">
                <i data-lucide="x" className="w-4 h-4"></i>
            </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-5">
            
            <div className="space-y-2">
                <label className="text-xs font-semibold text-[var(--text-muted)] tracking-wider uppercase block">System Load Averages</label>
                <div className="space-y-2">
                    <div className="flex items-center justify-between p-2 rounded-lg bg-black/60 border border-[var(--card-border)]">
                        <div className="flex items-center space-x-2">
                            <i data-lucide="cpu" className="w-3.5 h-3.5 text-zinc-400"></i>
                            <span className="text-xs font-bold text-zinc-300">os.loadavg() [1m]</span>
                        </div>
                        <span id="loadavg-1" className="text-xs font-mono font-bold text-green-400 drop-shadow-sm">0.42</span>
                    </div>
                    <div className="flex items-center justify-between p-2 rounded-lg bg-black/60 border border-[var(--card-border)]">
                        <div className="flex items-center space-x-2">
                            <i data-lucide="cpu" className="w-3.5 h-3.5 text-zinc-400"></i>
                            <span className="text-xs font-bold text-zinc-300">os.loadavg() [5m]</span>
                        </div>
                        <span id="loadavg-5" className="text-xs font-mono font-bold text-zinc-400">0.85</span>
                    </div>
                    <p className="text-[9px] text-zinc-500 font-medium">
                        ScoutDaemon algorithms dynamically sleep if the 1-minute load average breaches safe thresholds, preventing event loop starvation.
                    </p>
                </div>
            </div>

            
            <div className="bg-[var(--bg-nested)] border border-[var(--card-border)] rounded-lg p-3 space-y-3 shadow-[0_0_15px_var(--glow-color)]">
                <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[var(--terminal-text)] uppercase tracking-wider flex items-center space-x-1.5 drop-shadow-md">
                        <i data-lucide="rss" className="w-3.5 h-3.5"></i>
                        <span>Passive SSE Streams</span>
                    </span>
                    <span className="px-1.5 py-0.5 bg-[var(--accent)]/10 text-[var(--terminal-text)] rounded text-[9px] uppercase font-bold tracking-widest border border-[var(--accent)]/30">2 Sockets</span>
                </div>
                <div className="space-y-1">
                    <div className="flex justify-between text-[11px] font-mono">
                        <span className="text-zinc-300 font-semibold">GitHub Repo Webhook</span>
                        <span className="text-green-400 font-bold animate-pulse">LISTENING</span>
                    </div>
                    <div className="flex justify-between text-[11px] font-mono">
                        <span className="text-zinc-300 font-semibold">Market Pricing Ticker</span>
                        <span className="text-green-400 font-bold animate-pulse">LISTENING</span>
                    </div>
                    <div className="flex justify-between text-[11px] font-mono">
                        <span className="text-zinc-500 font-semibold">Active Web Polling</span>
                        <span className="text-zinc-600 font-bold">DISABLED</span>
                    </div>
                </div>
                <p className="text-[10px] text-zinc-500 leading-relaxed font-medium pt-1 border-t border-[var(--card-border)]">
                    ScoutDaemon utilizes passive Server-Sent Events (SSE) to eliminate continuous active polling, protecting CPU thermals and API quotas.
                </p>
            </div>
        </div>

        <div className="p-3 border-t border-[var(--card-border)] bg-zinc-900/40 text-[10px] text-[var(--terminal-text)]/60 font-mono text-center flex items-center justify-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-green-500"></span>
            <span>Thermal Equilibrium: <strong className="text-green-400 font-bold drop-shadow-sm">Stable</strong></span>
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
                                <h1 className="text-xl font-black tracking-wide text-white drop-shadow-md">Proactive Foresight Engine</h1>
                                <p className="text-[11px] text-[var(--text-muted)] mt-0.5 font-bold uppercase tracking-wider">Live Environment Sensing: <span className="text-[var(--terminal-text)] drop-shadow-sm">Passive SSE Ingestion Stream</span></p>
                            </div>
                            <button  className="px-4 py-2 rounded-lg bg-[var(--accent)] hover:bg-white text-white hover:text-black text-xs font-black flex items-center space-x-2 transition-all shadow-[0_0_20px_var(--accent-glow)] focusable">
                                <i data-lucide="satellite" className="w-3.5 h-3.5"></i>
                                <span>Force SSE Ping</span>
                            </button>
                        </div>

                        
                        <div className="flex-1 overflow-y-auto px-2 py-4 space-y-4" id="sensing-container">
                            
                            
                            <div className="stream-item relative pl-10">
                                <div className="stream-connector">
                                    <div className="absolute left-0 top-1 w-6 h-6 rounded-full bg-zinc-900 border border-zinc-700 flex items-center justify-center z-10">
                                        <i data-lucide="moon" className="w-3 h-3 text-zinc-500"></i>
                                    </div>
                                </div>
                                <div className="p-3 rounded-xl bg-black/60 border border-zinc-800">
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="text-xs font-bold text-zinc-400">Respectful Guest Protocol</span>
                                        <span className="text-[9px] px-1.5 py-0.5 bg-zinc-800 text-zinc-400 rounded border border-zinc-700 font-mono">SLEEPING</span>
                                    </div>
                                    <p className="text-[10px] text-zinc-500 font-mono">ScoutDaemon intentionally idle during CoreExec high-load window.</p>
                                </div>
                            </div>

                            
                            <div className="stream-item relative pl-10" id="primary-stream">
                                <div className="stream-connector">
                                    <div className="absolute left-0 top-1 w-6 h-6 rounded-full bg-[var(--accent)]/10 border border-[var(--accent)] flex items-center justify-center z-10 shadow-[0_0_12px_var(--accent-glow)]">
                                        <i data-lucide="zap" className="w-3 h-3 text-[var(--terminal-text)]"></i>
                                    </div>
                                </div>
                                <div className="p-3 rounded-xl border border-[var(--accent)]/40 bg-[var(--accent)]/5">
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="text-xs font-bold text-white">Passive Webhook Intercept</span>
                                        <span className="text-[9px] px-1.5 py-0.5 bg-[var(--accent)]/20 text-[var(--terminal-text)] rounded border border-[var(--accent)]/30 font-mono">SSE TRIGGERED</span>
                                    </div>
                                    <p className="text-[10px] text-zinc-400 font-mono">Source: <span className="text-[var(--terminal-text)]">OpenRouter API Docs (Changelog)</span></p>
                                    <p className="text-[10px] text-zinc-500 italic mt-1 border-t border-[var(--accent)]/20 pt-1">Detected new provider schema configuration delta.</p>
                                </div>
                            </div>

                            
                            <div className="stream-item relative pl-10 opacity-50" id="ledger-route">
                                <div className="stream-connector">
                                    <div className="absolute left-0 top-1 w-6 h-6 rounded-full bg-zinc-900 border border-zinc-700 flex items-center justify-center z-10">
                                        <i data-lucide="inbox" className="w-3 h-3 text-zinc-500"></i>
                                    </div>
                                </div>
                                <div className="border border-[var(--card-border)] bg-black/40 p-3 rounded-xl">
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="text-xs font-bold text-white">Quarantine Staging</span>
                                        <span className="text-[9px] px-1.5 py-0.5 bg-zinc-800 text-zinc-400 rounded border border-zinc-700 font-mono">AWAITING</span>
                                    </div>
                                    <p className="text-[10px] text-zinc-500 font-mono">Preparing to push discovery to os_todos table for human review...</p>
                                </div>
                            </div>

                        </div>
                    </div>
                </div>

                
                <div className="w-full lg:w-80 flex flex-col space-y-6">
                    
                    
                    <div className="glow-card rounded-2xl p-5 relative overflow-hidden transition-colors duration-300">
                        <div className="flex items-center justify-between border-b border-[var(--card-border)] pb-3 mb-4">
                            <div className="flex items-center space-x-2 text-[var(--terminal-text)] drop-shadow-md">
                                <i data-lucide="list-todo" className="w-4 h-4"></i>
                                <h3 className="font-bold text-xs tracking-wider uppercase">Global To-Do Ledger</h3>
                            </div>
                            <span className="text-[9px] font-mono text-zinc-500 font-bold">os_todos active</span>
                        </div>

                        
                        <div className="space-y-3" id="todo-ledger-list">
                            <div className="bg-black/60 p-3 rounded-xl border border-orange-500/30 shadow-inner">
                                <div className="flex items-start justify-between">
                                    <div>
                                        <span className="text-[10px] font-bold text-white block mb-0.5">Authentication Required</span>
                                        <span className="text-[9px] text-zinc-400 font-mono">Target: RouteSwitch Integration</span>
                                    </div>
                                    <i data-lucide="key" className="w-3.5 h-3.5 text-orange-400"></i>
                                </div>
                                <div className="mt-2 flex justify-end">
                                    <button className="text-[9px] font-bold text-black bg-orange-500 hover:bg-orange-400 px-2 py-1 rounded">Provide 2FA</button>
                                </div>
                            </div>
                            
                            <div className="bg-black/60 p-3 rounded-xl border border-[var(--card-border)] shadow-inner opacity-60">
                                <div className="flex items-start justify-between">
                                    <div>
                                        <span className="text-[10px] font-bold text-white block mb-0.5">Low Confidence DAG</span>
                                        <span className="text-[9px] text-zinc-400 font-mono">Target: CoreExec wf_298</span>
                                    </div>
                                    <i data-lucide="shield-alert" className="w-3.5 h-3.5 text-zinc-400"></i>
                                </div>
                                <div className="mt-2 flex justify-end">
                                    <button className="text-[9px] font-bold text-white bg-zinc-800 hover:bg-zinc-700 px-2 py-1 rounded">Review Intent</button>
                                </div>
                            </div>
                        </div>
                    </div>

                    
                    <div className="flex-1 flex flex-col min-h-[250px]">
                        <div className="flex items-center justify-between mb-2">
                            <label className="text-xs font-semibold text-[var(--text-muted)] tracking-wider uppercase">ScoutDaemon Logs</label>
                        </div>
                        <div id="pino-logger" className="flex-1 bg-black border border-[var(--card-border)] rounded-xl p-3 font-mono text-[9px] text-zinc-400 overflow-y-auto space-y-1.5 shadow-inner">
                            <div><span className="text-zinc-600">[08:12:01]</span> SCOUTDAEMON: Initializing independent OS process...</div>
                            <div><span className="text-zinc-600">[08:12:02]</span> SENSING: Establishing SSE connections. Active polling disabled.</div>
                            <div className="text-zinc-500"><span className="text-zinc-600">[08:15:10]</span> IDLE_DETECT: os.loadavg() &gt; 0.8. Sleeping background threads to protect CoreExec.</div>
                            <div className="text-zinc-500"><span className="text-zinc-600">[08:22:15]</span> IDLE_DETECT: Load normalized. Resuming passive observation.</div>
                        </div>
                    </div>

                </div>
            </div>

            
            <div id="panel-setups" className="flex-1 hidden flex-col lg:flex-row space-y-6 lg:space-y-0 lg:space-x-6 w-full animate-fade-in" role="tabpanel" aria-labelledby="tab-setups">
                
                
                <div className="flex-1 glow-card rounded-2xl p-5 flex flex-col relative overflow-hidden transition-colors duration-300">
                    <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(circle at top, var(--grid-color) 0%, transparent 75%)" }}></div>

                    <div className="relative z-10 flex flex-col h-full space-y-4">
                        <div className="border-b border-[var(--card-border)] pb-3">
                            <h1 className="text-xl font-black tracking-wide text-white drop-shadow-md">Resource & Hardware Governance</h1>
                            <p className="text-xs text-[var(--text-muted)] mt-0.5 font-medium">Configure hardware-adaptive idle detection, background core affinity, and manual kill overrides.</p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                            
                            
                            <div className="space-y-4">
                                <h3 className="text-sm font-black text-[var(--terminal-text)] flex items-center space-x-2 drop-shadow-sm">
                                    <i data-lucide="cpu" className="w-4 h-4"></i>
                                    <span>Idle-Detection Thresholds</span>
                                </h3>

                                <div className="space-y-4 bg-black/60 border border-[var(--card-border)] rounded-xl p-4 shadow-inner">
                                    <div className="space-y-2">
                                        <div className="flex justify-between text-xs font-bold">
                                            <span className="text-[var(--text-muted)]">Max 1m Load Average</span>
                                            <span id="load-display" className="text-[var(--terminal-text)] font-mono">0.80 (Aggressive Sleep)</span>
                                        </div>
                                        <input type="range" min="20" max="200" step="10" value="80" onInput={() => {}} className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-[var(--accent)] shadow-[0_0_10px_var(--accent-glow)]" />
                                        <p className="text-[9px] text-zinc-500 font-medium">ScoutDaemon strictly operates as a "respectful guest". It will sleep if the host OS CPU load exceeds this limit.</p>
                                    </div>
                                    
                                    <div className="flex items-center justify-between p-2 rounded bg-black/80 border border-[var(--card-border)]">
                                        <div>
                                            <span className="text-xs font-bold text-white block">Passive Ingestion Only (No Polling)</span>
                                            <span className="text-[9px] text-zinc-500 font-semibold block">Restrict to SSE / WebSockets to save battery</span>
                                        </div>
                                        <input type="checkbox" checked className="w-4 h-4 text-[var(--accent)] bg-black border-zinc-700 rounded focus:ring-[var(--accent)]" />
                                    </div>
                                </div>
                            </div>

                            
                            <div className="space-y-4">
                                <h3 className="text-sm font-black text-[var(--terminal-text)] flex items-center space-x-2 drop-shadow-sm">
                                    <i data-lucide="microchip" className="w-4 h-4"></i>
                                    <span>Background Core Affinity</span>
                                </h3>

                                <div className="space-y-3 bg-black/60 border border-[var(--card-border)] rounded-xl p-4 shadow-inner">
                                    <p className="text-[10px] text-zinc-400 font-medium pb-2 border-b border-[var(--card-border)]">
                                        Bind ScoutDaemon to low-priority CPU cores (via `taskset`) to guarantee CoreExec isolation.
                                    </p>
                                    
                                    <div className="grid grid-cols-2 gap-2 mt-2">
                                        <label className="flex items-center space-x-2 p-1.5 rounded bg-black/80 border border-[var(--card-border)] cursor-pointer hover:border-zinc-500">
                                            <input type="checkbox" className="w-3.5 h-3.5 text-[var(--accent)] bg-black border-zinc-700 rounded focus:ring-[var(--accent)]" />
                                            <span className="text-xs font-bold text-white font-mono">CPU 0</span>
                                        </label>
                                        <label className="flex items-center space-x-2 p-1.5 rounded bg-black/80 border border-[var(--card-border)] cursor-pointer hover:border-zinc-500">
                                            <input type="checkbox" className="w-3.5 h-3.5 text-[var(--accent)] bg-black border-zinc-700 rounded focus:ring-[var(--accent)]" />
                                            <span className="text-xs font-bold text-white font-mono">CPU 1</span>
                                        </label>
                                        <label className="flex items-center space-x-2 p-1.5 rounded bg-black/80 border border-[var(--accent)]/50 cursor-pointer hover:border-[var(--accent)]">
                                            <input type="checkbox" checked className="w-3.5 h-3.5 text-[var(--accent)] bg-black border-zinc-700 rounded focus:ring-[var(--accent)]" />
                                            <span className="text-xs font-bold text-[var(--terminal-text)] font-mono">CPU 2 (E-Core)</span>
                                        </label>
                                        <label className="flex items-center space-x-2 p-1.5 rounded bg-black/80 border border-[var(--accent)]/50 cursor-pointer hover:border-[var(--accent)]">
                                            <input type="checkbox" checked className="w-3.5 h-3.5 text-[var(--accent)] bg-black border-zinc-700 rounded focus:ring-[var(--accent)]" />
                                            <span className="text-xs font-bold text-[var(--terminal-text)] font-mono">CPU 3 (E-Core)</span>
                                        </label>
                                    </div>
                                </div>
                            </div>

                            
                            <div className="space-y-4 md:col-span-2 mt-4 pt-4 border-t border-[var(--card-border)]">
                                <h3 className="text-sm font-black text-red-500 flex items-center space-x-2 drop-shadow-sm">
                                    <i data-lucide="power-off" className="w-4 h-4"></i>
                                    <span>OS-Level Decoupling</span>
                                </h3>
                                
                                <div className="bg-black/60 border border-[var(--card-border)] rounded-xl p-5 shadow-inner flex items-center justify-between">
                                    <div className="max-w-md">
                                        <span className="text-sm font-bold text-white block mb-1">Manual Kill Override</span>
                                        <p className="text-[10px] text-zinc-400 font-medium leading-relaxed">
                                            If thermal sensors spike or you observe excessive fan noise, this switch will instantly send a SIGKILL to the independent ScoutDaemon OS process. This guarantees zero disruption to your active, synchronous CoreExec workflows.
                                        </p>
                                    </div>
                                    <button className="kill-switch px-6 py-3 rounded-xl text-red-400 font-black text-xs uppercase tracking-widest transition flex items-center space-x-2 focusable">
                                        <i data-lucide="skull" className="w-4 h-4"></i>
                                        <span>Terminate Daemon</span>
                                    </button>
                                </div>
                            </div>

                        </div>

                        <div className="flex justify-end space-x-3 pt-6 border-t border-[var(--card-border)] mt-auto">
                            <button className="px-5 py-2 rounded-lg bg-transparent hover:bg-white/5 text-xs font-bold border border-[var(--card-border)] transition focusable">Revert</button>
                            <button className="px-5 py-2 rounded-lg bg-[var(--accent)] hover:bg-white text-white hover:text-black font-black text-xs transition shadow-[0_0_20px_var(--accent-glow)] focusable">Commit Governance</button>
                        </div>
                    </div>
                </div>

                
                <div className="w-full lg:w-80 flex flex-col space-y-6">
                    
                    <div className="glow-card rounded-2xl p-5 relative overflow-hidden transition-colors duration-300">
                        <div className="flex items-center justify-between border-b border-[var(--card-border)] pb-3 mb-4">
                            <div className="flex items-center space-x-2 text-[var(--terminal-text)] drop-shadow-sm">
                                <i data-lucide="lock" className="w-4 h-4"></i>
                                <h3 className="font-bold text-xs tracking-wider uppercase text-white">Quarantine Rules</h3>
                            </div>
                            <span className="text-[9px] text-[var(--terminal-text)] font-bold uppercase tracking-wider font-mono border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-1 rounded shadow-[0_0_8px_var(--glow-color)]">DRAFT ONLY</span>
                        </div>

                        <div className="space-y-3 text-xs">
                            <div className="flex items-start space-x-2 border-b border-[var(--card-border)] pb-2">
                                <i data-lucide="check-circle-2" className="w-4 h-4 text-[var(--terminal-text)] mt-0.5"></i>
                                <div>
                                    <span className="font-bold block text-white">Foresight Partitioning</span>
                                    <p className="text-[10px] text-zinc-500 font-medium">ScoutDaemon research is written exclusively to an isolated partition, never polluting verified project memory.</p>
                                </div>
                            </div>
                            <div className="flex items-start space-x-2 border-b border-[var(--card-border)] pb-2">
                                <i data-lucide="check-circle-2" className="w-4 h-4 text-[var(--terminal-text)] mt-0.5"></i>
                                <div>
                                    <span className="font-bold block text-white">No Automatic Execution</span>
                                    <p className="text-[10px] text-zinc-500 font-medium">ScoutDaemon is physically blocked from activating its own discoveries without pushing to the os_todos ledger.</p>
                                </div>
                            </div>
                            <div className="flex items-start space-x-2">
                                <i data-lucide="check-circle-2" className="w-4 h-4 text-[var(--terminal-text)] mt-0.5"></i>
                                <div>
                                    <span className="font-bold block text-white">Read-Only Core Access</span>
                                    <p className="text-[10px] text-zinc-500 font-medium">It observes trajectory to understand goals, but cannot mutate the core baseline.</p>
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
                <span className="w-2 h-2 rounded-full bg-[var(--terminal-text)] animate-pulse shadow-[0_0_8px_var(--accent)]"></span>
                <span className="font-bold text-[var(--terminal-text)] uppercase drop-shadow-sm">ScoutDaemon Vanguard Online</span>
            </div>
            <span>|</span>
            <span>Policy: <strong className="text-white">Respectful Guest Mode</strong></span>
            <span>|</span>
            <span>Ledger: <strong className="text-white">os_todos</strong></span>
        </div>
        <div className="flex items-center space-x-4">
            <span>Discoveries Pending Review: <strong className="text-orange-400 font-bold">2</strong></span>
            <span>|</span>
            <span>Node.js: <strong className="text-white">v22 LTS</strong></span>
        </div>
    </footer>

    
    <div id="chat-sentinel" className="fixed bottom-12 right-6 z-50 flex flex-col items-end">
        <button  className="w-12 h-12 rounded-full bg-[var(--accent)] text-white flex items-center justify-center shadow-[0_0_25px_var(--accent-glow)] hover:scale-105 transform transition duration-200 focusable" aria-label="Toggle Cerebro chatbot assistant">
            <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" className="w-7 h-7 drop-shadow-md">
                <defs>
                    <mask id="wrench-mask">
                        <rect x="0" y="0" width="100" height="100" fill="white" />
                        <rect x="42" y="4" width="16" height="16" fill="black" />
                        <circle cx="50" cy="20" r="8" fill="black" />
                        <circle cx="50" cy="80" r="5" fill="black" />
                    </mask>
                    <filter id="glow">
                        <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="rgba(0,0,0,0.7)"/>
                    </filter>
                </defs>

                
                <g stroke="#FFC107" strokeWidth="2" fill="none" opacity="0.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M 48 25 L 35 20 L 20 35 L 25 50 L 25 65 L 35 75 L 48 65 L 48 45 Z" />
                    <path d="M 20 35 L 48 45 L 25 65" />
                    <path d="M 35 20 L 25 50 L 35 75" />
                    <path d="M 48 25 L 25 50" />
                    <path d="M 52 25 L 65 20 L 80 35 L 75 50 L 75 65 L 65 75 L 52 65 L 52 45 Z" />
                    <path d="M 80 35 L 52 45 L 75 65" />
                    <path d="M 65 20 L 75 50 L 65 75" />
                    <path d="M 52 25 L 75 50" />
                    <path d="M 48 25 L 52 25 M 48 45 L 52 45 M 48 65 L 52 65" stroke-dasharray="2 3" opacity="0.6"/>
                </g>
                <g fill="#FFB300" opacity="0.95">
                    <circle cx="48" cy="25" r="3.5" />
                    <circle cx="35" cy="20" r="3" />
                    <circle cx="20" cy="35" r="3.5" />
                    <circle cx="25" cy="50" r="3" />
                    <circle cx="25" cy="65" r="3" />
                    <circle cx="35" cy="75" r="3.5" />
                    <circle cx="48" cy="65" r="3" />
                    <circle cx="48" cy="45" r="4.5" />
                    <circle cx="52" cy="25" r="3.5" />
                    <circle cx="65" cy="20" r="3" />
                    <circle cx="80" cy="35" r="3.5" />
                    <circle cx="75" cy="50" r="3" />
                    <circle cx="75" cy="65" r="3" />
                    <circle cx="65" cy="75" r="3.5" />
                    <circle cx="52" cy="65" r="3" />
                    <circle cx="52" cy="45" r="4.5" />
                </g>

                
                <g transform="translate(50,50) rotate(45) translate(-50,-50)" mask="url(#wrench-mask)" filter="url(#glow)">
                    <rect x="44" y="25" width="12" height="50" rx="2" fill="#00E5FF" />
                    <circle cx="50" cy="20" r="14" fill="#00E5FF" />
                    <circle cx="50" cy="80" r="12" fill="#00E5FF" />
                </g>
            </svg>
        </button>

        <div id="chat-box" className="w-80 h-96 bg-[var(--bg-surface-glass)] backdrop-blur-xl border border-[var(--card-border)] rounded-2xl shadow-[0_0_30px_rgba(0,0,0,0.9)] mt-3 hidden flex-col overflow-hidden transition-all duration-300">
            <div className="bg-black/90 p-3 flex items-center justify-between border-b border-[var(--card-border)]">
                <div className="flex items-center space-x-2">
                    <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 drop-shadow-md">
                        
                        <g stroke="#FFC107" strokeWidth="2" fill="none" opacity="0.8" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M 48 25 L 35 20 L 20 35 L 25 50 L 25 65 L 35 75 L 48 65 L 48 45 Z" />
                            <path d="M 20 35 L 48 45 L 25 65" />
                            <path d="M 35 20 L 25 50 L 35 75" />
                            <path d="M 48 25 L 25 50" />
                            <path d="M 52 25 L 65 20 L 80 35 L 75 50 L 75 65 L 65 75 L 52 65 L 52 45 Z" />
                            <path d="M 80 35 L 52 45 L 75 65" />
                            <path d="M 65 20 L 75 50 L 65 75" />
                            <path d="M 52 25 L 75 50" />
                            <path d="M 48 25 L 52 25 M 48 45 L 52 45 M 48 65 L 52 65" stroke-dasharray="2 3" opacity="0.6"/>
                        </g>
                        <g fill="#FFB300" opacity="0.95">
                            <circle cx="48" cy="25" r="3.5" />
                            <circle cx="35" cy="20" r="3" />
                            <circle cx="20" cy="35" r="3.5" />
                            <circle cx="25" cy="50" r="3" />
                            <circle cx="25" cy="65" r="3" />
                            <circle cx="35" cy="75" r="3.5" />
                            <circle cx="48" cy="65" r="3" />
                            <circle cx="48" cy="45" r="4.5" />
                            <circle cx="52" cy="25" r="3.5" />
                            <circle cx="65" cy="20" r="3" />
                            <circle cx="80" cy="35" r="3.5" />
                            <circle cx="75" cy="50" r="3" />
                            <circle cx="75" cy="65" r="3" />
                            <circle cx="65" cy="75" r="3.5" />
                            <circle cx="52" cy="65" r="3" />
                            <circle cx="52" cy="45" r="4.5" />
                        </g>
                        <g transform="translate(50,50) rotate(45) translate(-50,-50)" mask="url(#wrench-mask)" filter="url(#glow)">
                            <rect x="44" y="25" width="12" height="50" rx="2" fill="#00E5FF" />
                            <circle cx="50" cy="20" r="14" fill="#00E5FF" />
                            <circle cx="50" cy="80" r="12" fill="#00E5FF" />
                        </g>
                    </svg>
                    <span className="text-xs font-bold tracking-wide uppercase text-white">Cerebro Assist Sentinel</span>
                </div>
                <button  className="text-zinc-500 hover:text-[var(--terminal-text)] transition">
                    <i data-lucide="minus" className="w-4 h-4"></i>
                </button>
            </div>

            <div id="chat-conversation" className="flex-1 overflow-y-auto p-4 space-y-3 text-xs">
                <div className="bg-black border border-[var(--accent)]/30 p-2.5 rounded-xl rounded-tl-none self-start max-w-[85%] leading-relaxed text-zinc-300 shadow-[0_0_10px_var(--glow-color)]">
                    <span className="font-black text-[10px] text-[var(--terminal-text)] block mb-1">CEREBRO:</span>
                    Welcome, Billie. Let us synchronize with the external environment. Ask me anything about OS-level decoupling, idle-detection thresholds, or passive SSE ingestion mechanics.
                </div>
            </div>

            <div className="p-2 border-t border-[var(--card-border)] bg-black/80 flex items-center space-x-1">
                <input id="chat-input-field" type="text" placeholder="Query foresight parameters..." className="flex-1 bg-black/60 border border-[var(--card-border)] text-xs rounded-lg px-3 py-2 text-white focus:outline-none focus:border-[var(--accent)] focus:shadow-[0_0_10px_var(--glow-color)]"  />
                <button  className="p-2 bg-[var(--accent)] text-white rounded-lg transition focusable hover:bg-white hover:text-black hover:shadow-[0_0_15px_var(--accent-glow)]">
                    <i data-lucide="send" className="w-3.5 h-3.5"></i>
                </button>
            </div>
        </div>
    </div>

    
    

    </>
  );
}
