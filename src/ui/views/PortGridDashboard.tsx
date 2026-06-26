
import React, { useState, useEffect } from 'react';


export function PortGridDashboard() {
  useEffect(() => {
    // Make sure lucid icons render on initial mount
    try {
      (window as any).lucide?.createIcons();
    } catch(e) {}
  }, []);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        /* CSS Variable System for Cyan-Teal-to-Mint Theme Morphing */
        :root {
            /* Dark Mode: Cyber-Teal & Deep Obsidian Space */
            --bg-base: #020a07;
            --bg-surface: #071914;
            --bg-surface-glass: rgba(7, 25, 20, 0.75);
            --bg-nested: rgba(0, 255, 204, 0.03);
            --border-glow: rgba(0, 255, 204, 0.2);
            --text-primary: #fafafa;
            --text-muted: #86efac;
            --accent: #00FFCC;
            --accent-glow: rgba(0, 255, 204, 0.4);
            --card-border: rgba(13, 148, 136, 0.4);
            --grid-color: rgba(0, 255, 204, 0.03);
            --grid-line: rgba(0, 255, 204, 0.015);
            --glow-color: rgba(0, 255, 204, 0.15);
            --logo-accent: #00FFCC;
            --terminal-bg: #010806;
            --terminal-text: #00FFCC;
        }

        .light {
            /* Light Mode: Mint sky paper & rich forest green text - Highly textured & super readable */
            --bg-base: #f0fdf4;
            --bg-surface: #ffffff;
            --bg-surface-glass: rgba(255, 255, 255, 0.85);
            --bg-nested: rgba(13, 148, 136, 0.05);
            --border-glow: rgba(13, 148, 136, 0.15);
            --text-primary: #064e3b;
            --text-muted: #0d9488;
            --accent: #0d9488;
            --accent-glow: rgba(13, 148, 136, 0.35);
            --card-border: rgba(13, 148, 136, 0.2);
            --grid-color: rgba(13, 148, 136, 0.05);
            --grid-line: rgba(13, 148, 136, 0.02);
            --glow-color: rgba(13, 148, 136, 0.08);
            --logo-accent: #0d9488;
            --terminal-bg: #09090b;
            --terminal-text: #2dd4bf;
        }

        body {
            background-color: var(--bg-base);
            color: var(--text-primary);
            font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            background-image: 
                radial-gradient(circle at 50% 50%, var(--grid-color) 0%, transparent 60%),
                linear-gradient(var(--grid-line) 1px, transparent 1px),
                linear-gradient(90deg, var(--grid-line) 1px, transparent 1px);
            background-size: 100% 100%, 20px 20px, 20px 20px;
            transition: background-color 0.4s ease, color 0.4s ease, background-image 0.4s ease;
        }

        /* Technical Glow and Shadow Box Effects - Highly Interactive */
        .glow-card {
            border: 1px solid var(--card-border);
            background-color: var(--bg-surface-glass);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.15), 0 0 10px var(--glow-color);
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .glow-card:hover {
            border-color: var(--accent);
            box-shadow: 0 8px 25px rgba(0, 0, 0, 0.2), 0 0 18px var(--accent-glow);
            transform: translateY(-2px);
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
    ` }} />
      

    
    <header className="w-full h-16 border-b border-[var(--card-border)] bg-[var(--bg-surface-glass)] backdrop-blur-md px-6 flex items-center justify-between z-40 fixed top-0 left-0 transition-colors duration-300">
        <div className="flex items-center space-x-3">
            
            <button  className="w-9 h-9 rounded-lg border border-[var(--card-border)] bg-[var(--bg-nested)] hover:opacity-80 flex items-center justify-center text-[var(--accent)] focusable" aria-label="Open Suite Switcher Menu">
                <i data-lucide="menu" className="w-5 h-5"></i>
            </button>

            
            <div className="w-8 h-8 rounded-lg flex items-center justify-center">
                <svg id="portgrid-logo" viewBox="0 0 100 100" className="w-8 h-8 transition-all duration-300 text-[var(--accent)]">
                    <rect x="15" y="15" width="20" height="20" rx="4" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.4"/>
                    <rect x="65" y="15" width="20" height="20" rx="4" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.4"/>
                    <rect x="15" y="65" width="20" height="20" rx="4" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.4"/>
                    <rect x="65" y="65" width="20" height="20" rx="4" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.4"/>
                    <line x1="50" y1="10" x2="50" y2="90" stroke="currentColor" strokeWidth="1" stroke-dasharray="2 4" opacity="0.5"/>
                    <line x1="10" y1="50" x2="90" y2="50" stroke="currentColor" strokeWidth="1" stroke-dasharray="2 4" opacity="0.5"/>
                    <g transform="translate(50,50) scale(0.55) translate(-50,-50)">
                        <g transform="rotate(45,50,50)">
                            <path d="M 56 85 L 56 68 L 60 68 L 60 45 L 75 30 L 75 10 L 58 10 L 58 28 L 42 28 L 42 10 L 25 10 L 25 30 L 40 45 L 40 68 L 44 68 L 44 85 Z" fill="rgba(0,255,204,0.1)" stroke="currentColor" strokeWidth="4" strokeLinejoin="round"/>
                            <rect x="46" y="74" width="3" height="5" fill="#0D0E15"/>
                            <rect x="51" y="74" width="3" height="5" fill="#0D0E15"/>
                            <rect x="48" y="40" width="4" height="24" rx="2" fill="currentColor" />
                        </g>
                    </g>
                </svg>
            </div>
            
            <div className="hidden sm:block">
                <span className="font-black text-sm tracking-wider uppercase bg-clip-text text-transparent bg-gradient-to-r from-[var(--text-primary)] via-[var(--accent)] to-[var(--text-primary)]">PORTGRID COCKPIT</span>
                <span className="text-[9px] uppercase font-semibold text-[var(--text-muted)] tracking-widest block -mt-1">NeuroSync Sovereign Suite</span>
            </div>
        </div>

        
        <div className="flex bg-[var(--bg-nested)] p-1 rounded-xl border border-[var(--card-border)] items-center space-x-1" role="tablist" aria-label="Core Navigation">
            <button id="tab-dashboard"  className="px-5 py-1.5 rounded-lg text-sm font-semibold transition-all duration-200 flex items-center space-x-2 text-white bg-[var(--accent)] shadow shadow-[var(--accent-glow)] focusable" role="tab" aria-selected="true" aria-controls="panel-dashboard">
                <i data-lucide="layout-dashboard" className="w-4 h-4 text-white dark:text-zinc-950"></i>
                <span>Dashboard</span>
            </button>
            <button id="tab-setups"  className="px-5 py-1.5 rounded-lg text-sm font-semibold transition-all duration-200 flex items-center space-x-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] focusable" role="tab" aria-selected="false" aria-controls="panel-setups">
                <i data-lucide="sliders" className="w-4 h-4"></i>
                <span>Set-ups</span>
            </button>
        </div>

        
        <div className="flex items-center space-x-2">
            
            <button  className="w-9 h-9 rounded-lg border border-[var(--card-border)] bg-[var(--bg-nested)] hover:opacity-85 flex items-center justify-center transition-all focusable" aria-label="Toggle visual theme">
                <i id="theme-icon" data-lucide="sun" className="w-4 h-4 text-[var(--accent)]"></i>
            </button>

            
            <button  className="w-9 h-9 rounded-lg border border-[var(--card-border)] bg-[var(--bg-nested)] hover:opacity-85 flex items-center justify-center transition-all focusable" aria-label="Toggle system cognitive tags schema">
                <i data-lucide="database" className="w-4 h-4 text-[var(--accent)]"></i>
            </button>

            
            <button  className="w-9 h-9 rounded-lg border border-[var(--card-border)] bg-[var(--bg-nested)] hover:opacity-85 flex items-center justify-center text-[var(--accent)] focusable" aria-label="Toggle command workspace panel">
                <i data-lucide="sidebar" className="w-5 h-5"></i>
            </button>
        </div>
    </header>

    
    <aside id="suite-switcher" className="fixed left-0 top-16 h-[calc(100vh-4rem)] w-72 bg-[var(--bg-surface-glass)] backdrop-blur-md border-r border-[var(--card-border)] z-30 transition-transform duration-300 transform -translate-x-full shadow-2xl flex flex-col">
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
            <button  className="w-full flex items-center p-3 rounded-xl hover:bg-[var(--bg-nested)] border border-transparent hover:border-[var(--card-border)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition text-left focusable">
                <i data-lucide="cpu" className="w-4 h-4 mr-3"></i>
                <span className="text-xs font-bold uppercase tracking-wider">CoreExec (Orchestrator)</span>
            </button>

            <button  className="w-full flex items-center p-3 rounded-xl hover:bg-[var(--bg-nested)] border border-transparent hover:border-[var(--card-border)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition text-left focusable">
                <i data-lucide="vault" className="w-4 h-4 mr-3"></i>
                <span className="text-xs font-bold uppercase tracking-wider">BaseVault (Database)</span>
            </button>

            <a href="#" className="flex items-center justify-between p-3 rounded-xl bg-[var(--accent)]/10 border border-[var(--accent)] text-[var(--text-primary)] transition focusable">
                <div className="flex items-center space-x-3">
                    <i data-lucide="grid-3x3" className="w-4 h-4 text-[var(--accent)]"></i>
                    <span className="text-xs font-bold uppercase tracking-wider">PortGrid (Skills Hub)</span>
                </div>
                <span className="w-2 h-2 rounded-full bg-[var(--accent)] animate-pulse"></span>
            </a>

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

    
    <aside id="sidebar-panel" className="fixed right-0 top-16 h-[calc(100vh-4rem)] w-80 bg-[var(--bg-surface-glass)] backdrop-blur-md border-l border-[var(--card-border)] z-30 transition-transform duration-300 transform translate-x-0 shadow-2xl flex flex-col">
        
        <div className="p-4 border-b border-[var(--card-border)] flex items-center justify-between">
            <div className="flex items-center space-x-2 text-[var(--accent)]">
                <i data-lucide="folder-search" className="w-4 h-4"></i>
                <h3 className="font-bold text-sm tracking-wider uppercase">Project Target Workspace</h3>
            </div>
            <button  className="p-1 rounded hover:bg-zinc-800/40 text-[var(--text-muted)] hover:text-white" aria-label="Close panel">
                <i data-lucide="x" className="w-4 h-4"></i>
            </button>
        </div>

        
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
            
            <div className="space-y-2">
                <label className="text-xs font-semibold text-[var(--text-muted)] tracking-wider uppercase block">Project Database Workspace</label>
                <div className="relative">
                    <select id="project-selector"  className="w-full bg-[var(--bg-surface)] border border-[var(--card-border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] appearance-none focusable">
                        <option value="alex-workspace">Alex (Freelance Creator Silo)</option>
                        <option value="sam-workspace">Sam (Hobbyist Developer Silo)</option>
                        <option value="custom-workspace">Add New Custom Silo...</option>
                    </select>
                    <i data-lucide="chevron-down" className="w-4 h-4 text-[var(--accent)] absolute right-3 top-3 pointer-events-none"></i>
                </div>
            </div>

            
            <div className="bg-[var(--bg-nested)] border border-[var(--card-border)] rounded-lg p-3 space-y-3">
                <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[var(--accent)] uppercase tracking-wider flex items-center space-x-1">
                        <i data-lucide="database-backup" className="w-3 h-3"></i>
                        <span>SQLite WAL Persistence</span>
                    </span>
                    <span className="px-1.5 py-0.5 bg-green-500/10 text-green-400 rounded text-[9px] uppercase font-bold tracking-widest border border-green-500/20 animate-pulse">Synchronous</span>
                </div>
                <p className="text-[11px] text-[var(--text-muted)] leading-relaxed font-medium">
                    State storage backed strictly by relational tables to prevent context window explosion.
                </p>
                <div className="grid grid-cols-2 gap-2 pt-1">
                    <button  className="bg-[var(--bg-surface)] hover:opacity-90 border border-[var(--card-border)] py-1.5 px-2 rounded-md text-[11px] font-bold hover:border-[var(--accent)]/50 flex items-center justify-center space-x-1.5 text-[var(--accent)] focusable">
                        <i data-lucide="download" className="w-3 h-3"></i>
                        <span>Backup DB</span>
                    </button>
                    <button  className="bg-[var(--bg-surface)] hover:opacity-90 border border-[var(--card-border)] py-1.5 px-2 rounded-md text-[11px] font-bold hover:border-[var(--accent)]/50 flex items-center justify-center space-x-1.5 text-[var(--accent)] focusable">
                        <i data-lucide="upload" className="w-3 h-3"></i>
                        <span>Restore DB</span>
                    </button>
                </div>
            </div>

            
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-[var(--text-muted)] tracking-wider uppercase">PortGrid Activity Log</label>
                    <button  className="text-[10px] text-[var(--accent)] hover:underline font-bold">Clear</button>
                </div>
                <div id="pino-logger" className="w-full h-44 bg-zinc-950 border border-[var(--card-border)] rounded-lg p-2 font-mono text-[9px] text-zinc-300 overflow-y-auto space-y-1">
                    <div className="text-zinc-500 font-bold">INIT: PortGrid Registry active...</div>
                    <div className="text-zinc-500 font-bold">INIT: P0 Sandboxing parameters validated...</div>
                    <div className="text-[var(--accent)]">AUDIT: Scoped Workspace locked to project silo: alex-workspace</div>
                </div>
            </div>
        </div>

        
        <div className="p-3 border-t border-[var(--card-border)] bg-zinc-900/40 text-[10px] text-zinc-500 font-mono text-center">
            System ELO Rank: <span className="text-[var(--accent)] font-bold">3,533 edges</span> | v1.0-Beta
        </div>
    </aside>

    
    <div className="flex-1 flex pt-16 relative overflow-hidden">
        <main className="flex-1 flex flex-col md:flex-row transition-all duration-300 p-6 space-y-6 md:space-y-0 md:space-x-6 min-h-[calc(100vh-4rem)] mr-0" id="main-content-layout">

            
            <div id="panel-dashboard" className="flex-1 flex flex-col lg:flex-row space-y-6 lg:space-y-0 lg:space-x-6 w-full" role="tabpanel" aria-labelledby="tab-dashboard">
                
                
                <div className="flex-1 bg-[var(--bg-surface-glass)] border border-[var(--card-border)] backdrop-blur-md rounded-2xl p-5 shadow-xl flex flex-col relative overflow-hidden transition-colors duration-300">
                    
                    <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(circle at top, var(--grid-color) 0%, transparent 75%)" }}></div>
                    
                    <div className="relative z-10 flex flex-col h-full space-y-6">
                        
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-[var(--card-border)] pb-3 gap-3">
                            <div>
                                <h1 className="text-xl font-black tracking-wide">Skills &amp; Capabilities Registry</h1>
                                <p className="text-xs text-[var(--text-muted)] mt-0.5 font-medium">Review sandboxed commands, manage local tool executions, and trigger proactive security validation loops.</p>
                            </div>
                            
                            
                            <button  id="run-escape-btn" className="px-5 py-2 rounded-xl bg-gradient-to-r from-[var(--accent)] via-teal-600 to-emerald-600 hover:opacity-95 text-white dark:text-zinc-950 dark:font-extrabold text-sm font-bold flex items-center justify-center space-x-2 transition-all shadow-lg shadow-[var(--accent-glow)] focusable">
                                <i data-lucide="shield-alert" className="w-4 h-4 text-white dark:text-zinc-950"></i>
                                <span>Run 40+ Sandbox Escape Tests</span>
                            </button>
                        </div>

                        
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            
                            <div className="glow-card rounded-2xl p-4 flex flex-col justify-between">
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center space-x-2 text-[var(--accent)]">
                                            <i data-lucide="terminal" className="w-4 h-4"></i>
                                            <span className="text-xs font-black uppercase tracking-wider">run_command</span>
                                        </div>
                                        <span className="px-2 py-0.5 bg-green-500/10 text-green-400 border border-green-500/20 text-[8px] font-bold rounded uppercase font-mono tracking-wider">ACTIVE</span>
                                    </div>
                                    <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">Runs host terminal commands. Restricted to a strict allowlist of 20 read-only commands (ls, cat, grep, find, wc, etc.).</p>
                                </div>
                                <div className="mt-4 pt-3 border-t border-[var(--card-border)] flex items-center justify-between">
                                    <span className="px-1.5 py-0.5 bg-[var(--accent)]/10 text-[var(--accent)] text-[8px] rounded uppercase font-bold tracking-widest border border-[var(--accent)]/20">Local Only</span>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input type="checkbox" checked className="sr-only peer"  />
                                        <div className="w-8 h-4 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-[var(--accent)]"></div>
                                    </label>
                                </div>
                            </div>

                            
                            <div className="glow-card rounded-2xl p-4 flex flex-col justify-between">
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center space-x-2 text-[var(--accent)]">
                                            <i data-lucide="git-branch" className="w-4 h-4"></i>
                                            <span className="text-xs font-black uppercase tracking-wider">git_nexus</span>
                                        </div>
                                        <span className="px-2 py-0.5 bg-green-500/10 text-green-400 border border-green-500/20 text-[8px] font-bold rounded uppercase font-mono tracking-wider">ACTIVE</span>
                                    </div>
                                    <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">Asynchronously parses AST trees from target repositories without event-loop starvation, yielding structure snapshots.</p>
                                </div>
                                <div className="mt-4 pt-3 border-t border-[var(--card-border)] flex items-center justify-between">
                                    <span className="px-1.5 py-0.5 bg-[var(--accent)]/10 text-[var(--accent)] text-[8px] rounded uppercase font-bold tracking-widest border border-var(--accent)/20">Redacted before send</span>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input type="checkbox" checked className="sr-only peer"  />
                                        <div className="w-8 h-4 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-[var(--accent)]"></div>
                                    </label>
                                </div>
                            </div>

                            
                            <div className="glow-card rounded-2xl p-4 flex flex-col justify-between">
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center space-x-2 text-[var(--accent)]">
                                            <i data-lucide="database" className="w-4 h-4"></i>
                                            <span className="text-xs font-black uppercase tracking-wider">sqlite_vec</span>
                                        </div>
                                        <span className="px-2 py-0.5 bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 text-[8px] font-bold rounded uppercase font-mono tracking-wider">OFF-PEAK</span>
                                    </div>
                                    <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">Computes local vector cosine similarity searches, offloaded to worker threads to prevent main event loop starvation.</p>
                                </div>
                                <div className="mt-4 pt-3 border-t border-[var(--card-border)] flex items-center justify-between">
                                    <span className="px-1.5 py-0.5 bg-[var(--accent)]/10 text-[var(--accent)] text-[8px] rounded uppercase font-bold tracking-widest border border-var(--accent)/20">Worker thread bound</span>
                                    <label className="relative inline-flex inline-flex items-center cursor-pointer">
                                        <input type="checkbox" className="sr-only peer"  />
                                        <div className="w-8 h-4 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-[var(--accent)]"></div>
                                    </label>
                                </div>
                            </div>
                        </div>

                        
                        <div className="border border-[var(--card-border)] bg-[var(--terminal-bg)] rounded-2xl p-5 relative overflow-hidden flex flex-col space-y-3 h-52">
                            <div className="flex items-center justify-between border-b border-[var(--card-border)] pb-2">
                                <span className="text-[10px] font-black uppercase tracking-widest text-[var(--terminal-text)] font-mono">P0 Container Hardening Sandbox Test Audit Trail</span>
                                <span id="audit-indicator" className="text-[9px] font-mono font-bold text-zinc-500">STANDBY - WAITING TRIGGER</span>
                            </div>
                            
                            
                            <div id="sandbox-logs-area" className="flex-1 overflow-y-auto font-mono text-[10px] text-zinc-300 space-y-1.5 pr-2 select-text">
                                <div className="text-zinc-500">Awaiting Sandbox Diagnostic Suite... click button to evaluate local security invariants against malicious command exfiltrations.</div>
                            </div>

                            
                            <div id="sandbox-progress-bar-container" className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden hidden">
                                <div id="sandbox-progress-bar" className="h-full bg-gradient-to-r from-[var(--accent)] to-teal-500 transition-all duration-100" style={{ width: '0%' }}></div>
                            </div>
                        </div>

                        
                        <div className="border border-[var(--card-border)] bg-[var(--bg-nested)] p-4 rounded-xl flex items-center justify-between shadow-sm relative overflow-hidden">
                            <div className="flex items-center space-x-3">
                                <span id="statusline-pulse" className="w-2.5 h-2.5 rounded-full bg-[var(--accent)] animate-pulse shadow shadow-[var(--accent-glow)]"></span>
                                <div>
                                    <span className="text-xs font-black uppercase tracking-wider block text-[var(--text-primary)]">Deference Statusline</span>
                                    <p id="statusline-msg" className="text-[10px] text-[var(--text-muted)] font-medium">All background tasks executing quietly. Click 'Decision Node Audit' to inspect intent tree.</p>
                                </div>
                            </div>
                            
                            
                            <button  className="px-4 py-1.5 rounded-lg border border-[var(--card-border)] bg-[var(--bg-surface)] hover:opacity-90 text-[var(--accent)] text-xs font-bold transition focusable">
                                Decision Node Audit
                            </button>
                        </div>

                    </div>
                </div>

                
                <div className="w-full lg:w-96 flex flex-col space-y-6">
                    
                    
                    <div className="glow-card rounded-2xl p-5 relative overflow-hidden transition-colors duration-300" role="region" aria-label="Autonomy Dials">
                        <div className="flex items-center justify-between border-b border-[var(--card-border)] pb-3 mb-4">
                            <div className="flex items-center space-x-2 text-[var(--accent)]">
                                <i data-lucide="gauge" className="w-4 h-4"></i>
                                <h3 className="font-bold text-xs tracking-wider uppercase">Autonomy Dials</h3>
                            </div>
                            <span className="px-1.5 py-0.5 bg-[var(--accent)]/10 text-[var(--accent)] rounded text-[9px] uppercase font-bold tracking-widest border border-[var(--accent)]/20">Sovereign Limits</span>
                        </div>

                        <div className="space-y-5">
                            
                            <div className="space-y-1.5">
                                <div className="flex justify-between text-xs font-black">
                                    <span>Budget &amp; Rigour Dial</span>
                                    <span id="dial-budget-label" className="text-[var(--accent)] uppercase font-mono text-[10px]">Low Quota</span>
                                </div>
                                <input type="range" id="dial-budget" min="1" max="3" value="1" onInput={() => {}} className="w-full h-1.5 bg-[var(--card-border)] rounded-lg appearance-none cursor-pointer accent-[var(--accent)]" />
                                <p className="text-[10px] text-[var(--text-muted)] leading-relaxed">Limits loop iterations and contexts to conserve daily API tokens.</p>
                            </div>

                            
                            <div className="space-y-1.5 border-t border-[var(--card-border)] pt-4">
                                <div className="flex justify-between text-xs font-black">
                                    <span>Autonomy &amp; Delegation</span>
                                    <span id="dial-autonomy-label" className="text-[var(--accent)] uppercase font-mono text-[10px]">Strict Previews</span>
                                </div>
                                <input type="range" id="dial-autonomy" min="1" max="3" value="1" onInput={() => {}} className="w-full h-1.5 bg-[var(--card-border)] rounded-lg appearance-none cursor-pointer accent-[var(--accent)]" />
                                <p className="text-[10px] text-[var(--text-muted)] leading-relaxed">Controls if code is stripped of execution permissions before human approval.</p>
                            </div>
                        </div>
                    </div>

                    
                    <div className="glow-card rounded-2xl p-5 relative overflow-hidden transition-colors duration-300" role="region" aria-label="Free Mode Governor">
                        <div className="flex items-center justify-between border-b border-[var(--card-border)] pb-3 mb-4">
                            <div className="flex items-center space-x-2 text-[var(--accent)]">
                                <i data-lucide="wallet" className="w-4 h-4"></i>
                                <h3 className="font-bold text-xs tracking-wider uppercase">Free Mode Governor</h3>
                            </div>
                            <span className="px-1.5 py-0.5 bg-[var(--accent)]/10 text-[var(--accent)] rounded text-[9px] uppercase font-bold tracking-widest border border-[var(--accent)]/20">Zero Spending</span>
                        </div>

                        <div className="space-y-4">
                            
                            <div className="space-y-1">
                                <div className="flex justify-between text-xs font-semibold">
                                    <span>Daily Quota Burn</span>
                                    <span id="quota-value" className="text-[var(--accent)] font-bold">12,500 / 50,000 Tokens</span>
                                </div>
                                <div className="w-full h-2 bg-zinc-800/80 rounded-full overflow-hidden border border-[var(--card-border)]">
                                    <div id="quota-progress" className="h-full bg-gradient-to-r from-[var(--accent)] to-teal-600 rounded-full transition-all duration-300" style={{ width: '25%' }}></div>
                                </div>
                            </div>

                            
                            <div className="space-y-1">
                                <div className="flex justify-between text-[11px] text-[var(--text-muted)] font-medium">
                                    <label htmlFor="quota-slider">Adjust Daily Cap (tokens)</label>
                                    <span id="cap-display">50,000 cap</span>
                                </div>
                                <input type="range" id="quota-slider" min="10000" max="100000" step="5000" value="50000" onInput={() => {}} className="w-full h-1 bg-[var(--card-border)] rounded-lg appearance-none cursor-pointer accent-[var(--accent)]" />
                            </div>

                            
                            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[var(--card-border)] text-center font-medium">
                                <div className="bg-[var(--bg-nested)] p-2 rounded-lg border border-[var(--card-border)]">
                                    <span className="text-[9px] text-[var(--text-muted)] font-bold uppercase block">Forecast Status</span>
                                    <span className="text-xs font-bold text-green-500 uppercase">SAFE TO RUN</span>
                                </div>
                                <div className="bg-[var(--bg-nested)] p-2 rounded-lg border border-[var(--card-border)]">
                                    <span className="text-[9px] text-[var(--text-muted)] font-bold uppercase block">Daily calls used</span>
                                    <span id="calls-count-dashboard" className="text-xs font-bold text-[var(--accent)] font-mono">22 calls</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    
                    <div className="glow-card rounded-2xl p-5 relative overflow-hidden transition-colors duration-300" role="region" aria-label="Cerebro Memory Matrix">
                        <div className="flex items-center justify-between border-b border-[var(--card-border)] pb-3 mb-4">
                            <div className="flex items-center space-x-2 text-[var(--accent)]">
                                <i data-lucide="brain" className="w-4 h-4"></i>
                                <h3 className="font-bold text-xs tracking-wider uppercase">Memory Matrix</h3>
                            </div>
                            <button  className="text-[10px] text-[var(--accent)] hover:underline flex items-center space-x-1 font-bold focusable">
                                <i data-lucide="trash-2" className="w-3 h-3"></i>
                                <span>Prune Stale</span>
                            </button>
                        </div>

                        <div className="space-y-3">
                            
                            <div className="relative">
                                <input id="memory-search" type="text" placeholder="Search project memory (Keyword)..." onInput={() => {}} className="w-full bg-[var(--bg-surface)] border border-[var(--card-border)] text-xs rounded-lg pl-8 pr-3 py-2 text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] focusable" aria-label="Search memory" />
                                <i data-lucide="search" className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-2.5"></i>
                            </div>

                            
                            <div id="memory-nodes-list" className="space-y-2 max-h-40 overflow-y-auto pr-1">
                                <div className="p-2 rounded bg-[var(--bg-nested)] border border-[var(--card-border)] text-[11px] space-y-1 transition hover:border-[var(--accent)]/40">
                                    <div className="flex justify-between font-bold">
                                        <span className="text-[var(--accent)]">User Client Identity</span>
                                        <span className="text-zinc-500 text-[9px] font-mono">Confidence: 0.98</span>
                                    </div>
                                    <p className="text-[var(--text-muted)] line-clamp-1 font-medium">Alex manages strict, high-privacy content creation portfolios.</p>
                                </div>
                                <div className="p-2 rounded bg-[var(--bg-nested)] border border-[var(--card-border)] text-[11px] space-y-1 transition hover:border-[var(--accent)]/40">
                                    <div className="flex justify-between font-bold">
                                        <span className="text-[var(--accent)]">Database Engine Config</span>
                                        <span className="text-zinc-500 text-[9px] font-mono">Confidence: 0.95</span>
                                    </div>
                                    <p className="text-[var(--text-muted)] line-clamp-1 font-medium">SQLite selected over DuckDB to optimize transactional locking.</p>
                                </div>
                            </div>
                        </div>
                    </div>

                </div>
            </div>

            
            <div id="panel-setups" className="flex-1 hidden flex-col lg:flex-row space-y-6 lg:space-y-0 lg:space-x-6 w-full" role="tabpanel" aria-labelledby="tab-setups">
                
                
                <div className="flex-1 bg-[var(--bg-surface-glass)] border border-[var(--card-border)] backdrop-blur-md rounded-2xl p-5 shadow-xl flex flex-col relative overflow-hidden transition-colors duration-300">
                    <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(circle at top, var(--grid-color) 0%, transparent 75%)" }}></div>

                    <div className="relative z-10 flex flex-col h-full space-y-4">
                        
                        <div className="border-b border-[var(--card-border)] pb-3">
                            <h1 className="text-xl font-black tracking-wide">PortGrid Sandbox Set-ups</h1>
                            <p className="text-xs text-[var(--text-muted)] mt-0.5 font-medium">Configure network namespaces, seccomp filters, thread allocations, and credential sanitization layers.</p>
                        </div>

                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                            
                            
                            <div className="space-y-4">
                                <h3 className="text-sm font-black text-[var(--accent)] flex items-center space-x-2">
                                    <i data-lucide="cpu" className="w-4 h-4"></i>
                                    <span>Dynamic Threading Allocation</span>
                                </h3>

                                <div className="space-y-3 bg-[var(--bg-nested)] border border-[var(--card-border)] rounded-xl p-4">
                                    
                                    <div className="space-y-2">
                                        <div className="flex justify-between text-xs">
                                            <span className="text-[var(--text-muted)] font-semibold">Active Worker Threads</span>
                                            <span id="threads-display" className="font-black text-[var(--accent)]">3 cores (Safe max)</span>
                                        </div>
                                        <input type="range" min="1" max="8" value="3" onInput={() => {}} className="w-full h-1 bg-[var(--card-border)] rounded-lg appearance-none cursor-pointer accent-[var(--accent)]" />
                                    </div>
                                    <p className="text-[10px] text-[var(--text-muted)]">Balances complex semantic calculations and AST parsing over legacy silicon to protect the main Honoe event loop.</p>
                                </div>
                            </div>

                            
                            <div className="space-y-4">
                                <h3 className="text-sm font-black text-[var(--accent)] flex items-center space-x-2">
                                    <i data-lucide="eye-off" className="w-4 h-4"></i>
                                    <span>Redaction Checkpoints</span>
                                </h3>

                                <div className="space-y-3 bg-[var(--bg-nested)] border border-[var(--card-border)] rounded-xl p-4">
                                    <div className="space-y-2 text-xs font-semibold">
                                        <label className="flex items-center space-x-2 cursor-pointer">
                                            <input type="checkbox" checked className="rounded bg-zinc-800 border-zinc-700 text-[var(--accent)] focus:ring-[var(--accent)]" />
                                            <span>Redact before external inference</span>
                                        </label>
                                        <label className="flex items-center space-x-2 cursor-pointer">
                                            <input type="checkbox" checked className="rounded bg-zinc-800 border-zinc-700 text-[var(--accent)] focus:ring-[var(--accent)]" />
                                            <span>Redact before memory persistence</span>
                                        </label>
                                        <label className="flex items-center space-x-2 cursor-pointer">
                                            <input type="checkbox" checked className="rounded bg-zinc-800 border-zinc-700 text-[var(--accent)] focus:ring-[var(--accent)]" />
                                            <span>Scrub plain keys from Pino log exports</span>
                                        </label>
                                    </div>
                                </div>
                            </div>

                            
                            <div className="space-y-4 md:col-span-2">
                                <h3 className="text-sm font-black text-[var(--accent)] flex items-center space-x-2">
                                    <i data-lucide="binary" className="w-4 h-4"></i>
                                    <span>Environment Isolation Rules</span>
                                </h3>

                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-[var(--bg-nested)] border border-[var(--card-border)] rounded-xl p-4">
                                    <div className="flex items-center justify-between p-2 rounded bg-[var(--bg-surface)] border border-[var(--card-border)]">
                                        <div>
                                            <span className="text-xs font-bold block">Network Isolation</span>
                                            <span className="text-[9px] text-[var(--text-muted)] font-semibold block">unshare --net sandbox</span>
                                        </div>
                                        <input type="checkbox" id="check-net" checked className="w-4 h-4 text-[var(--accent)] bg-zinc-800 border-zinc-700 rounded focus:ring-[var(--accent)]" />
                                    </div>
                                    <div className="flex items-center justify-between p-2 rounded bg-[var(--bg-surface)] border border-[var(--card-border)]">
                                        <div>
                                            <span className="text-xs font-bold block">Seccomp Profiles</span>
                                            <span className="text-[9px] text-[var(--text-muted)] font-semibold block">Limit host system calls</span>
                                        </div>
                                        <input type="checkbox" id="check-seccomp" checked className="w-4 h-4 text-[var(--accent)] bg-zinc-800 border-zinc-700 rounded focus:ring-[var(--accent)]" />
                                    </div>
                                    <div className="flex items-center justify-between p-2 rounded bg-[var(--bg-surface)] border border-[var(--card-border)]">
                                        <div>
                                            <span className="text-xs font-bold block">Read-Only Runtime</span>
                                            <span className="text-[9px] text-[var(--text-muted)] font-semibold block">Secure root filesystem</span>
                                        </div>
                                        <input type="checkbox" id="check-readonly" checked className="w-4 h-4 text-[var(--accent)] bg-zinc-800 border-zinc-700 rounded focus:ring-[var(--accent)]" />
                                    </div>
                                </div>
                            </div>

                        </div>

                        
                        <div className="flex justify-end space-x-3 pt-6 border-t border-[var(--card-border)] mt-auto">
                            <button  className="px-5 py-2 rounded-xl bg-[var(--bg-nested)] hover:opacity-90 text-sm font-bold border border-[var(--card-border)] transition focusable">Reset Defaults</button>
                            <button  className="px-5 py-2 rounded-xl bg-gradient-to-r from-[var(--accent)] to-teal-600 hover:opacity-90 text-white dark:text-zinc-950 font-black text-sm transition shadow-lg shadow-[var(--accent-glow)] focusable">Apply Configurations</button>
                        </div>

                    </div>
                </div>

                
                <div className="w-full lg:w-96 flex flex-col space-y-6">
                    
                    
                    <div className="glow-card rounded-2xl p-5 relative overflow-hidden transition-colors duration-300" role="region" aria-label="Safety Assertions Status">
                        <div className="flex items-center justify-between border-b border-[var(--card-border)] pb-3 mb-4">
                            <div className="flex items-center space-x-2 text-[var(--accent)]">
                                <i data-lucide="shield-check" className="w-4 h-4"></i>
                                <h3 className="font-bold text-xs tracking-wider uppercase">Category A Guardrails</h3>
                            </div>
                            <span className="text-[10px] text-green-500 font-bold uppercase tracking-wider font-mono">ENFORCED</span>
                        </div>

                        
                        <div className="space-y-3 text-xs">
                            <div className="flex items-start space-x-2 border-b border-[var(--card-border)] pb-2">
                                <i data-lucide="check-circle-2" className="w-4 h-4 text-green-500 mt-0.5"></i>
                                <div>
                                    <span className="font-bold block text-[var(--text-primary)]">SA-01: Explanations SQL Block</span>
                                    <p className="text-[11px] text-[var(--text-muted)] font-medium">No INSERT/UPDATE queries permitted in explanation paths.</p>
                                </div>
                            </div>
                            <div className="flex items-start space-x-2 border-b border-[var(--card-border)] pb-2">
                                <i data-lucide="check-circle-2" className="w-4 h-4 text-green-500 mt-0.5"></i>
                                <div>
                                    <span className="font-bold block text-[var(--text-primary)]">SA-02: Executive Code Quarantine</span>
                                    <p className="text-[11px] text-[var(--text-muted)] font-medium">Strictly forbids raw bash, sh, or python compilation blocks.</p>
                                </div>
                            </div>
                            <div className="flex items-start space-x-2">
                                <i data-lucide="check-circle-2" className="w-4 h-4 text-green-500 mt-0.5"></i>
                                <div>
                                    <span className="font-bold block text-[var(--text-primary)]">SA-04: Node Category Sanity</span>
                                    <p className="text-[11px] text-[var(--text-muted)] font-medium">Workflows forbidden from adding shell, exec, or eval nodes.</p>
                                </div>
                            </div>
                        </div>
                    </div>

                </div>
            </div>

        </main>
    </div>

    
    <footer className="w-full h-8 bg-zinc-950 border-t border-[var(--card-border)] px-4 flex items-center justify-between text-[10px] text-zinc-500 font-mono z-25 relative transition-colors duration-300">
        <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-1.5">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                <span className="font-bold text-green-400 uppercase">Hono Daemon Online</span>
            </div>
            <span>|</span>
            <span>Port: <strong className="text-[var(--accent)] font-bold">127.0.0.1:4096</strong></span>
            <span>|</span>
            <span>Database: <strong className="text-[var(--accent)] font-bold">BaseVault.db</strong></span>
        </div>
        <div className="flex items-center space-x-4">
            <span>Verified Confidence Metrics: <strong className="text-green-400 font-bold">398 Tests Pass</strong></span>
            <span>|</span>
            <span>Supply Chain: <strong className="text-green-400 font-bold">CycloneDX Compliant</strong></span>
        </div>
    </footer>

    
    <div id="chat-sentinel" className="fixed bottom-12 right-6 z-50 flex flex-col items-end">
        
        
        <button  className="w-12 h-12 rounded-full bg-gradient-to-tr from-[var(--accent)] to-teal-600 text-white dark:text-zinc-950 flex items-center justify-center shadow-lg shadow-[var(--accent-glow)] hover:scale-105 transform transition duration-200 focusable" aria-label="Toggle Cerebro chatbot assistant">
            <i data-lucide="bot-message-square" className="w-6 h-6"></i>
        </button>

        
        <div id="chat-box" className="w-80 h-96 bg-[var(--bg-surface-glass)] backdrop-blur-md border border-[var(--card-border)] rounded-2xl shadow-2xl mt-3 hidden flex-col overflow-hidden transition-all duration-300">
            
            <div className="bg-gradient-to-r from-zinc-950 to-teal-950 p-3 flex items-center justify-between border-b border-[var(--card-border)]">
                <div className="flex items-center space-x-2">
                    <span className="w-2 h-2 rounded-full bg-green-400"></span>
                    <span className="text-xs font-bold tracking-wide uppercase text-white">Cerebro Assist Sentinel</span>
                </div>
                <button  className="text-zinc-400 hover:text-white" aria-label="Minimize chatbot">
                    <i data-lucide="minus" className="w-4 h-4"></i>
                </button>
            </div>

            
            <div id="chat-conversation" className="flex-1 overflow-y-auto p-4 space-y-3 text-xs">
                <div className="bg-[var(--terminal-bg)] text-[var(--terminal-text)] border border-[var(--accent)]/20 p-2.5 rounded-xl rounded-tl-none self-start max-w-[85%] leading-relaxed">
                    <span className="font-black text-[10px] text-[var(--accent)] block mb-1">CEREBRO SENTINEL:</span>
                    Welcome, Billie. Let us synthesize and map your local cognitive topology. Ask me anything about PortGrid's tools sandbox, escape validation, or autonomy dails.
                </div>
            </div>

            
            <div className="p-2 border-t border-[var(--card-border)] bg-zinc-950/50 flex items-center space-x-1">
                <input id="chat-input-field" type="text" placeholder="Query our local cognitive nexus..." className="flex-1 bg-[var(--bg-surface)] border border-[var(--card-border)] text-xs rounded-lg px-3 py-2 text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"  />
                <button  className="p-2 bg-[var(--accent)] text-white dark:text-zinc-950 hover:opacity-90 rounded-lg transition focusable" aria-label="Send query">
                    <i data-lucide="send" className="w-3.5 h-3.5"></i>
                </button>
            </div>
        </div>
    </div>

    
    <div id="alert-toast" className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50 bg-[var(--bg-surface-glass)] backdrop-blur-md border border-[var(--card-border)] p-4 rounded-xl shadow-2xl transition-all duration-300 pointer-events-none opacity-0 flex items-center space-x-3 max-w-sm">
        <div id="alert-icon-wrapper" className="w-8 h-8 rounded-full flex items-center justify-center"></div>
        <div className="flex-1">
            <span id="alert-title" className="font-bold text-xs block text-[var(--accent)] uppercase tracking-wider"></span>
            <p id="alert-body" className="text-[11px] text-[var(--text-muted)] mt-0.5 font-bold"></p>
        </div>
    </div>

    
    <div id="meta-explorer" className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center hidden p-6">
        <div className="w-full max-w-2xl bg-[var(--bg-surface)] border border-[var(--card-border)] rounded-2xl p-6 shadow-2xl flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between border-b border-[var(--card-border)] pb-3 mb-4">
                <div className="flex items-center space-x-2 text-[var(--accent)]">
                    <i data-lucide="database" className="w-5 h-5"></i>
                    <h2 className="font-bold text-lg">System Cognitive Metadata Mapping</h2>
                </div>
                <button  className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-white" aria-label="Close schema view">
                    <i data-lucide="x" className="w-5 h-5"></i>
                </button>
            </div>
            
            <p className="text-xs text-[var(--text-muted)] mb-4 font-semibold">
                Below is the verified programmatical list of system cognitive structures parsed directly from our active <code className="bg-[var(--bg-nested)] border border-[var(--card-border)] px-1 rounded">&lt;meta&gt;</code> Tags.
            </p>

            <div id="meta-tag-list" className="flex-1 overflow-y-auto space-y-3 font-mono text-[11px] pr-2">
                
            </div>
            
            <div className="mt-4 pt-3 border-t border-[var(--card-border)] flex justify-end">
                <button  className="bg-[var(--accent)] text-white dark:text-zinc-950 px-4 py-2 rounded-xl text-xs font-bold focusable">
                    Return to cockpit
                </button>
            </div>
        </div>
    </div>

    
    <div id="intent-modal" className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center hidden p-6">
        <div className="w-full max-w-xl bg-[var(--bg-surface)] border border-[var(--card-border)] rounded-2xl p-6 shadow-2xl flex flex-col">
            <div className="flex items-center justify-between border-b border-[var(--card-border)] pb-3 mb-4">
                <div className="flex items-center space-x-2 text-[var(--accent)]">
                    <i data-lucide="split" className="w-5 h-5"></i>
                    <h2 className="font-black text-lg uppercase tracking-wide">Decision Node Audit</h2>
                </div>
                <button  className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-white" aria-label="Close preview">
                    <i data-lucide="x" className="w-5 h-5"></i>
                </button>
            </div>

            <p className="text-xs text-[var(--text-muted)] mb-4">
                Rather than loading exhausting background terminal spam, PortGrid models a clean intent preview of the current processing cycle.
            </p>

            <div className="bg-zinc-950 border border-[var(--card-border)] p-4 rounded-xl space-y-3 font-mono text-xs text-[var(--terminal-text)]">
                <div className="flex items-center space-x-2">
                    <i data-lucide="check-circle" className="w-4 h-4 text-green-400"></i>
                    <span>CLAIM WORKFLOW: [wf_7a8d29b] -&gt; claimed by [worker-3]</span>
                </div>
                <div className="flex items-center space-x-2 pl-4 border-l border-zinc-800">
                    <i data-lucide="arrow-right" className="w-3.5 h-3.5 text-zinc-500"></i>
                    <span>Execute command: <code className="bg-zinc-900 px-1 rounded text-yellow-400">ls -la</code> (Safe allowlist Match)</span>
                </div>
                <div className="flex items-center space-x-2 pl-4 border-l border-zinc-800 text-green-400">
                    <i data-lucide="shield" className="w-3.5 h-3.5"></i>
                    <span>Verification complete. Output scrubbed: 0 credentials parsed.</span>
                </div>
            </div>

            <div className="mt-5 pt-3 border-t border-[var(--card-border)] flex justify-end space-x-2">
                <button  className="px-4 py-2 rounded-xl bg-zinc-800 text-zinc-300 text-xs font-bold transition">Close</button>
                <button  className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition">Force Cancel Run</button>
            </div>
        </div>
    </div>

    
    

    </>
  );
}
