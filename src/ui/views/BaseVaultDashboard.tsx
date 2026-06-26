
import React, { useState, useEffect } from 'react';


export function BaseVaultDashboard() {
  useEffect(() => {
    // Make sure lucid icons render on initial mount
    try {
      (window as any).lucide?.createIcons();
    } catch(e) {}
  }, []);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        /* CSS Variable System for Gold-to-Amber Theme Morphing */
        :root {
            /* Dark Mode: Cyber-Gold/Bronze Theme matching the BaseVault Shield Logo */
            --bg-base: #0a0904;
            --bg-surface: #131109;
            --bg-surface-glass: rgba(19, 17, 9, 0.75);
            --bg-nested: rgba(212, 175, 55, 0.03);
            --border-glow: rgba(212, 175, 55, 0.2);
            --text-primary: #fafafa;
            --text-muted: #d4af37;
            --accent: #D4AF37;
            --accent-glow: rgba(212, 175, 55, 0.35);
            --card-border: rgba(69, 56, 18, 0.8);
            --grid-color: rgba(212, 175, 55, 0.04);
            --grid-line: rgba(212, 175, 55, 0.02);
            --glow-color: rgba(212, 175, 55, 0.15);
            --logo-accent: #D4AF37;
            --terminal-bg: #030301;
            --terminal-text: #fcd34d;
        }

        .light {
            /* Light Mode: Luxury Warm Paper & Bronze Gold - Super Textured & Readable */
            --bg-base: #faf8f2;
            --bg-surface: #ffffff;
            --bg-surface-glass: rgba(255, 255, 255, 0.85);
            --bg-nested: rgba(180, 83, 9, 0.05);
            --border-glow: rgba(180, 83, 9, 0.15);
            --text-primary: #451a03;
            --text-muted: #b45309;
            --accent: #d97706;
            --accent-glow: rgba(217, 119, 6, 0.35);
            --card-border: rgba(180, 83, 9, 0.2);
            --grid-color: rgba(180, 83, 9, 0.06);
            --grid-line: rgba(180, 83, 9, 0.04);
            --glow-color: rgba(180, 83, 9, 0.08);
            --logo-accent: #b45309;
            --terminal-bg: #2d1601;
            --terminal-text: #fef3c7;
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
                <svg id="basevault-logo" viewBox="0 0 100 100" className="w-8 h-8 transition-all duration-300 text-[var(--accent)]">
                    <path d="M50 10 L90 25 L90 55 C90 75 50 90 50 90 C50 90 10 75 10 55 L10 25 Z" fill="rgba(212,175,55,0.05)" stroke="currentColor" strokeWidth="3" strokeLinejoin="round"/>
                    <g transform="translate(50,53) scale(0.55) translate(-50,-50)">
                        <g transform="rotate(45,50,50)">
                            <path d="M 56 85 L 56 68 L 60 68 L 60 45 L 75 30 L 75 10 L 58 10 L 58 28 L 42 28 L 42 10 L 25 10 L 25 30 L 40 45 L 40 68 L 44 68 L 44 85 Z" fill="rgba(212,175,55,0.15)" stroke="currentColor" strokeWidth="4" strokeLinejoin="round"/>
                            <rect x="46" y="74" width="3" height="5" fill="#0D0E15"/>
                            <rect x="51" y="74" width="3" height="5" fill="#0D0E15"/>
                            <rect x="48" y="40" width="4" height="24" rx="2" fill="currentColor" />
                        </g>
                    </g>
                </svg>
            </div>
            
            <div className="hidden sm:block">
                <span className="font-black text-sm tracking-wider uppercase bg-clip-text text-transparent bg-gradient-to-r from-[var(--text-primary)] via-[var(--accent)] to-[var(--text-primary)]">BASEVAULT ENGINE</span>
                <span className="text-[9px] uppercase font-semibold text-[var(--text-muted)] tracking-widest block -mt-1">NeuroSync Sovereign Suite</span>
            </div>
        </div>

        
        <div className="flex bg-[var(--bg-nested)] p-1 rounded-xl border border-[var(--card-border)] items-center space-x-1" role="tablist" aria-label="Core Navigation">
            <button id="tab-dashboard"  className="px-5 py-1.5 rounded-lg text-sm font-semibold transition-all duration-200 flex items-center space-x-2 text-white bg-[var(--accent)] shadow shadow-[var(--accent-glow)] focusable" role="tab" aria-selected="true" aria-controls="panel-dashboard">
                <i data-lucide="layout-dashboard" className="w-4 h-4"></i>
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

        
        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
            <button  className="w-full flex items-center p-3 rounded-xl hover:bg-[var(--bg-nested)] border border-transparent hover:border-[var(--card-border)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition text-left focusable">
                <i data-lucide="cpu" className="w-4 h-4 mr-3"></i>
                <span className="text-xs font-bold uppercase tracking-wider">CoreExec (Orchestrator)</span>
            </button>

            <a href="#" className="flex items-center justify-between p-3 rounded-xl bg-[var(--accent)]/10 border border-[var(--accent)] text-[var(--text-primary)] transition focusable">
                <div className="flex items-center space-x-3">
                    <i data-lucide="vault" className="w-4 h-4 text-[var(--accent)]"></i>
                    <span className="text-xs font-bold uppercase tracking-wider">BaseVault (Database)</span>
                </div>
                <span className="w-2 h-2 rounded-full bg-[var(--accent)] animate-pulse"></span>
            </a>

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

        <div className="p-4 border-t border-[var(--card-border)] bg-zinc-900/20 text-[10px] text-zinc-500 flex flex-col space-y-1">
            <span>Sovereign Platform Framework</span>
            <span>Design Core: Grit, Not Grime</span>
        </div>
    </aside>

    
    <aside id="sidebar-panel" className="fixed right-0 top-16 h-[calc(100vh-4rem)] w-80 bg-[var(--bg-surface-glass)] backdrop-blur-md border-l border-[var(--card-border)] z-30 transition-transform duration-300 transform translate-x-0 shadow-2xl flex flex-col">
        
        <div className="p-4 border-b border-[var(--card-border)] flex items-center justify-between">
            <div className="flex items-center space-x-2 text-[var(--accent)]">
                <i data-lucide="folder-lock" className="w-4 h-4"></i>
                <h3 className="font-bold text-sm tracking-wider uppercase">Active Vault Scope</h3>
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
                    BaseVault uses transactional <code className="bg-[var(--bg-surface)] border border-[var(--card-border)] px-1 rounded text-[var(--text-primary)]">better-sqlite3</code> bindings.
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

            
            <div className="bg-[var(--bg-nested)] border border-[var(--card-border)] rounded-lg p-3 space-y-3">
                <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider flex items-center space-x-1.5">
                    <i data-lucide="gauge" className="w-3.5 h-3.5 text-[var(--accent)]"></i>
                    <span>Database Defrag & Vacuum</span>
                </span>
                <p className="text-[11px] text-[var(--text-muted)] leading-relaxed font-medium">
                    Re-index b-trees and compact memory fragments to maintain high-frequency transactional point reads.
                </p>
                <button  className="w-full bg-[var(--accent)] hover:opacity-90 text-white dark:text-zinc-950 py-1.5 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center space-x-2 focusable">
                    <i data-lucide="shrink" className="w-3.5 h-3.5"></i>
                    <span>Execute VACUUM & REINDEX</span>
                </button>
            </div>

            
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-[var(--text-muted)] tracking-wider uppercase">Basevault DB Operations Log</label>
                    <button  className="text-[10px] text-[var(--accent)] hover:underline font-bold">Clear</button>
                </div>
                <div id="pino-logger" className="w-full h-44 bg-zinc-950 border border-[var(--card-border)] rounded-lg p-2 font-mono text-[9px] text-zinc-300 overflow-y-auto space-y-1">
                    <div className="text-zinc-500">INIT: BaseVault connection established...</div>
                    <div className="text-zinc-500">INIT: Dynamic Model Router initialized...</div>
                    <div className="text-[var(--accent)]">AUDIT: Loaded project silo: alex-workspace</div>
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
                                <h1 className="text-xl font-black tracking-wide">BaseVault Migration & Redaction Control</h1>
                                <p className="text-xs text-[var(--text-muted)] mt-0.5 font-medium">Verify relational schema migrations, run security audit pipelines, and preview redaction filters.</p>
                            </div>
                            
                            <button  id="run-flow-btn" className="px-5 py-2 rounded-xl bg-gradient-to-r from-[var(--accent)] via-amber-600 to-yellow-600 hover:opacity-95 text-white dark:text-zinc-950 dark:font-extrabold text-sm font-bold flex items-center justify-center space-x-2 transition-all shadow-lg shadow-[var(--accent-glow)] focusable">
                                <i data-lucide="clipboard-check" className="w-4 h-4 text-white dark:text-zinc-950"></i>
                                <span>Verify SQLite Schema</span>
                            </button>
                        </div>

                        
                        <div className="border border-[var(--card-border)] bg-zinc-950/40 dark:bg-zinc-950/80 rounded-xl p-5 relative overflow-hidden flex flex-col space-y-4">
                            <span className="text-[10px] font-bold text-zinc-500 tracking-widest uppercase font-mono">SQLite Migration Timeline (v1 - v9)</span>
                            
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 relative z-10 pt-2">
                                
                                <div id="mig-v1" className="bg-[var(--bg-surface)] border border-[var(--accent)]/40 rounded-xl p-3 flex flex-col justify-between shadow-sm relative">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[9px] font-mono text-zinc-500">v01</span>
                                        <i data-lucide="check-circle" className="w-3.5 h-3.5 text-[var(--accent)]"></i>
                                    </div>
                                    <span className="text-[11px] font-black tracking-wide mt-2 block">SQLite Bootstrap</span>
                                    <span className="text-[8px] text-zinc-500 font-mono block mt-1">Core Tables</span>
                                </div>

                                
                                <div id="mig-v4" className="bg-[var(--bg-surface)] border border-[var(--accent)]/40 rounded-xl p-3 flex flex-col justify-between shadow-sm relative">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[9px] font-mono text-zinc-500">v04</span>
                                        <i data-lucide="check-circle" className="w-3.5 h-3.5 text-[var(--accent)]"></i>
                                    </div>
                                    <span className="text-[11px] font-black tracking-wide mt-2 block">Task Claim Locks</span>
                                    <span className="text-[8px] text-zinc-500 font-mono block mt-1">BEGIN IMMEDIATE</span>
                                </div>

                                
                                <div id="mig-v6" className="bg-[var(--bg-surface)] border border-[var(--accent)]/40 rounded-xl p-3 flex flex-col justify-between shadow-sm relative">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[9px] font-mono text-zinc-500">v06</span>
                                        <i data-lucide="check-circle" className="w-3.5 h-3.5 text-[var(--accent)]"></i>
                                    </div>
                                    <span className="text-[11px] font-black tracking-wide mt-2 block">Redaction Filters</span>
                                    <span className="text-[8px] text-zinc-500 font-mono block mt-1">PII Serializers</span>
                                </div>

                                
                                <div id="mig-v8" className="bg-[var(--bg-surface)] border border-[var(--accent)]/40 rounded-xl p-3 flex flex-col justify-between shadow-sm relative">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[9px] font-mono text-zinc-500">v08</span>
                                        <i data-lucide="check-circle" className="w-3.5 h-3.5 text-[var(--accent)]"></i>
                                    </div>
                                    <span className="text-[11px] font-black tracking-wide mt-2 block">Cerebro Decay</span>
                                    <span className="text-[8px] text-zinc-500 font-mono block mt-1">Habituation Matrix</span>
                                </div>

                                
                                <div id="mig-v9" className="bg-[var(--bg-surface)] border border-[var(--card-border)] rounded-xl p-3 flex flex-col justify-between shadow-sm relative transition-all duration-300">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[9px] font-mono text-zinc-500">v09</span>
                                        <i id="mig-v9-icon" data-lucide="circle-dot" className="w-3.5 h-3.5 text-zinc-500"></i>
                                    </div>
                                    <span className="text-xs font-black tracking-wide block">Schema 9.x</span>
                                    <span className="text-[9px] text-zinc-500 font-mono block mt-1">Ready to Deploy</span>
                                </div>
                            </div>

                            <div className="w-full bg-[var(--bg-nested)] p-3 border-t border-[var(--card-border)] flex flex-wrap gap-2 items-center justify-between">
                                <span className="text-xs font-bold text-[var(--text-muted)]">Active Verification Checkpoints:</span>
                                <div className="flex flex-wrap gap-2">
                                    <span className="px-2 py-1 bg-green-500/10 text-green-400 text-[10px] rounded-lg font-black tracking-wide border border-green-500/20 flex items-center space-x-1">
                                        <i data-lucide="shield" className="w-3.5 h-3.5"></i>
                                        <span>Assume Breach Invariants Enforced</span>
                                    </span>
                                    <span className="px-2 py-1 bg-[var(--accent)]/10 text-[var(--accent)] text-[10px] rounded-lg font-black tracking-wide border border-[var(--accent)]/20 flex items-center space-x-1">
                                        <i data-lucide="database" className="w-3.5 h-3.5"></i>
                                        <span>WAL Mode Active</span>
                                    </span>
                                </div>
                            </div>
                        </div>

                        
                        <div className="border border-[var(--card-border)] bg-[var(--bg-nested)] p-5 rounded-2xl space-y-4">
                            <div className="flex items-center justify-between">
                                <h3 className="text-sm font-black uppercase tracking-wider text-[var(--accent)] flex items-center space-x-2">
                                    <i data-lucide="scan-line" className="w-4 h-4"></i>
                                    <span>Pre-Inference Redaction Bench</span>
                                </h3>
                                
                                <div className="flex space-x-1 bg-zinc-950 p-1 rounded-lg border border-[var(--card-border)]">
                                    <button  id="btn-red-public" className="px-3 py-1 rounded text-[10px] font-bold uppercase transition bg-[var(--accent)] text-zinc-950">Public</button>
                                    <button  id="btn-red-internal" className="px-3 py-1 rounded text-[10px] font-bold uppercase transition text-zinc-400">Internal</button>
                                    <button  id="btn-red-confidential" className="px-3 py-1 rounded text-[10px] font-bold uppercase transition text-zinc-400">Confidential</button>
                                </div>
                            </div>

                            <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                                Type any sensitive values (API Keys, emails, client credentials) inside the terminal text box below. The BaseVault Serializer automatically scrubs strings before database logging or external provider transmission.
                            </p>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                
                                <div className="flex flex-col space-y-1.5">
                                    <label className="text-[10px] font-bold uppercase text-zinc-400 tracking-wider">Unsanitized String Payload</label>
                                    <textarea id="redaction-raw-input" className="w-full h-24 bg-[var(--bg-surface)] border border-[var(--card-border)] p-3 rounded-xl font-mono text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] focusable" placeholder="Example: My email is alex@gmail.com and my secret token is sk-5573882746428819..." onInput={() => {}}></textarea>
                                </div>
                                
                                <div className="flex flex-col space-y-1.5">
                                    <label className="text-[10px] font-bold uppercase text-zinc-400 tracking-wider">Sanitized Preview Output</label>
                                    <div id="redaction-sanitized-output" className="w-full h-24 bg-zinc-950 border border-[var(--card-border)] p-3 rounded-xl font-mono text-xs text-green-400 overflow-y-auto leading-relaxed select-text">
                                        Waiting for unsanitized payload...
                                    </div>
                                </div>
                            </div>
                        </div>

                    </div>
                </div>

                
                <div className="w-full lg:w-96 flex flex-col space-y-6">
                    
                    
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
                                    <div id="quota-progress" className="h-full bg-gradient-to-r from-[var(--accent)] to-amber-600 rounded-full transition-all duration-300" style={{ width: '25%' }}></div>
                                </div>
                            </div>

                            
                            <div className="space-y-1">
                                <div className="flex justify-between text-[11px] text-[var(--text-muted)] font-medium">
                                    <label htmlFor="quota-slider">Adjust Daily Cap (tokens)</label>
                                    <span id="cap-display">50,000 cap</span>
                                </div>
                                <input type="range" id="quota-slider" min="10000" max="100000" step="5000" value="50000" onInput={() => {}} className="w-full h-1 bg-[var(--card-border)] rounded-lg appearance-none cursor-pointer accent-[var(--accent)]" />
                            </div>

                            
                            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[var(--card-border)] text-center">
                                <div className="bg-[var(--bg-nested)] p-2 rounded-lg border border-[var(--card-border)]">
                                    <span className="text-[9px] text-[var(--text-muted)] font-bold uppercase block">Forecast Status</span>
                                    <span className="text-xs font-bold text-green-500 uppercase">SAFE TO RUN</span>
                                </div>
                                <div className="bg-[var(--bg-nested)] p-2 rounded-lg border border-[var(--card-border)]">
                                    <span className="text-[9px] text-[var(--text-muted)] font-bold uppercase block">Daily calls used</span>
                                    <span id="calls-count-dashboard" className="text-xs font-bold text-[var(--accent)]">22 calls</span>
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

                    
                    <div className="glow-card rounded-2xl p-5 relative overflow-hidden transition-colors duration-300" role="region" aria-label="Database Relational Telemetry">
                        <div className="flex items-center justify-between border-b border-[var(--card-border)] pb-3 mb-4">
                            <div className="flex items-center space-x-2 text-[var(--accent)]">
                                <i data-lucide="activity" className="w-4 h-4"></i>
                                <h3 className="font-bold text-xs tracking-wider uppercase">BaseVault Stats</h3>
                            </div>
                            <span className="text-[9px] font-mono text-zinc-500">Relational SQLite Metrics</span>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="bg-[var(--bg-nested)] p-2.5 rounded-xl border border-[var(--card-border)] text-center space-y-1">
                                <span className="text-[9px] text-[var(--text-muted)] font-bold uppercase block">Database Size</span>
                                <span id="db-file-size" className="text-sm font-bold text-[var(--accent)]">14.8 MB</span>
                                <div className="w-full h-1 bg-[var(--card-border)] rounded-full overflow-hidden">
                                    <div id="db-size-progress" className="h-full bg-[var(--accent)] rounded-full" style={{ width: '38%' }}></div>
                                </div>
                            </div>
                            <div className="bg-[var(--bg-nested)] p-2.5 rounded-xl border border-[var(--card-border)] text-center space-y-1">
                                <span className="text-[9px] text-[var(--text-muted)] font-bold uppercase block">Query Latency</span>
                                <span id="db-latency" className="text-sm font-bold text-[var(--accent)]">0.82 ms</span>
                                <div className="w-full h-1 bg-[var(--card-border)] rounded-full overflow-hidden">
                                    <div id="db-latency-progress" className="h-full bg-[var(--accent)] rounded-full" style={{ width: '15%' }}></div>
                                </div>
                            </div>
                            <div className="bg-[var(--bg-nested)] p-2.5 rounded-xl border border-[var(--card-border)] text-center space-y-1 col-span-2 flex justify-between items-center px-4">
                                <div>
                                    <span className="text-[9px] text-[var(--text-muted)] font-bold uppercase block text-left">WAL Checkpoints</span>
                                    <span id="wal-status" className="text-xs font-bold text-green-500">22 passes/min (Healthy)</span>
                                </div>
                                <i data-lucide="check-circle" className="w-5 h-5 text-green-500"></i>
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
                            <h1 className="text-xl font-black tracking-wide">BaseVault Engine Set-ups</h1>
                            <p className="text-xs text-[var(--text-muted)] mt-0.5 font-medium">Control transaction locks, retention sweeps, Ebbinghaus habituation thresholds, and memory scoping.</p>
                        </div>

                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                            
                            
                            <div className="space-y-4">
                                <h3 className="text-sm font-black text-[var(--accent)] flex items-center space-x-2">
                                    <i data-lucide="lock" className="w-4 h-4"></i>
                                    <span>Database Locks & Concurrency</span>
                                </h3>

                                <div className="space-y-3 bg-[var(--bg-nested)] border border-[var(--card-border)] rounded-xl p-4">
                                    
                                    <div className="space-y-1">
                                        <label htmlFor="lock-select" className="text-xs font-bold text-[var(--text-muted)]">Active Lock Level</label>
                                        <select id="lock-select" className="w-full bg-[var(--bg-surface)] border border-[var(--card-border)] rounded-lg px-2.5 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] focusable">
                                            <option value="begin-immediate">BEGIN IMMEDIATE (Atomic isolation)</option>
                                            <option value="standard">Standard POSIX Lock</option>
                                        </select>
                                    </div>
                                    
                                    <div className="space-y-2">
                                        <div className="flex justify-between text-xs">
                                            <span className="text-[var(--text-muted)] font-semibold">Max Connection Pool</span>
                                            <span id="threads-display" className="font-black text-[var(--accent)]">3 readers (Safe max)</span>
                                        </div>
                                        <input type="range" min="1" max="8" value="3" onInput={() => {}} className="w-full h-1 bg-[var(--card-border)] rounded-lg appearance-none cursor-pointer accent-[var(--accent)]" />
                                    </div>
                                </div>
                            </div>

                            
                            <div className="space-y-4">
                                <h3 className="text-sm font-black text-[var(--accent)] flex items-center space-x-2">
                                    <i data-lucide="repeat" className="w-4 h-4"></i>
                                    <span>Consolidation & Habituation</span>
                                </h3>

                                <div className="space-y-3 bg-[var(--bg-nested)] border border-[var(--card-border)] rounded-xl p-4">
                                    
                                    <div className="space-y-1">
                                        <label htmlFor="sweep-select" className="text-xs font-bold text-[var(--text-muted)]">Worker Sweep Interval</label>
                                        <select id="sweep-select" className="w-full bg-[var(--bg-surface)] border border-[var(--card-border)] rounded-lg px-2.5 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] focusable">
                                            <option value="off-peak">Off-Peak Idle Cycles (Default)</option>
                                            <option value="every-hour">Once every hour</option>
                                            <option value="realtime">Continuous Stream Sync</option>
                                        </select>
                                    </div>
                                    
                                    <div className="space-y-2">
                                        <div className="flex justify-between text-xs">
                                            <span className="text-[var(--text-muted)] font-semibold">Memory Decay Half-life</span>
                                            <span id="decay-display" className="font-black text-[var(--accent)]">30 Days</span>
                                        </div>
                                        <input type="range" min="7" max="90" value="30" onInput={() => {}} className="w-full h-1 bg-[var(--card-border)] rounded-lg appearance-none cursor-pointer accent-[var(--accent)]" />
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
                                        <input type="checkbox" checked className="w-4 h-4 text-[var(--accent)] bg-zinc-800 border-zinc-700 rounded focus:ring-[var(--accent)]" />
                                    </div>
                                    <div className="flex items-center justify-between p-2 rounded bg-[var(--bg-surface)] border border-[var(--card-border)]">
                                        <div>
                                            <span className="text-xs font-bold block">Seccomp Profiles</span>
                                            <span className="text-[9px] text-[var(--text-muted)] font-semibold block">Limit host system calls</span>
                                        </div>
                                        <input type="checkbox" checked className="w-4 h-4 text-[var(--accent)] bg-zinc-800 border-zinc-700 rounded focus:ring-[var(--accent)]" />
                                    </div>
                                    <div className="flex items-center justify-between p-2 rounded bg-[var(--bg-surface)] border border-[var(--card-border)]">
                                        <div>
                                            <span className="text-xs font-bold block">Read-Only Runtime</span>
                                            <span className="text-[9px] text-[var(--text-muted)] font-semibold block">Secure root filesystem</span>
                                        </div>
                                        <input type="checkbox" checked className="w-4 h-4 text-[var(--accent)] bg-zinc-800 border-zinc-700 rounded focus:ring-[var(--accent)]" />
                                    </div>
                                </div>
                            </div>

                        </div>

                        
                        <div className="flex justify-end space-x-3 pt-6 border-t border-[var(--card-border)] mt-auto">
                            <button  className="px-5 py-2 rounded-xl bg-[var(--bg-nested)] hover:opacity-90 text-sm font-bold border border-[var(--card-border)] transition focusable">Reset Defaults</button>
                            <button  className="px-5 py-2 rounded-xl bg-gradient-to-r from-[var(--accent)] to-amber-600 hover:opacity-90 text-white dark:text-zinc-950 font-black text-sm transition shadow-lg shadow-[var(--accent-glow)] focusable">Apply Configurations</button>
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

                    
                    <div className="glow-card rounded-2xl p-5 relative overflow-hidden transition-colors duration-300" role="region" aria-label="Relational Partitioning Integrity">
                        <div className="flex items-center justify-between border-b border-[var(--card-border)] pb-3 mb-4">
                            <div className="flex items-center space-x-2 text-[var(--accent)]">
                                <i data-lucide="layers" className="w-4 h-4"></i>
                                <h3 className="font-bold text-xs tracking-wider uppercase">Workspace Isolations</h3>
                            </div>
                            <span className="text-[9px] text-zinc-500 font-mono">Row-level query scoping</span>
                        </div>

                        
                        <div className="space-y-2">
                            <div className="flex items-center justify-between p-2 rounded bg-[var(--accent)]/5 border border-[var(--accent)]/20 text-xs">
                                <span className="font-bold text-[var(--text-primary)]">Workspace isolation check</span>
                                <span className="text-[9px] font-mono text-[var(--text-primary)] bg-[var(--bg-nested)] border border-[var(--card-border)] px-1.5 py-0.5 rounded font-bold">100% Isolated</span>
                            </div>
                            <div className="flex items-center justify-between p-2 rounded bg-[var(--bg-nested)] border border-[var(--card-border)] text-xs">
                                <span className="font-bold text-[var(--text-muted)]">Kahn Cycle Detection</span>
                                <span className="text-[9px] font-mono text-zinc-500 font-bold">Active</span>
                            </div>
                            <div className="flex items-center justify-between p-2 rounded bg-[var(--bg-nested)] border border-[var(--card-border)] text-xs">
                                <span className="font-bold text-[var(--text-muted)]">Unredacted DB logs blocking</span>
                                <span className="text-[9px] font-mono text-green-500 bg-green-500/10 border border-green-500/20 px-1.5 py-0.5 rounded font-bold uppercase">Locked</span>
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
            <span>Port: <strong className="text-[var(--accent)]">127.0.0.1:4096</strong></span>
            <span>|</span>
            <span>Database: <strong className="text-[var(--accent)]">BaseVault.db</strong></span>
        </div>
        <div className="flex items-center space-x-4">
            <span>Verified Confidence Metrics: <strong className="text-green-400 font-bold">398 Tests Pass</strong></span>
            <span>|</span>
            <span>Supply Chain: <strong className="text-green-400 font-bold">CycloneDX Compliant</strong></span>
        </div>
    </footer>

    
    <div id="chat-sentinel" className="fixed bottom-12 right-6 z-50 flex flex-col items-end">
        
        
        <button  className="w-12 h-12 rounded-full bg-gradient-to-tr from-[var(--accent)] to-amber-600 text-white dark:text-zinc-950 flex items-center justify-center shadow-lg shadow-[var(--accent-glow)] hover:scale-105 transform transition duration-200 focusable" aria-label="Toggle Cerebro chatbot assistant">
            <i data-lucide="bot-message-square" className="w-6 h-6"></i>
        </button>

        
        <div id="chat-box" className="w-80 h-96 bg-[var(--bg-surface-glass)] backdrop-blur-md border border-[var(--card-border)] rounded-2xl shadow-2xl mt-3 hidden flex-col overflow-hidden transition-all duration-300">
            
            <div className="bg-gradient-to-r from-zinc-950 to-amber-950 p-3 flex items-center justify-between border-b border-[var(--card-border)]">
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
                    Welcome, Billie. Let us synthesize and map your local cognitive topology. Ask me anything about NeuroSync BaseVault databases, memory scoping, or redaction rules.
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

    
    

    </>
  );
}
