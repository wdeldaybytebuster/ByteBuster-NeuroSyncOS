
import React, { useState, useEffect } from 'react';


export function CoreExecDashboard() {
  useEffect(() => {
    // Make sure lucid icons render on initial mount
    try {
      (window as any).lucide?.createIcons();
    } catch(e) {}
  }, []);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        /* CSS Variable System for Stealth Black & Minimal Cyan Morphing */
        :root {
            /* Dark Mode: Deep Stealth Black & High-Contrast Cyan */
            --bg-base: #000000; /* True black to let lines show through */
            --bg-surface: #050505;
            /* Reduced opacity for more black bleed-through */
            --bg-surface-glass: rgba(5, 5, 5, 0.45); 
            --bg-nested: rgba(0, 229, 255, 0.04);
            /* Maximized glow values */
            --border-glow: rgba(0, 229, 255, 0.2);
            --text-primary: #fafafa;
            --text-muted: #8f8f9d;
            --accent: #00E5FF; /* Logo matched cyan */
            --accent-glow: rgba(0, 229, 255, 0.5); /* Turned up glow */
            --card-border: rgba(30, 30, 35, 0.8);
            --grid-color: rgba(0, 229, 255, 0.05);
            --grid-line: rgba(255, 255, 255, 0.03);
            --glow-color: rgba(0, 229, 255, 0.15);
            --logo-accent: #00E5FF;
            --terminal-bg: #030303;
            --terminal-text: #00E5FF;
        }

        .light {
            /* Light Mode: Structured Paper & Deep Cyan Slate */
            --bg-base: #f8fafc;
            --bg-surface: #ffffff;
            --bg-surface-glass: rgba(255, 255, 255, 0.85);
            --bg-nested: rgba(14, 116, 144, 0.03);
            --border-glow: rgba(14, 116, 144, 0.03);
            --text-primary: #0f172a;
            --text-muted: #64748b;
            --accent: #0891b2;
            --accent-glow: rgba(8, 145, 178, 0.1);
            --card-border: rgba(203, 213, 225, 0.8);
            --grid-color: rgba(14, 116, 144, 0.02);
            --grid-line: rgba(14, 116, 144, 0.03);
            --glow-color: rgba(14, 116, 144, 0.01);
            --logo-accent: #0891b2;
            --terminal-bg: #0f172a;
            --terminal-text: #38bdf8;
        }

        body {
            background-color: var(--bg-base);
            color: var(--text-primary);
            font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            background-image: 
                radial-gradient(circle at 50% 50%, var(--grid-color) 0%, transparent 60%),
                linear-gradient(var(--grid-line) 1px, transparent 1px),
                linear-gradient(90deg, var(--grid-line) 1px, transparent 1px);
            background-size: 100% 100%, 24px 24px, 24px 24px;
            transition: background-color 0.4s ease, color 0.4s ease, background-image 0.4s ease;
        }

        /* Technical Minimal-Glow Stealth Card Design */
        .glow-card {
            border: 1px solid var(--card-border);
            background-color: var(--bg-surface-glass);
            backdrop-filter: blur(10px);
            -webkit-backdrop-filter: blur(10px);
            /* Increased drop shadow for steeper stealth look with bright cyan glow */
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.6), 0 0 12px var(--glow-color);
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .glow-card:hover {
            border-color: rgba(0, 229, 255, 0.5);
            box-shadow: 0 6px 20px rgba(0, 0, 0, 0.8), 0 0 25px var(--accent-glow);
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

        /* Task Queue Line Connector */
        .task-connector::before {
            content: '';
            position: absolute;
            top: 24px;
            left: 11px;
            bottom: -16px;
            width: 2px;
            background: var(--card-border);
            z-index: 0;
        }
        .task-item:last-child .task-connector::before {
            display: none;
        }
    ` }} />
      

    
    <header className="w-full h-16 border-b border-[var(--card-border)] bg-[var(--bg-surface-glass)] backdrop-blur-md px-6 flex items-center justify-between z-40 fixed top-0 left-0 transition-colors duration-300">
        <div className="flex items-center space-x-3">
            
            <button  className="w-9 h-9 rounded-lg border border-[var(--card-border)] bg-[var(--bg-nested)] hover:border-zinc-500 flex items-center justify-center text-[var(--accent)] focusable" aria-label="Open Suite Switcher Menu">
                <i data-lucide="menu" className="w-5 h-5"></i>
            </button>

            
            <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-black/20 border border-[var(--card-border)]">
                <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" className="w-7 h-7 text-[var(--accent)]">
                    <path d="M20 50 L40 20 M80 50 L60 80 M20 20 L35 35 M80 80 L65 65" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.6"/>
                    <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="1" stroke-dasharray="4 8" opacity="0.5"/>
                    <g transform="translate(50,50) scale(0.6) translate(-50,-50)">
                        <g transform="rotate(45,50,50)">
                            <path d="M 56 85 L 56 68 L 60 68 L 60 45 L 75 30 L 75 10 L 58 10 L 58 28 L 42 28 L 42 10 L 25 10 L 25 30 L 40 45 L 40 68 L 44 68 L 44 85 Z" fill="rgba(0,229,255,0.1)" stroke="currentColor" strokeWidth="4" strokeLinejoin="round"/>
                            <rect x="46" y="74" width="3" height="5" fill="#0D0E15"/>
                            <rect x="51" y="74" width="3" height="5" fill="#0D0E15"/>
                            <rect x="48" y="40" width="4" height="24" rx="2" fill="currentColor" />
                        </g>
                    </g>
                </svg>
            </div>
            
            <div className="hidden sm:block ml-1">
                <span className="font-black text-sm tracking-wider uppercase text-[var(--text-primary)]">COREEXEC ENGINE</span>
                <span className="text-[9px] uppercase font-bold text-[var(--accent)] tracking-widest block -mt-1">NeuroSync Sovereign Suite</span>
            </div>
        </div>

        
        <div className="flex bg-[var(--bg-nested)] p-1 rounded-xl border border-[var(--card-border)] items-center space-x-1" role="tablist" aria-label="Core Navigation">
            <button id="tab-dashboard"  className="px-5 py-1.5 rounded-lg text-sm font-semibold transition-all duration-200 flex items-center space-x-2 text-black bg-[var(--accent)] shadow shadow-[var(--accent-glow)] focusable" role="tab" aria-selected="true" aria-controls="panel-dashboard">
                <i data-lucide="activity" className="w-4 h-4 text-black"></i>
                <span>Dashboard</span>
            </button>
            <button id="tab-setups"  className="px-5 py-1.5 rounded-lg text-sm font-semibold transition-all duration-200 flex items-center space-x-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] focusable" role="tab" aria-selected="false" aria-controls="panel-setups">
                <i data-lucide="sliders-horizontal" className="w-4 h-4"></i>
                <span>Set-ups</span>
            </button>
        </div>

        
        <div className="flex items-center space-x-2">
            <button  className="w-9 h-9 rounded-lg border border-[var(--card-border)] bg-[var(--bg-nested)] hover:border-zinc-500 flex items-center justify-center transition-all focusable" aria-label="Toggle visual theme">
                <i id="theme-icon" data-lucide="sun" className="w-4 h-4 text-[var(--accent)]"></i>
            </button>
            <button  className="w-9 h-9 rounded-lg border border-[var(--card-border)] bg-[var(--bg-nested)] hover:border-zinc-500 flex items-center justify-center transition-all focusable" aria-label="Toggle system cognitive tags schema">
                <i data-lucide="database" className="w-4 h-4 text-[var(--accent)]"></i>
            </button>
            <button  className="w-9 h-9 rounded-lg border border-[var(--card-border)] bg-[var(--bg-nested)] hover:border-zinc-500 flex items-center justify-center text-[var(--accent)] focusable" aria-label="Toggle command workspace panel">
                <i data-lucide="sidebar" className="w-5 h-5"></i>
            </button>
        </div>
    </header>

    
    <aside id="suite-switcher" className="fixed left-0 top-16 h-[calc(100vh-4rem)] w-72 bg-[var(--bg-surface-glass)] backdrop-blur-xl border-r border-[var(--card-border)] z-30 transition-transform duration-300 transform -translate-x-full shadow-2xl flex flex-col">
        <div className="p-4 border-b border-[var(--card-border)] flex items-center justify-between">
            <div className="flex items-center space-x-2 text-[var(--accent)]">
                <i data-lucide="compass" className="w-4 h-4"></i>
                <h3 className="font-bold text-xs tracking-wider uppercase">Sovereign Suite Switcher</h3>
            </div>
            <button  className="p-1 rounded hover:bg-zinc-800/40 text-[var(--text-muted)] hover:text-[var(--text-primary)]" aria-label="Close suite navigation">
                <i data-lucide="x" className="w-4 h-4"></i>
            </button>
        </div>

        <nav className="flex-1 p-4 space-y-2 overflow-y-auto font-medium">
            <a href="#" className="flex items-center justify-between p-3 rounded-xl bg-[var(--accent)]/10 border border-[var(--accent)] text-[var(--text-primary)] transition focusable">
                <div className="flex items-center space-x-3">
                    <i data-lucide="cpu" className="w-4 h-4 text-[var(--accent)]"></i>
                    <span className="text-xs font-bold uppercase tracking-wider">CoreExec (Orchestrator)</span>
                </div>
                <span className="w-2 h-2 rounded-full bg-[var(--accent)] animate-pulse shadow-[0_0_8px_var(--accent)]"></span>
            </a>
            <button  className="w-full flex items-center p-3 rounded-xl hover:bg-[var(--bg-nested)] border border-transparent hover:border-[var(--card-border)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition text-left focusable">
                <i data-lucide="vault" className="w-4 h-4 mr-3"></i>
                <span className="text-xs font-bold uppercase tracking-wider">BaseVault (Database)</span>
            </button>
            <button  className="w-full flex items-center p-3 rounded-xl hover:bg-[var(--bg-nested)] border border-transparent hover:border-[var(--card-border)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition text-left focusable">
                <i data-lucide="grid-3x3" className="w-4 h-4 mr-3"></i>
                <span className="text-xs font-bold uppercase tracking-wider">PortGrid (Skills Hub)</span>
            </button>
            <button  className="w-full flex items-center p-3 rounded-xl hover:bg-[var(--bg-nested)] border border-transparent hover:border-[var(--card-border)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition text-left focusable">
                <i data-lucide="shuffle" className="w-4 h-4 mr-3"></i>
                <span className="text-xs font-bold uppercase tracking-wider">RouteSwitch (Router)</span>
            </button>
            <button  className="w-full flex items-center p-3 rounded-xl hover:bg-[var(--bg-nested)] border border-transparent hover:border-[var(--card-border)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition text-left focusable">
                <i data-lucide="file-question" className="w-4 h-4 mr-3"></i>
                <span className="text-xs font-bold uppercase tracking-wider">ScopeLogic (Proposal)</span>
            </button>
            <button  className="w-full flex items-center p-3 rounded-xl hover:bg-[var(--bg-nested)] border border-transparent hover:border-[var(--card-border)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition text-left focusable">
                <i data-lucide="radar" className="w-4 h-4 mr-3"></i>
                <span className="text-xs font-bold uppercase tracking-wider">ScoutDaemon (Predictive)</span>
            </button>
        </nav>
        <div className="p-4 border-t border-[var(--card-border)] bg-zinc-900/20 text-[10px] text-zinc-500 flex flex-col space-y-1 font-mono">
            <span>Sovereign Platform Framework</span>
            <span>Design Core: Grit, Not Grime</span>
        </div>
    </aside>

    
    <aside id="sidebar-panel" className="fixed right-0 top-16 h-[calc(100vh-4rem)] w-80 bg-[var(--bg-surface-glass)] backdrop-blur-xl border-l border-[var(--card-border)] z-30 transition-transform duration-300 transform translate-x-0 shadow-2xl flex flex-col">
        <div className="p-4 border-b border-[var(--card-border)] flex items-center justify-between">
            <div className="flex items-center space-x-2 text-[var(--accent)]">
                <i data-lucide="hard-drive" className="w-4 h-4"></i>
                <h3 className="font-bold text-sm tracking-wider uppercase">BaseVault Sync</h3>
            </div>
            <button  className="p-1 rounded hover:bg-zinc-800/40 text-[var(--text-muted)] hover:text-white" aria-label="Close panel">
                <i data-lucide="x" className="w-4 h-4"></i>
            </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-5">
            
            <div className="space-y-2">
                <label className="text-xs font-semibold text-[var(--text-muted)] tracking-wider uppercase block">Project Isolation Target</label>
                <div className="relative">
                    <select id="project-selector" className="w-full bg-black/50 border border-[var(--card-border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] appearance-none focusable">
                        <option value="alex-workspace">Alex (Freelance Creator Silo)</option>
                        <option value="sam-workspace">Sam (Hobbyist Developer Silo)</option>
                    </select>
                    <i data-lucide="chevron-down" className="w-4 h-4 text-[var(--accent)] absolute right-3 top-3 pointer-events-none"></i>
                </div>
            </div>

            
            <div className="bg-[var(--bg-nested)] border border-[var(--card-border)] rounded-lg p-3 space-y-3">
                <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider flex items-center space-x-1.5">
                        <i data-lucide="lock" className="w-3.5 h-3.5 text-[var(--accent)]"></i>
                        <span>Atomic Leases</span>
                    </span>
                    <span className="px-1.5 py-0.5 bg-green-500/10 text-green-400 rounded text-[9px] uppercase font-bold tracking-widest border border-green-500/20 animate-pulse">Syncing</span>
                </div>
                <div className="space-y-1">
                    <div className="flex justify-between text-[11px] font-mono">
                        <span className="text-zinc-400">BEGIN IMMEDIATE Locks</span>
                        <span className="text-[var(--accent)] font-bold">1 Active</span>
                    </div>
                    <div className="flex justify-between text-[11px] font-mono">
                        <span className="text-zinc-400">Stale Leases Evicted</span>
                        <span className="text-green-500 font-bold">0</span>
                    </div>
                </div>
                <p className="text-[10px] text-zinc-500 leading-relaxed font-medium pt-1 border-t border-[var(--card-border)]">
                    SQLite WAL mode ensures no two worker threads can claim the same DAG node simultaneously.
                </p>
            </div>

            
            <div className="bg-[var(--bg-nested)] border border-[var(--card-border)] rounded-lg p-3 space-y-3">
                <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider flex items-center space-x-1.5">
                    <i data-lucide="history" className="w-3.5 h-3.5 text-[var(--accent)]"></i>
                    <span>State Recovery</span>
                </span>
                <div className="grid grid-cols-2 gap-2 pt-1">
                    <button className="bg-black/50 hover:bg-black/80 border border-[var(--card-border)] py-2 px-2 rounded-md text-[11px] font-bold hover:border-[var(--accent)]/50 flex flex-col items-center justify-center space-y-1 text-[var(--accent)] focusable transition">
                        <i data-lucide="camera" className="w-4 h-4"></i>
                        <span>Force Snapshot</span>
                    </button>
                    <button className="bg-black/50 hover:bg-black/80 border border-[var(--card-border)] py-2 px-2 rounded-md text-[11px] font-bold hover:border-orange-500/50 flex flex-col items-center justify-center space-y-1 text-orange-400 focusable transition">
                        <i data-lucide="power-off" className="w-4 h-4"></i>
                        <span>Simulate Crash</span>
                    </button>
                </div>
            </div>
        </div>

        <div className="p-3 border-t border-[var(--card-border)] bg-zinc-900/40 text-[10px] text-zinc-500 font-mono text-center">
            Orchestrator Uptime: <span className="text-[var(--accent)] font-bold">14h 22m</span>
        </div>
    </aside>

    
    <div className="flex-1 flex pt-16 relative overflow-hidden">
        <main className="flex-1 flex flex-col md:flex-row transition-all duration-300 p-6 space-y-6 md:space-y-0 md:space-x-6 min-h-[calc(100vh-4rem)] lg:mr-80" id="main-content-layout">

            
            <div id="panel-dashboard" className="flex-1 flex flex-col lg:flex-row space-y-6 lg:space-y-0 lg:space-x-6 w-full animate-fade-in" role="tabpanel" aria-labelledby="tab-dashboard">
                
                
                <div className="flex-1 bg-[var(--bg-surface-glass)] border border-[var(--card-border)] backdrop-blur-md rounded-2xl p-5 shadow-xl flex flex-col relative overflow-hidden transition-colors duration-300">
                    <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(circle at top, var(--grid-color) 0%, transparent 75%)" }}></div>
                    
                    <div className="relative z-10 flex flex-col h-full space-y-5">
                        <div className="flex items-center justify-between border-b border-[var(--card-border)] pb-3">
                            <div>
                                <h1 className="text-xl font-black tracking-wide text-white">Transactional DAG Runner</h1>
                                <p className="text-[11px] text-[var(--text-muted)] mt-0.5 font-bold uppercase tracking-wider">Active Execution Lineage: <span className="text-[var(--accent)]">wf_092x_alpha</span></p>
                            </div>
                            <button  className="px-4 py-2 rounded-lg bg-[var(--accent)] hover:opacity-90 text-black text-xs font-black flex items-center space-x-2 transition-all shadow-[0_0_10px_var(--accent-glow)] focusable">
                                <i data-lucide="play" className="w-3.5 h-3.5"></i>
                                <span>Execute Next Node</span>
                            </button>
                        </div>

                        
                        <div className="flex-1 overflow-y-auto px-2 py-4 space-y-4" id="dag-container">
                            
                            
                            <div className="task-item relative pl-10">
                                <div className="task-connector">
                                    <div className="absolute left-0 top-1 w-6 h-6 rounded-full bg-green-500/10 border border-green-500 flex items-center justify-center z-10 shadow-[0_0_8px_rgba(34,197,94,0.2)]">
                                        <i data-lucide="check" className="w-3 h-3 text-green-400"></i>
                                    </div>
                                </div>
                                <div className="glow-card p-3 rounded-xl">
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="text-xs font-bold text-white">Node 1: Quarantined Ingest</span>
                                        <span className="text-[9px] px-1.5 py-0.5 bg-green-500/10 text-green-400 rounded border border-green-500/20 font-mono">COMPLETED</span>
                                    </div>
                                    <p className="text-[10px] text-zinc-400 font-mono">Idempotency Key: <span className="text-zinc-500">idk_77a91b...</span></p>
                                </div>
                            </div>

                            
                            <div className="task-item relative pl-10" id="active-node">
                                <div className="task-connector">
                                    <div className="absolute left-0 top-1 w-6 h-6 rounded-full bg-[var(--accent)]/10 border border-[var(--accent)] flex items-center justify-center z-10 shadow-[0_0_8px_var(--accent-glow)]">
                                        <span className="w-2 h-2 rounded-full bg-[var(--accent)] animate-ping"></span>
                                    </div>
                                </div>
                                <div className="glow-card p-3 rounded-xl border-[var(--accent)] bg-[var(--accent)]/5">
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="text-xs font-bold text-white">Node 2: RouteSwitch Inference</span>
                                        <span className="text-[9px] px-1.5 py-0.5 bg-[var(--accent)]/10 text-[var(--accent)] rounded border border-[var(--accent)]/20 font-mono animate-pulse">LOCKED (RUNNING)</span>
                                    </div>
                                    <p className="text-[10px] text-zinc-400 font-mono">Worker: <span className="text-[var(--accent)]">Thread-2 (PID 4092)</span></p>
                                </div>
                            </div>

                            
                            <div className="task-item relative pl-10 opacity-50">
                                <div className="task-connector">
                                    <div className="absolute left-0 top-1 w-6 h-6 rounded-full bg-zinc-900 border border-zinc-700 flex items-center justify-center z-10">
                                        <i data-lucide="clock" className="w-3 h-3 text-zinc-500"></i>
                                    </div>
                                </div>
                                <div className="border border-[var(--card-border)] bg-black/30 p-3 rounded-xl">
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="text-xs font-bold text-white">Node 3: BaseVault Persist</span>
                                        <span className="text-[9px] px-1.5 py-0.5 bg-zinc-800 text-zinc-400 rounded border border-zinc-700 font-mono">PENDING</span>
                                    </div>
                                    <p className="text-[10px] text-zinc-500 font-mono">Awaiting Node 2 output...</p>
                                </div>
                            </div>

                        </div>
                    </div>
                </div>

                
                <div className="w-full lg:w-80 flex flex-col space-y-6">
                    
                    
                    <div className="glow-card rounded-2xl p-5 relative overflow-hidden transition-colors duration-300">
                        <div className="flex items-center justify-between border-b border-[var(--card-border)] pb-3 mb-4">
                            <div className="flex items-center space-x-2 text-[var(--accent)]">
                                <i data-lucide="bar-chart-2" className="w-4 h-4"></i>
                                <h3 className="font-bold text-xs tracking-wider uppercase">Orchestration Mentrix</h3>
                            </div>
                            <span className="text-[9px] font-mono text-zinc-500 font-bold">Live Polling</span>
                        </div>

                        <div className="grid grid-cols-2 gap-3 text-center text-xs">
                            <div className="bg-black/50 p-2 rounded-xl border border-[var(--card-border)]">
                                <span className="text-[9px] text-[var(--text-muted)] font-bold uppercase block mb-0.5">398 Tests</span>
                                <span className="text-sm font-black text-green-500 font-mono">PASSING</span>
                            </div>
                            <div className="bg-black/50 p-2 rounded-xl border border-[var(--card-border)]">
                                <span className="text-[9px] text-[var(--text-muted)] font-bold uppercase block mb-0.5">Duplicates</span>
                                <span className="text-sm font-black text-[var(--accent)] font-mono">0</span>
                            </div>
                            <div className="bg-black/50 p-2 rounded-xl border border-[var(--card-border)]">
                                <span className="text-[9px] text-[var(--text-muted)] font-bold uppercase block mb-0.5">Retry Rate</span>
                                <span className="text-sm font-black text-white font-mono">1.2%</span>
                            </div>
                            <div className="bg-black/50 p-2 rounded-xl border border-[var(--card-border)]">
                                <span className="text-[9px] text-[var(--text-muted)] font-bold uppercase block mb-0.5">Latency</span>
                                <span className="text-sm font-black text-white font-mono">42ms</span>
                            </div>
                        </div>
                    </div>

                    
                    <div className="flex-1 flex flex-col min-h-[250px]">
                        <div className="flex items-center justify-between mb-2">
                            <label className="text-xs font-semibold text-[var(--text-muted)] tracking-wider uppercase">Pino Transaction Log</label>
                        </div>
                        <div id="pino-logger" className="flex-1 bg-black border border-[var(--card-border)] rounded-xl p-3 font-mono text-[9px] text-zinc-400 overflow-y-auto space-y-1.5 shadow-inner">
                            <div><span className="text-zinc-600">[10:29:01]</span> COREEXEC: Booting orchestrator...</div>
                            <div><span className="text-zinc-600">[10:29:02]</span> BASEVAULT: SQLite WAL mode confirmed.</div>
                            <div className="text-[var(--accent)]"><span className="text-zinc-600">[10:29:05]</span> TASK_CLAIM: Thread-2 locked Node 2 (BEGIN IMMEDIATE)</div>
                            <div><span className="text-zinc-600">[10:29:06]</span> ROUTESWITCH: Forwarding payload to inference engine...</div>
                        </div>
                    </div>

                </div>
            </div>

            
            <div id="panel-setups" className="flex-1 hidden flex-col lg:flex-row space-y-6 lg:space-y-0 lg:space-x-6 w-full animate-fade-in" role="tabpanel" aria-labelledby="tab-setups">
                
                
                <div className="flex-1 bg-[var(--bg-surface-glass)] border border-[var(--card-border)] backdrop-blur-md rounded-2xl p-5 shadow-xl flex flex-col relative overflow-hidden transition-colors duration-300">
                    <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(circle at top, var(--grid-color) 0%, transparent 75%)" }}></div>

                    <div className="relative z-10 flex flex-col h-full space-y-4">
                        <div className="border-b border-[var(--card-border)] pb-3">
                            <h1 className="text-xl font-black tracking-wide text-white">CoreExec Engine Set-ups</h1>
                            <p className="text-xs text-[var(--text-muted)] mt-0.5 font-medium">Configure hardware-adaptive thread pooling, retry cascades, and crash-recovery snapshot metrics.</p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                            
                            
                            <div className="space-y-4">
                                <h3 className="text-sm font-black text-[var(--accent)] flex items-center space-x-2">
                                    <i data-lucide="cpu" className="w-4 h-4"></i>
                                    <span>Hardware-Adaptive Profiling</span>
                                </h3>

                                <div className="space-y-4 bg-black/50 border border-[var(--card-border)] rounded-xl p-4">
                                    <div className="space-y-2">
                                        <div className="flex justify-between text-xs font-bold">
                                            <span className="text-[var(--text-muted)]">Max Worker Threads</span>
                                            <span id="threads-display" className="text-[var(--accent)] font-mono">3 (Safe Limit)</span>
                                        </div>
                                        <input type="range" min="1" max="16" value="3" onInput={() => {}} className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-[var(--accent)]" />
                                        <p className="text-[9px] text-zinc-500 font-mono mt-1">Based on os.cpus(). Total cores - 1 to protect UI event loop.</p>
                                    </div>
                                    
                                    <div className="flex items-center justify-between p-2 rounded bg-black/80 border border-[var(--card-border)]">
                                        <div>
                                            <span className="text-xs font-bold text-white block">Dynamic Load Shedding</span>
                                            <span className="text-[9px] text-zinc-500 font-semibold block">Sleep workers if os.loadavg() is high</span>
                                        </div>
                                        <input type="checkbox" checked className="w-4 h-4 text-[var(--accent)] bg-black border-zinc-700 rounded focus:ring-[var(--accent)]" />
                                    </div>
                                </div>
                            </div>

                            
                            <div className="space-y-4">
                                <h3 className="text-sm font-black text-[var(--accent)] flex items-center space-x-2">
                                    <i data-lucide="database-zap" className="w-4 h-4"></i>
                                    <span>BaseVault Persistence Rules</span>
                                </h3>

                                <div className="space-y-3 bg-black/50 border border-[var(--card-border)] rounded-xl p-4">
                                    <div className="flex items-center justify-between p-2 rounded bg-black/80 border border-[var(--card-border)]">
                                        <div>
                                            <span className="text-xs font-bold text-white block">Enforce WAL Mode</span>
                                            <span className="text-[9px] text-zinc-500 font-semibold block">Required for concurrent DB reads</span>
                                        </div>
                                        <input type="checkbox" checked disabled className="w-4 h-4 text-[var(--accent)] bg-black border-zinc-700 rounded opacity-50 cursor-not-allowed" />
                                    </div>
                                    
                                    <div className="space-y-1 mt-2">
                                        <label className="text-xs font-bold text-[var(--text-muted)]">Snapshot Frequency</label>
                                        <select className="w-full bg-black/80 border border-[var(--card-border)] rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-[var(--accent)] focusable">
                                            <option value="node">Every Node Completion (Safest)</option>
                                            <option value="dag">End of DAG Workflow</option>
                                            <option value="time">Every 5 seconds</option>
                                        </select>
                                    </div>
                                </div>
                            </div>

                            
                            <div className="space-y-4 md:col-span-2">
                                <h3 className="text-sm font-black text-[var(--accent)] flex items-center space-x-2">
                                    <i data-lucide="repeat-2" className="w-4 h-4"></i>
                                    <span>Task Retry Cascade</span>
                                </h3>
                                
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-black/50 border border-[var(--card-border)] rounded-xl p-4">
                                     <div className="space-y-1">
                                        <label className="text-xs font-bold text-[var(--text-muted)]">Max Retries per Node</label>
                                        <select className="w-full bg-black/80 border border-[var(--card-border)] rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-[var(--accent)] focusable">
                                            <option>0 (Fail fast)</option>
                                            <option>1 (Standard)</option>
                                            <option selected>3 (Resilient)</option>
                                        </select>
                                    </div>
                                    <div className="flex items-center justify-between p-2 rounded bg-black/80 border border-[var(--card-border)]">
                                        <div>
                                            <span className="text-xs font-bold text-white block">Idempotency Keys</span>
                                            <span className="text-[9px] text-zinc-500 font-semibold block">Prevent duplicate side-effects</span>
                                        </div>
                                        <input type="checkbox" checked className="w-4 h-4 text-[var(--accent)] bg-black border-zinc-700 rounded focus:ring-[var(--accent)]" />
                                    </div>
                                </div>
                            </div>

                        </div>

                        <div className="flex justify-end space-x-3 pt-6 border-t border-[var(--card-border)] mt-auto">
                            <button className="px-5 py-2 rounded-lg bg-transparent hover:bg-white/5 text-xs font-bold border border-[var(--card-border)] transition focusable">Revert</button>
                            <button className="px-5 py-2 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent)]/90 text-black font-black text-xs transition shadow-[0_0_10px_var(--accent-glow)] focusable">Commit Configuration</button>
                        </div>
                    </div>
                </div>

                
                <div className="w-full lg:w-80 flex flex-col space-y-6">
                    
                    <div className="glow-card rounded-2xl p-5 relative overflow-hidden transition-colors duration-300">
                        <div className="flex items-center justify-between border-b border-[var(--card-border)] pb-3 mb-4">
                            <div className="flex items-center space-x-2 text-orange-400">
                                <i data-lucide="shield-alert" className="w-4 h-4"></i>
                                <h3 className="font-bold text-xs tracking-wider uppercase text-white">Safety Boundaries</h3>
                            </div>
                            <span className="text-[9px] text-green-500 font-bold uppercase tracking-wider font-mono border border-green-500/20 bg-green-500/10 px-1 rounded">ENFORCED</span>
                        </div>

                        <div className="space-y-3 text-xs">
                            <div className="flex items-start space-x-2 border-b border-[var(--card-border)] pb-2">
                                <i data-lucide="check-circle-2" className="w-4 h-4 text-green-500 mt-0.5"></i>
                                <div>
                                    <span className="font-bold block text-white">SA-04: Node Sanity</span>
                                    <p className="text-[10px] text-zinc-500 font-medium">Workflows strictly forbidden from adding shell, exec, or eval nodes.</p>
                                </div>
                            </div>
                            <div className="flex items-start space-x-2 border-b border-[var(--card-border)] pb-2">
                                <i data-lucide="check-circle-2" className="w-4 h-4 text-green-500 mt-0.5"></i>
                                <div>
                                    <span className="font-bold block text-white">No Turing Logic</span>
                                    <p className="text-[10px] text-zinc-500 font-medium">Only declarative transforms (select, literal, merge, fan-in).</p>
                                </div>
                            </div>
                            <div className="flex items-start space-x-2">
                                <i data-lucide="check-circle-2" className="w-4 h-4 text-green-500 mt-0.5"></i>
                                <div>
                                    <span className="font-bold block text-white">Assume Breach</span>
                                    <p className="text-[10px] text-zinc-500 font-medium">Draft-only state enforced. No DAG executes without operator explicit sign-off.</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

            </div>
        </main>
    </div>

    
    <footer className="w-full h-8 bg-[#030303] border-t border-[var(--card-border)] px-4 flex items-center justify-between text-[10px] text-zinc-600 font-mono z-25 relative transition-colors duration-300">
        <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-1.5">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                <span className="font-bold text-green-400 uppercase">Hono Daemon Online</span>
            </div>
            <span>|</span>
            <span>Port: <strong className="text-[var(--accent)]">127.0.0.1:4096</strong></span>
            <span>|</span>
            <span>Database: <strong className="text-[var(--accent)]">BaseVault.db</strong></span>
        </div>
        <div className="flex items-center space-x-4">
            <span>Verified Tests: <strong className="text-green-400 font-bold">398 Pass</strong></span>
            <span>|</span>
            <span>Node.js: <strong className="text-white">v22 LTS</strong></span>
        </div>
    </footer>

    
    <div id="chat-sentinel" className="fixed bottom-12 right-6 z-50 flex flex-col items-end">
        <button  className="w-12 h-12 rounded-full bg-[var(--accent)] text-black flex items-center justify-center shadow-[0_0_15px_var(--accent-glow)] hover:scale-105 transform transition duration-200 focusable" aria-label="Toggle Cerebro chatbot assistant">
            <i data-lucide="bot-message-square" className="w-6 h-6"></i>
        </button>

        <div id="chat-box" className="w-80 h-96 bg-[var(--bg-surface-glass)] backdrop-blur-xl border border-[var(--card-border)] rounded-2xl shadow-2xl mt-3 hidden flex-col overflow-hidden transition-all duration-300">
            <div className="bg-black/90 p-3 flex items-center justify-between border-b border-[var(--card-border)]">
                <div className="flex items-center space-x-2">
                    <span className="w-2 h-2 rounded-full bg-[var(--accent)]"></span>
                    <span className="text-xs font-bold tracking-wide uppercase text-white">Cerebro Assist Sentinel</span>
                </div>
                <button  className="text-zinc-500 hover:text-white transition">
                    <i data-lucide="minus" className="w-4 h-4"></i>
                </button>
            </div>

            <div id="chat-conversation" className="flex-1 overflow-y-auto p-4 space-y-3 text-xs">
                <div className="bg-black border border-[var(--accent)]/30 p-2.5 rounded-xl rounded-tl-none self-start max-w-[85%] leading-relaxed text-zinc-300">
                    <span className="font-black text-[10px] text-[var(--accent)] block mb-1">CEREBRO:</span>
                    Welcome, Billie. Let us synthesize and map your local cognitive topology. Ask me anything about CoreExec orchestration, transactional task claims, or SQLite BEGIN IMMEDIATE locks.
                </div>
            </div>

            <div className="p-2 border-t border-[var(--card-border)] bg-black/60 flex items-center space-x-1">
                <input id="chat-input-field" type="text" placeholder="Query the orchestration engine..." className="flex-1 bg-black/50 border border-[var(--card-border)] text-xs rounded-lg px-3 py-2 text-white focus:outline-none focus:border-[var(--accent)]"  />
                <button  className="p-2 bg-[var(--accent)] text-black rounded-lg transition focusable hover:bg-white">
                    <i data-lucide="send" className="w-3.5 h-3.5"></i>
                </button>
            </div>
        </div>
    </div>

    
    

    </>
  );
}
