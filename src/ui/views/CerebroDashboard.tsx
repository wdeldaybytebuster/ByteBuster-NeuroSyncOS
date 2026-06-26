import React, { useState, useEffect, useRef } from 'react';
import {
  Activity,
  BotMessageSquare,
  BrainCircuit,
  Compass,
  Cpu,
  Database,
  FileQuestion,
  Grid3X3,
  Link,
  Menu,
  MessageSquare,
  Moon,
  Network,
  Radar,
  Send,
  Settings2,
  Shuffle,
  Sidebar,
  Sparkles,
  Sun,
  Vault,
  X,
  Zap
} from 'lucide-react';

type TabId = 'chat' | 'cognition';

type ChatMessage = {
  id: string;
  sender: 'USER' | 'SYSTEM';
  text: string;
  isStreaming?: boolean;
};

export function CerebroDashboard() {
  const [activeTab, setActiveTab] = useState<TabId>('chat');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isSuiteSwitcherOpen, setIsSuiteSwitcherOpen] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([{
    id: 'msg_1',
    sender: 'SYSTEM',
    text: 'Neural pathways synchronized. I am Cerebro, your centralized cognitive interface. I span across BaseVault memory, PortGrid skills, and CoreExec workflows. What shall we synthesize today?'
  }]);
  const [chatInput, setChatInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  
  const [temperature, setTemperature] = useState(0.4);
  const [contextWindow, setContextWindow] = useState(8192);
  
  const chatEndRef = useRef<HTMLDivElement>(null);

  const playSynthSound = (freq: number, type: OscillatorType = 'sine', duration = 0.1, gainVal = 0.1) => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
      gain.gain.setValueAtTime(gainVal, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + duration);
    } catch (e) {
      // Ignored
    }
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, isThinking]);

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    playSynthSound(700, 'triangle', 0.1, 0.04);
  };

  const handleTabSwitch = (tab: TabId) => {
    setActiveTab(tab);
    playSynthSound(440, 'triangle', 0.15, 0.05);
  };

  const handleChatSubmit = () => {
    const query = chatInput.trim();
    if (!query || isThinking) return;
    setChatInput('');
    setChatMessages(prev => [...prev, { id: Math.random().toString(), sender: 'USER', text: query }]);
    setIsThinking(true);
    playSynthSound(480, 'sine', 0.08, 0.02);
    
    setTimeout(() => {
      let response = "I have queried the vector store and mapped your request against the current DAG topologies. I am fully operational within local confines.";
      if (query.toLowerCase().includes("memory") || query.toLowerCase().includes("vault")) {
          response = "BaseVault is currently tracking 14 active project schemas. I can recall specific structural contexts if you provide a meta-tag or query ScopeLogic.";
      } else if (query.toLowerCase().includes("skill") || query.toLowerCase().includes("portgrid")) {
          response = "PortGrid hosts all specialized worker agents. If you need robust implementation, I will dispatch a sub-agent to handle the workflow autonomously.";
      }
      setIsThinking(false);
      setChatMessages(prev => [...prev, { id: Math.random().toString(), sender: 'SYSTEM', text: response }]);
      playSynthSound(520, 'sine', 0.1, 0.03);
    }, 1200);
  };

  return (
    <div className={`cerebro-cockpit ${theme} min-h-screen flex flex-col overflow-x-hidden antialiased select-none animate-fade-in`}>
      {/* TOP HEADER NAVIGATION BAR */}
      <header className="w-full h-16 border-b border-[var(--card-border)] bg-[var(--bg-surface-glass)] backdrop-blur-md px-6 flex items-center justify-between z-40 fixed top-0 left-0 transition-colors duration-300">
        <div className="flex items-center space-x-3">
          <button onClick={() => setIsSuiteSwitcherOpen(!isSuiteSwitcherOpen)} className="w-9 h-9 rounded-lg border border-[var(--card-border)] bg-[var(--bg-nested)] hover:border-zinc-500 flex items-center justify-center text-[var(--terminal-text)] focusable transition-colors shadow-[0_0_8px_var(--glow-color)]" aria-label="Open Suite Switcher Menu">
            <Menu className="w-5 h-5" />
          </button>

          {/* Cerebro Logo */}
          <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-black/20 border border-[var(--card-border)] shadow-[0_0_12px_var(--glow-color)]">
            <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" className="w-7 h-7 text-[var(--accent)]">
                <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.3"/>
                <path d="M 30 50 C 30 30, 70 30, 70 50 C 70 70, 30 70, 30 50" fill="none" stroke="currentColor" strokeWidth="3" opacity="0.8" />
                <circle cx="50" cy="50" r="10" fill="currentColor" opacity="0.9" className="animate-pulse shadow-[0_0_15px_var(--accent-glow)]" />
            </svg>
          </div>
          
          <div className="hidden sm:block ml-1">
              <span className="font-black text-sm tracking-wider uppercase text-[var(--text-primary)]" style={{ textShadow: '0 0 8px var(--glow-color)' }}>CEREBRO ENGINE</span>
              <span className="text-[9px] uppercase font-bold text-[var(--terminal-text)] tracking-widest block -mt-1 drop-shadow-md">NeuroSync Sovereign Suite</span>
          </div>
        </div>

        {/* Dashboard / Set-ups Tab Selector */}
        <div className="flex bg-[var(--bg-nested)] p-1 rounded-xl border border-[var(--card-border)] items-center space-x-1 shadow-[0_0_10px_var(--glow-color)]" role="tablist">
            <button onClick={() => handleTabSwitch('chat')} className={`px-5 py-1.5 rounded-lg text-sm font-semibold transition-all duration-200 flex items-center space-x-2 focusable ${activeTab === 'chat' ? 'text-white bg-[var(--accent)] shadow-[0_0_15px_var(--accent-glow)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:shadow-[0_0_10px_var(--glow-color)]'}`}>
                <MessageSquare className={`w-4 h-4 ${activeTab === 'chat' ? 'text-white' : ''}`} />
                <span>Conversations</span>
            </button>
            <button onClick={() => handleTabSwitch('cognition')} className={`px-5 py-1.5 rounded-lg text-sm font-semibold transition-all duration-200 flex items-center space-x-2 focusable ${activeTab === 'cognition' ? 'text-white bg-[var(--accent)] shadow-[0_0_15px_var(--accent-glow)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:shadow-[0_0_10px_var(--glow-color)]'}`}>
                <BrainCircuit className="w-4 h-4" />
                <span>Cognition</span>
            </button>
        </div>

        {/* Action Items */}
        <div className="flex items-center space-x-2">
            <button onClick={toggleTheme} className="w-9 h-9 rounded-lg border border-[var(--card-border)] bg-[var(--bg-nested)] hover:border-[var(--accent)] hover:shadow-[0_0_15px_var(--accent-glow)] flex items-center justify-center transition-all focusable">
                {theme === 'dark' ? <Sun className="w-4 h-4 text-[var(--terminal-text)]" /> : <Moon className="w-4 h-4 text-[var(--terminal-text)]" />}
            </button>
            <button className="w-9 h-9 rounded-lg border border-[var(--card-border)] bg-[var(--bg-nested)] hover:border-[var(--accent)] hover:shadow-[0_0_15px_var(--accent-glow)] flex items-center justify-center transition-all focusable">
                <Database className="w-4 h-4 text-[var(--terminal-text)]" />
            </button>
            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="w-9 h-9 rounded-lg border border-[var(--card-border)] bg-[var(--bg-nested)] hover:border-[var(--accent)] hover:shadow-[0_0_15px_var(--accent-glow)] flex items-center justify-center text-[var(--terminal-text)] focusable">
                <Sidebar className="w-5 h-5" />
            </button>
        </div>
      </header>

      {/* LEFT-HAND SUITE SWITCHER SIDEBAR */}
      <aside className={`fixed left-0 top-16 h-[calc(100vh-4rem)] w-72 bg-[var(--bg-surface-glass)] backdrop-blur-xl border-r border-[var(--card-border)] z-30 transition-transform duration-300 transform shadow-[5px_0_25px_rgba(0,0,0,0.9)] flex flex-col ${isSuiteSwitcherOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-4 border-b border-[var(--card-border)] flex items-center justify-between">
            <div className="flex items-center space-x-2 text-[var(--terminal-text)] drop-shadow-md">
                <Compass className="w-4 h-4" />
                <h3 className="font-bold text-xs tracking-wider uppercase">Sovereign Suite Switcher</h3>
            </div>
            <button onClick={() => setIsSuiteSwitcherOpen(false)} className="p-1 rounded hover:bg-[var(--accent)]/20 text-[var(--text-muted)] hover:text-[var(--terminal-text)] transition">
                <X className="w-4 h-4" />
            </button>
        </div>

        <nav className="flex-1 p-4 space-y-2 overflow-y-auto font-medium">
            <button className="w-full flex items-center p-3 rounded-xl hover:bg-[var(--bg-nested)] border border-transparent hover:border-[var(--card-border)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition text-left focusable">
                <Cpu className="w-4 h-4 mr-3" />
                <span className="text-xs font-bold uppercase tracking-wider">CoreExec (Orchestrator)</span>
            </button>
            <button className="w-full flex items-center p-3 rounded-xl hover:bg-[var(--bg-nested)] border border-transparent hover:border-[var(--card-border)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition text-left focusable">
                <Vault className="w-4 h-4 mr-3" />
                <span className="text-xs font-bold uppercase tracking-wider">BaseVault (Database)</span>
            </button>
            <button className="w-full flex items-center p-3 rounded-xl hover:bg-[var(--bg-nested)] border border-transparent hover:border-[var(--card-border)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition text-left focusable">
                <Grid3X3 className="w-4 h-4 mr-3" />
                <span className="text-xs font-bold uppercase tracking-wider">PortGrid (Skills Hub)</span>
            </button>
            <button className="w-full flex items-center p-3 rounded-xl hover:bg-[var(--bg-nested)] border border-transparent hover:border-[var(--card-border)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition text-left focusable">
                <Shuffle className="w-4 h-4 mr-3" />
                <span className="text-xs font-bold uppercase tracking-wider">RouteSwitch (Router)</span>
            </button>
            <button className="w-full flex items-center p-3 rounded-xl hover:bg-[var(--bg-nested)] border border-transparent hover:border-[var(--card-border)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition text-left focusable">
                <FileQuestion className="w-4 h-4 mr-3" />
                <span className="text-xs font-bold uppercase tracking-wider">ScopeLogic (Proposal)</span>
            </button>
            <button className="w-full flex items-center p-3 rounded-xl hover:bg-[var(--bg-nested)] border border-transparent hover:border-[var(--card-border)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition text-left focusable">
                <Radar className="w-4 h-4 mr-3" />
                <span className="text-xs font-bold uppercase tracking-wider">ScoutDaemon (Predictive)</span>
            </button>
            <div className="flex items-center justify-between p-3 rounded-xl bg-[var(--accent)]/15 border border-[var(--accent)] text-[var(--text-primary)] transition focusable shadow-[0_0_20px_var(--glow-color)] cursor-default mt-4 border-t-2">
                <div className="flex items-center space-x-3">
                    <BrainCircuit className="w-4 h-4 text-[var(--terminal-text)]" />
                    <span className="text-xs font-bold uppercase tracking-wider text-white" style={{ textShadow: '0 0 5px var(--accent-glow)' }}>Cerebro (Cognitive)</span>
                </div>
                <span className="w-2 h-2 rounded-full bg-[var(--terminal-text)] animate-pulse shadow-[0_0_12px_var(--terminal-text)]"></span>
            </div>
        </nav>
        <div className="p-4 border-t border-[var(--card-border)] bg-zinc-900/40 text-[10px] text-[var(--terminal-text)]/60 font-mono flex flex-col space-y-1">
            <span>Global Context Aware</span>
            <span>Neural Engine Active</span>
        </div>
      </aside>

      {/* RIGHT-HAND COLLAPSIBLE WORKSPACE PANELS */}
      <aside className={`fixed right-0 top-16 h-[calc(100vh-4rem)] w-80 bg-[var(--bg-surface-glass)] backdrop-blur-xl border-l border-[var(--card-border)] z-30 transition-transform duration-300 transform shadow-[-5px_0_25px_rgba(0,0,0,0.9)] flex flex-col ${isSidebarOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="p-4 border-b border-[var(--card-border)] flex items-center justify-between">
            <div className="flex items-center space-x-2 text-[var(--terminal-text)] drop-shadow-md">
                <Activity className="w-4 h-4" />
                <h3 className="font-bold text-sm tracking-wider uppercase">Session Telemetry</h3>
            </div>
            <button onClick={() => setIsSidebarOpen(false)} className="p-1 rounded hover:bg-[var(--accent)]/20 text-[var(--text-muted)] hover:text-[var(--terminal-text)] transition">
                <X className="w-4 h-4" />
            </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-5">
            <div className="space-y-2">
                <label className="text-xs font-semibold text-[var(--text-muted)] tracking-wider uppercase block">Context Burn Rate</label>
                <div className="space-y-2">
                    <div className="flex items-center justify-between p-2 rounded-lg bg-black/60 border border-[var(--card-border)]">
                        <div className="flex items-center space-x-2">
                            <Network className="w-3.5 h-3.5 text-zinc-400" />
                            <span className="text-xs font-bold text-zinc-300">Tokens Evaluated</span>
                        </div>
                        <span className="text-xs font-mono font-bold text-[var(--terminal-text)] drop-shadow-sm">1,240</span>
                    </div>
                    <div className="w-full h-1.5 bg-black/80 rounded-full border border-[var(--card-border)] overflow-hidden shadow-inner">
                        <div className="h-full bg-[var(--accent)] w-[15%] shadow-[0_0_10px_var(--accent-glow)]"></div>
                    </div>
                    <p className="text-[9px] text-zinc-500 font-medium text-right">15% of {contextWindow} limit</p>
                </div>
            </div>

            <div className="bg-[var(--bg-nested)] border border-[var(--card-border)] rounded-lg p-3 space-y-3 shadow-[0_0_15px_var(--glow-color)]">
                <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[var(--terminal-text)] uppercase tracking-wider flex items-center space-x-1.5 drop-shadow-md">
                        <Link className="w-3.5 h-3.5" />
                        <span>Active RAG Sources</span>
                    </span>
                    <span className="px-1.5 py-0.5 bg-[var(--accent)]/10 text-[var(--terminal-text)] rounded text-[9px] uppercase font-bold tracking-widest border border-[var(--accent)]/30">3 Linked</span>
                </div>
                <div className="space-y-2 pt-1">
                    <div className="flex justify-between items-center bg-black/50 p-1.5 rounded border border-zinc-800">
                        <span className="text-[10px] text-zinc-300 font-mono truncate mr-2">BaseVault/schema.sql</span>
                        <span className="text-green-400 font-bold text-[9px]">98%</span>
                    </div>
                    <div className="flex justify-between items-center bg-black/50 p-1.5 rounded border border-zinc-800">
                        <span className="text-[10px] text-zinc-300 font-mono truncate mr-2">CoreExec/DAG_Controller.ts</span>
                        <span className="text-green-400 font-bold text-[9px]">84%</span>
                    </div>
                    <div className="flex justify-between items-center bg-black/50 p-1.5 rounded border border-zinc-800">
                        <span className="text-[10px] text-zinc-300 font-mono truncate mr-2">RouteSwitch/fallback.json</span>
                        <span className="text-green-400 font-bold text-[9px]">71%</span>
                    </div>
                </div>
                <p className="text-[10px] text-zinc-500 leading-relaxed font-medium pt-2 border-t border-[var(--card-border)]">
                    Local vector embeddings continuously inject context from the codebase directly into your queries.
                </p>
            </div>
        </div>
      </aside>

      {/* MAIN DYNAMIC CONTENT CONTAINER */}
      <div className="flex-1 flex pt-16 relative overflow-hidden">
        <main className={`flex-1 flex flex-col transition-all duration-300 p-6 min-h-[calc(100vh-4rem)] ${isSidebarOpen ? 'lg:mr-80' : ''}`}>

            {/* TAB 1: CHAT INTERFACE */}
            <div className={`flex-1 flex-col h-full space-y-4 animate-fade-in ${activeTab === 'chat' ? 'flex' : 'hidden'}`}>
                
                <div className="flex-1 glow-card rounded-2xl flex flex-col relative overflow-hidden transition-colors duration-300">
                    <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(circle at center, var(--grid-color) 0%, transparent 100%)" }}></div>
                    
                    <div className="relative z-10 flex flex-col h-full">
                        <div className="px-6 py-4 border-b border-[var(--card-border)] flex items-center justify-between bg-black/40">
                            <div>
                                <h1 className="text-xl font-black tracking-wide text-white drop-shadow-md">Cerebro Interaction Node</h1>
                                <p className="text-[11px] text-[var(--text-muted)] mt-0.5 font-bold uppercase tracking-wider">Model: <span className="text-[var(--terminal-text)] drop-shadow-sm">Local Phi-4 (Quantized)</span></p>
                            </div>
                            <div className="flex space-x-2">
                                <button onClick={() => setChatMessages([])} className="px-3 py-1.5 rounded border border-[var(--card-border)] bg-black/50 hover:border-red-500/50 hover:bg-red-500/10 text-xs font-bold text-zinc-400 hover:text-red-400 transition focusable">
                                    Clear Context
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
                            {chatMessages.length === 0 && (
                                <div className="h-full flex flex-col items-center justify-center opacity-40">
                                    <BrainCircuit className="w-16 h-16 text-[var(--accent)] mb-4" />
                                    <p className="text-sm font-mono text-white">Neural pathways clear. Awaiting input...</p>
                                </div>
                            )}
                            
                            {chatMessages.map(m => (
                                <div key={m.id} className={`flex w-full ${m.sender === 'USER' ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`max-w-[75%] p-4 rounded-2xl ${m.sender === 'USER' ? 'bg-black/60 border border-[var(--card-border)] rounded-tr-none text-zinc-200' : 'bg-black/40 border border-[var(--accent)]/40 rounded-tl-none shadow-[0_0_15px_var(--glow-color)] text-white'}`}>
                                        <div className="flex items-center space-x-2 mb-2">
                                            {m.sender === 'SYSTEM' ? (
                                                <Sparkles className="w-4 h-4 text-[var(--terminal-text)]" />
                                            ) : (
                                                <div className="w-4 h-4 rounded-full bg-zinc-600 border border-zinc-500"></div>
                                            )}
                                            <span className={`text-[10px] font-black tracking-wider uppercase ${m.sender === 'USER' ? 'text-zinc-500' : 'text-[var(--terminal-text)]'}`}>
                                                {m.sender === 'USER' ? 'Operator' : 'Cerebro'}
                                            </span>
                                        </div>
                                        <p className="text-sm leading-relaxed whitespace-pre-wrap">{m.text}</p>
                                    </div>
                                </div>
                            ))}
                            {isThinking && (
                                <div className="flex w-full justify-start">
                                    <div className="max-w-[75%] p-4 rounded-2xl bg-black/40 border border-[var(--accent)]/40 rounded-tl-none shadow-[0_0_15px_var(--glow-color)] text-[var(--terminal-text)] flex items-center space-x-3">
                                        <Sparkles className="w-4 h-4 animate-spin" />
                                        <span className="text-sm font-mono animate-pulse">Synthesizing vectors...</span>
                                    </div>
                                </div>
                            )}
                            <div ref={chatEndRef} />
                        </div>

                        <div className="p-4 border-t border-[var(--card-border)] bg-black/60 backdrop-blur-md">
                            <div className="relative">
                                <textarea 
                                    rows={1}
                                    value={chatInput}
                                    onChange={(e) => setChatInput(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            handleChatSubmit();
                                        }
                                    }}
                                    placeholder="Instruct Cerebro... (Shift+Enter for newline)" 
                                    className="w-full bg-black border border-[var(--card-border)] rounded-xl pl-4 pr-12 py-4 text-sm text-white focus:outline-none focus:border-[var(--accent)] focus:shadow-[0_0_15px_var(--glow-color)] resize-none"
                                />
                                <button onClick={handleChatSubmit} disabled={isThinking || !chatInput.trim()} className="absolute right-3 top-3 p-2 bg-[var(--accent)] text-white rounded-lg transition hover:bg-white hover:text-black hover:shadow-[0_0_15px_var(--accent-glow)] disabled:opacity-50 disabled:cursor-not-allowed">
                                    <Send className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* TAB 2: COGNITION (SETTINGS) */}
            <div className={`flex-1 flex-col h-full space-y-6 animate-fade-in ${activeTab === 'cognition' ? 'flex' : 'hidden'}`}>
                
                <div className="glow-card rounded-2xl p-6 relative overflow-hidden transition-colors duration-300">
                    <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(circle at top, var(--grid-color) 0%, transparent 75%)" }}></div>

                    <div className="relative z-10 flex flex-col space-y-6">
                        <div className="border-b border-[var(--card-border)] pb-4">
                            <h1 className="text-xl font-black tracking-wide text-white drop-shadow-md">Cognition Parameters</h1>
                            <p className="text-xs text-[var(--text-muted)] mt-1 font-medium">Fine-tune the neural pathways, adjust determinism, and set constraints for the local intelligence engine.</p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div className="space-y-5">
                                <h3 className="text-sm font-black text-[var(--terminal-text)] flex items-center space-x-2 drop-shadow-sm">
                                    <Settings2 className="w-4 h-4" />
                                    <span>Inference Engine</span>
                                </h3>

                                <div className="space-y-5 bg-black/60 border border-[var(--card-border)] rounded-xl p-5 shadow-inner">
                                    <div className="space-y-3">
                                        <div className="flex justify-between text-xs font-bold">
                                            <span className="text-[var(--text-muted)]">Creativity / Temperature</span>
                                            <span className="text-[var(--terminal-text)] font-mono">{temperature.toFixed(2)}</span>
                                        </div>
                                        <input type="range" min="0" max="1" step="0.05" value={temperature} onChange={(e) => setTemperature(Number(e.target.value))} className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-[var(--accent)] shadow-[0_0_10px_var(--accent-glow)]" />
                                        <p className="text-[9px] text-zinc-500 font-medium">Lower values enforce strict determinism (best for coding). Higher values increase creative exploration.</p>
                                    </div>
                                    
                                    <div className="space-y-3 pt-3 border-t border-[var(--card-border)]">
                                        <div className="flex justify-between text-xs font-bold">
                                            <span className="text-[var(--text-muted)]">Context Window (Tokens)</span>
                                            <span className="text-[var(--terminal-text)] font-mono">{contextWindow.toLocaleString()}</span>
                                        </div>
                                        <input type="range" min="2048" max="32768" step="1024" value={contextWindow} onChange={(e) => setContextWindow(Number(e.target.value))} className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-[var(--accent)] shadow-[0_0_10px_var(--accent-glow)]" />
                                        <p className="text-[9px] text-zinc-500 font-medium">Controls the maximum memory span for a single conversation. Higher values use more VRAM.</p>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-5">
                                <h3 className="text-sm font-black text-[var(--terminal-text)] flex items-center space-x-2 drop-shadow-sm">
                                    <Zap className="w-4 h-4" />
                                    <span>Knowledge Grounding</span>
                                </h3>

                                <div className="space-y-4 bg-black/60 border border-[var(--card-border)] rounded-xl p-5 shadow-inner">
                                    <div className="flex items-center justify-between p-3 rounded-lg bg-black/80 border border-[var(--card-border)]">
                                        <div>
                                            <span className="text-xs font-bold text-white block">BaseVault RAG Injection</span>
                                            <span className="text-[10px] text-zinc-500 font-semibold block mt-1">Automatically pull project files into context</span>
                                        </div>
                                        <input type="checkbox" defaultChecked className="w-4 h-4 text-[var(--accent)] bg-black border-zinc-700 rounded focus:ring-[var(--accent)]" />
                                    </div>

                                    <div className="flex items-center justify-between p-3 rounded-lg bg-black/80 border border-[var(--card-border)]">
                                        <div>
                                            <span className="text-xs font-bold text-white block">Strict Adherence</span>
                                            <span className="text-[10px] text-zinc-500 font-semibold block mt-1">Refuse to answer if information is not in RAG</span>
                                        </div>
                                        <input type="checkbox" className="w-4 h-4 text-[var(--accent)] bg-black border-zinc-700 rounded focus:ring-[var(--accent)]" />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-end space-x-3 pt-6 border-t border-[var(--card-border)] mt-auto">
                            <button className="px-5 py-2.5 rounded-lg bg-transparent hover:bg-white/5 text-xs font-bold border border-[var(--card-border)] transition focusable">Revert to Defaults</button>
                            <button className="px-5 py-2.5 rounded-lg bg-[var(--accent)] hover:bg-white text-white hover:text-black font-black text-xs transition shadow-[0_0_20px_var(--accent-glow)] focusable">Commit Parameters</button>
                        </div>
                    </div>
                </div>

            </div>
        </main>
      </div>

      {/* AMBIENT STATUS BAR */}
      <footer className="w-full h-8 bg-black border-t border-[var(--card-border)] px-4 flex items-center justify-between text-[10px] text-zinc-600 font-mono z-25 relative transition-colors duration-300">
        <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-1.5">
                <span className="w-2 h-2 rounded-full bg-[var(--terminal-text)] animate-pulse shadow-[0_0_8px_var(--accent)]"></span>
                <span className="font-bold text-[var(--terminal-text)] uppercase drop-shadow-sm">Cerebro Inference Live</span>
            </div>
            <span>|</span>
            <span>Temperature: <strong className="text-white">{temperature.toFixed(2)}</strong></span>
            <span>|</span>
            <span>Local Model: <strong className="text-white">Phi-4 (Q4_K_M)</strong></span>
        </div>
        <div className="flex items-center space-x-4">
            <span>RAG Synced at: <strong className="text-zinc-400 font-bold">11:05 AM</strong></span>
            <span>|</span>
            <span>Node.js: <strong className="text-white">v22 LTS</strong></span>
        </div>
      </footer>
    </div>
  );
}
