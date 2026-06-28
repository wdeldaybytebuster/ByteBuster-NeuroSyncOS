const fs = require('fs');
const path = require('path');

const tsxContent = `import React, { useEffect, useMemo, useState, useRef } from 'react';
import {
  ArrowRight,
  Ban,
  Binary,
  BotMessageSquare,
  ChartSpline,
  CheckCircle,
  CheckCircle2,
  ChevronDown,
  CircleCheckBig,
  Compass,
  Container,
  Cpu,
  Database,
  DatabaseBackup,
  Download,
  FileQuestion,
  FolderSearch,
  Gavel,
  Grid3X3,
  Info,
  LayoutDashboard,
  Lock,
  Menu,
  MessageSquare,
  MessageSquareQuote,
  Minus,
  Moon,
  Radar,
  RefreshCw,
  Scale,
  Send,
  ShieldAlert,
  ShieldCheck,
  Shuffle,
  Sidebar,
  Sliders,
  Sun,
  Tag,
  TriangleAlert,
  Upload,
  Vault,
  Wallet,
  X,
} from 'lucide-react';

type TabId = 'dashboard' | 'setups';
type ToastTheme = 'cyan' | 'green' | 'red';

type MemoryNode = {
  title: string;
  text: string;
  confidence: number;
  age: string;
};

type ToastState = {
  title: string;
  body: string;
  theme: ToastTheme;
};

type ChatMessage = {
  id: string;
  sender: 'USER' | 'SYSTEM';
  text: string;
  isPending: boolean;
};

const metadata = [
  ['product-name', 'NeuroSync Sovereign OS'],
  ['suite-name', 'Sovereign Suite'],
  ['active-engine', 'ScopeLogic Research & Synthesis Engine'],
  ['target-audience', 'Beginner Hobbyists & Freelancers'],
  ['design-philosophy', 'Grit, Not Grime - zero-budget, high-reliability local execution'],
  ['module-scopelogic', 'Interview-first requirements gathering, multi-model consensus validation, and draft-only DAG proposal compilation.'],
  ['dashboard-element-interview-console', 'Interactive 8-round requirements gathering loop to compile user intent step-by-step.'],
  ['dashboard-element-dag-compiler', 'Visual blueprint quarantine box generating and rendering safe draft-only workflow DAG configurations.'],
  ['dashboard-element-consensus-jury', 'Real-time multi-model cross-referencing jury matrix checking for logical contradictions and anomalies.'],
  ['dashboard-element-grammar-telemetry', 'Telemetry indicators reporting outlines grammar masking states and token context budget savings.'],
  ['setups-config-interview-bounds', 'Bounded interview configurations setting maximum conversation limits and path strictness.'],
  ['setups-config-consensus-thresholds', 'Tuning metrics for the consensus model jury, including ELO priorities and validation weightings.'],
  ['setups-config-grammar-masking', 'Grammar-constrained decoding rules enforcing strict JSON outputs dynamically at the inference layer.'],
];

const initialMemoryNodes: Record<string, MemoryNode[]> = {
  'alex-workspace': [
    { title: 'User Client Identity', text: 'Alex manages strict, high-privacy content creation portfolios.', confidence: 0.98, age: '12d' },
    { title: 'Database Engine Config', text: 'SQLite selected over DuckDB to optimize transactional locking.', confidence: 0.95, age: '1d' },
    { title: 'Quota Governor Bounds', text: 'Free Mode cap established at 50,000 tokens to shield from excessive cloud fees.', confidence: 0.89, age: '6d' },
  ],
  'sam-workspace': [
    { title: 'Developer Scope Rules', text: 'Sam builds lightweight, self-hosted containers using Node.js.', confidence: 0.97, age: '3d' },
    { title: 'Network Sandboxing', text: 'unshare --net isolates dangerous system commands safely.', confidence: 0.91, age: '4d' },
  ],
};

const simulatedQuestions = [
  "Understood. What are the key inputs this workflow needs to receive? (e.g. data files, credentials, or prompts)",
  "Excellent. What sequencing constraints exist? (e.g. Node 1 output must feed into Node 2 before Node 3 starts)",
  "Got it. What are the specific model-routing preferences for each node category? (e.g., Llama-3 for coding, Qwen for generalist)",
  "Understood. Are there any strict safety constraints, environment restrictions, or tool limitations?",
  "Synthesizing variables. What failure handling strategies should the DAG utilize? (e.g., retry up to 3 times, bypass node on 429)",
  "Almost complete. What constitutes a successful workflow completion event?",
  "Compiling specifications. Shall we generate the draft DAG proposal layout now for your explicit approval?",
  "Requirement variables locked. Shall we compile the DAG blueprint now?"
];

export function ScopeLogicDashboard() {
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isSuiteSwitcherOpen, setIsSuiteSwitcherOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isMetaExplorerOpen, setIsMetaExplorerOpen] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  
  const [dailyQuotaCap, setDailyQuotaCap] = useState(50000);
  const [activeProject, setActiveProject] = useState('alex-workspace');
  const [searchQuery, setSearchQuery] = useState('');
  
  const [interviewRound, setInterviewRound] = useState(1);
  const [interviewMaxRounds, setInterviewMaxRounds] = useState(8);
  const [consensusThreshold, setConsensusThreshold] = useState(95);
  const [isDraftCompiled, setIsDraftCompiled] = useState(false);

  const [toast, setToast] = useState<ToastState | null>(null);
  const [pinoLogs, setPinoLogs] = useState<string[]>([
    \`{"time":"\${new Date().toISOString()}","level":30,"msg":"INIT: ScopeLogic requirements parser loaded... [Kahn DAG Validator active]"}\`,
    \`{"time":"\${new Date().toISOString()}","level":30,"msg":"INIT: Grammar Constraint Engine (XGrammar) active... [outlines structural mapping compiled]"}\`,
    \`{"time":"\${new Date().toISOString()}","level":30,"msg":"AUDIT: Scoped Workspace Context successfully locked to project silo: alex-workspace"}\`
  ]);

  const [interviewMessages, setInterviewMessages] = useState<ChatMessage[]>([{
    id: 'int_1',
    sender: 'SYSTEM',
    text: 'Welcome, Billie. Let us define your transactional workflow parameters. What is the primary objective of the workflow DAG we are building?',
    isPending: false,
  }]);
  const [interviewInput, setInterviewInput] = useState('');
  const interviewEndRef = useRef<HTMLDivElement>(null);

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([{
    id: 'msg_1',
    sender: 'SYSTEM',
    text: 'Welcome, Billie. Let us synthesize and map your local cognitive topology. Ask me anything about ScopeLogic requirements, mock juries, or grammar-masking bounds.',
    isPending: false,
  }]);
  const [chatInput, setChatInput] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);
  const pinoEndRef = useRef<HTMLDivElement>(null);

  const [isConsensusAuditing, setIsConsensusAuditing] = useState(false);

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

  const spawnAlert = (title: string, message: string, alertTheme: ToastTheme = 'cyan') => {
    setToast({ title, body: message, theme: alertTheme });
    setTimeout(() => setToast(null), 3500);
  };

  const writeAuditLog = (msg: string) => {
    const timestamp = new Date().toISOString();
    const logLine = \`{"time":"\${timestamp}","level":30,"msg":"\${msg}"}\`;
    setPinoLogs((prev) => [...prev, logLine]);
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  useEffect(() => {
    interviewEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [interviewMessages]);

  useEffect(() => {
    pinoEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [pinoLogs]);

  const handleTabSwitch = (tab: TabId) => {
    setActiveTab(tab);
    playSynthSound(440, 'triangle', 0.15, 0.05);
    writeAuditLog(\`NAV: Switch focus layout to "\${tab}" view panel\`);
  };

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    playSynthSound(700, 'triangle', 0.1, 0.04);
    writeAuditLog(\`UI: User toggled visual theme to \${newTheme === 'light' ? 'Light Mode' : 'Dark Mode'}.\`);
  };

  const triggerSuiteDemo = (moduleName: string) => {
    playSynthSound(587, 'sine', 0.15, 0.05);
    setIsSuiteSwitcherOpen(false);
    spawnAlert(\`\${moduleName} Navigation\`, \`Routing request received. Pre-staging secure sandbox portal for \${moduleName} Suite.\`, 'cyan');
    writeAuditLog(\`ROUTE: Suite Router directed pipeline query toward \${moduleName}.\`);
  };

  const handleProjectSwitch = (val: string) => {
    if (val === 'custom-workspace') {
      spawnAlert('Sandbox Notice', 'Custom project workspace setups require physical BaseVault schema migration allocation.', 'red');
      playSynthSound(220, 'sawtooth', 0.4, 0.08);
      return;
    }
    setActiveProject(val);
    writeAuditLog(\`AUDIT: Switch workspace project scoped boundary file: \${val}\`);
    spawnAlert('Silo Isolation Secured', \`Cognitive focus successfully locked to isolated container: "\${val}"\`, 'cyan');
    playSynthSound(392, 'sine', 0.15, 0.05);
  };

  const visibleNodes = useMemo(() => {
    const nodes = initialMemoryNodes[activeProject] || [];
    if (!searchQuery.trim()) return nodes;
    const q = searchQuery.toLowerCase();
    return nodes.filter(n => n.title.toLowerCase().includes(q) || n.text.toLowerCase().includes(q));
  }, [activeProject, searchQuery]);

  const handleChatSubmit = () => {
    const query = chatInput.trim();
    if (!query) return;
    setChatInput('');
    setChatMessages(prev => [...prev, { id: Math.random().toString(), sender: 'USER', text: query, isPending: false }]);
    playSynthSound(480, 'sine', 0.08, 0.02);
    
    const redactedQuery = query.replace(/[a-zA-Z0-9-]{32,}/g, "[REDACTED-KEY-PATTERN]");
    if (redactedQuery !== query) writeAuditLog("PII_REDACTOR: outbound keys pattern removed before model execution.");
    
    const pendingId = Math.random().toString();
    setChatMessages(prev => [...prev, { id: pendingId, sender: 'SYSTEM', text: 'Analyzing cognitive topology...', isPending: true }]);
    
    setTimeout(() => {
      let response = "We are processing your query. Our local *cognitive* sentinel is optimizing the system *synergy*. Let us continue parsing your multi-project workspace nodes.";
      const lq = query.toLowerCase();
      if (lq.includes("model") || lq.includes("category") || lq.includes("agent") || lq.includes("workflow")) {
        response = "Billie, within this local system architecture, all structural models and categorical agents are strictly bound to isolated **project-scoped silos** inside the BaseVault. Their collaborative *synergy* is managed by the CoreExec engine's *topology*, eliminating cloud leakage entirely.";
      } else if (lq.includes("set-up") || lq.includes("config")) {
        response = "The *topology* of our CoreExec engine can be re-routed via the **Set-ups** panel to modify thread limits or toggle strict zero-trust *quantum* boundaries. Changes are directly committed to SQLite schemas.";
      } else if (lq.includes("quota") || lq.includes("free")) {
        response = "The Free Mode Governor manages outbound *quantum* model calls. If a workflow runs risk of token fatigue, our RouteSwitch cascade intervenes to route the processing local-first.";
      }
      setChatMessages(prev => prev.map(m => m.id === pendingId ? { ...m, text: response, isPending: false } : m));
      playSynthSound(520, 'sine', 0.1, 0.03);
    }, 1200);
  };

  const handleInterviewSubmit = () => {
    const query = interviewInput.trim();
    if (!query) return;
    setInterviewInput('');
    setInterviewMessages(prev => [...prev, { id: Math.random().toString(), sender: 'USER', text: query, isPending: false }]);
    playSynthSound(440, 'triangle', 0.15, 0.04);
    
    if (interviewRound >= interviewMaxRounds) {
      compileFinalDraftDAG();
      return;
    }
    
    const pendingId = Math.random().toString();
    setInterviewMessages(prev => [...prev, { id: pendingId, sender: 'SYSTEM', text: 'Synthesising interview response under outlines grammars...', isPending: true }]);
    
    setTimeout(() => {
      const nextQuestion = simulatedQuestions[interviewRound - 1] || "Requirement variables locked. Shall we compile the DAG blueprint now?";
      setInterviewMessages(prev => prev.map(m => m.id === pendingId ? { ...m, text: nextQuestion, isPending: false } : m));
      setInterviewRound(r => r + 1);
      writeAuditLog(\`SCOPELOGIC: Step \${interviewRound + 1} prompt-generation compiled cleanly.\`);
      playSynthSound(520, 'sine', 0.1, 0.03);
    }, 1000);
  };

  const resetInterview = () => {
    setInterviewRound(1);
    setInterviewMessages([{
      id: 'int_1',
      sender: 'SYSTEM',
      text: 'Welcome, Billie. Let us define your transactional workflow parameters. What is the primary objective of the workflow DAG we are building?',
      isPending: false,
    }]);
    setIsDraftCompiled(false);
    playSynthSound(300, 'sine', 0.2, 0.05);
    spawnAlert("Interview Restarted", "Scoping variables purged. Awaiting fresh requirements intake.", "cyan");
    writeAuditLog("SCOPELOGIC: Cleared interview cache. Resetting loop variables.");
  };

  const compileFinalDraftDAG = () => {
    setIsDraftCompiled(true);
    playSynthSound(659, 'triangle', 0.3, 0.05);
    writeAuditLog("SCOPELOGIC: Compiling interview answers into standardized DAG layout...");
    spawnAlert("Draft Compiled!", "Requirements successfully compiled into a draft-only workflow proposal. Awaiting human signature.", "green");
  };

  const approveProposal = () => {
    playSynthSound(587, 'sine', 0.2, 0.06);
    spawnAlert("Proposal Approved", "Workflow written safely to BaseVault production tables.", "green");
    writeAuditLog("AUDIT: Human operator manually signed and deployed the quarantined draft-only proposal.");
    setIsDraftCompiled(false);
  };

  const rejectProposal = () => {
    playSynthSound(220, 'sawtooth', 0.3, 0.06);
    spawnAlert("Proposal Expunged", "Draft proposal cleanly expunged from the quarantine cache.", "cyan");
    writeAuditLog("AUDIT: Human operator rejected the draft-only proposal. State unchanged.");
    setIsDraftCompiled(false);
  };

  const triggerConsensusRefresh = () => {
    writeAuditLog("SCOPELOGIC: Initiated multi-model consensus audit loop.");
    spawnAlert("Jury Auditing", "Recalculating consensus agreement scores...", "cyan");
    setIsConsensusAuditing(true);
    
    setTimeout(() => {
      setIsConsensusAuditing(false);
      playSynthSound(587, 'sine', 0.25, 0.05);
      writeAuditLog("SCOPELOGIC: Cross-model consensus validation complete. 0 contradictions detected.");
      spawnAlert("Jury Verdict Locked", "Multi-model agreement validated at 98.4%. Gold level approved.", "green");
    }, 1500);
  };

  const compiledDAGOutput = isDraftCompiled ? JSON.stringify({
    "project_id": activeProject,
    "workflow_id": "wf_" + Math.random().toString(36).substr(2, 9),
    "nodes": [
      { "id": "node-1", "type": "input", "label": "Quarantined Client Request Ingest" },
      { "id": "node-2", "type": "model_call", "label": "Dynamic Model Inference Run" },
      { "id": "node-3", "type": "output", "label": "Transactional SQLite Persist" }
    ],
    "edges": [
      { "source": "node-1", "target": "node-2" },
      { "source": "node-2", "target": "node-3" }
    ],
    "metadata": {
      "confidence_score": 0.98,
      "validation_passed": true,
      "warnings": [],
      "scoping_interview_rounds_completed": interviewRound
    }
  }, null, 2) : JSON.stringify({
    "status": "Awaiting Requirements...",
    "instructions": "Answer questions in the interview loop on the left to compile the workflow DAG blueprint by construction."
  }, null, 2);

  return (
    <div className={\`scopelogic-cockpit \${theme} min-h-screen flex flex-col overflow-x-hidden antialiased select-none\`}>
      
      {/* HEADER */}
      <header className="w-full h-16 border-b border-[var(--card-border)] bg-[var(--bg-surface-glass)] backdrop-blur-md px-6 flex items-center justify-between z-40 fixed top-0 left-0 transition-colors duration-300">
        <div className="flex items-center space-x-3">
          <button onClick={() => setIsSuiteSwitcherOpen(!isSuiteSwitcherOpen)} className="w-9 h-9 rounded-lg border border-[var(--card-border)] bg-[var(--bg-nested)] hover:opacity-80 flex items-center justify-center text-[var(--accent)] focusable">
            <Menu className="w-5 h-5" />
          </button>

          <div className="w-8 h-8 rounded-lg flex items-center justify-center">
            <svg viewBox="0 0 100 100" className="w-8 h-8 transition-all duration-300 text-[var(--accent)]">
                <polygon points="50,15 90,80 10,80" fill="currentColor" stroke="currentColor" strokeWidth="2" opacity="0.15"/>
                <circle cx="50" cy="55" r="30" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="3 3" opacity="0.3"/>
                <g transform="translate(50,58) scale(0.5) translate(-50,-50)">
                    <g transform="rotate(45,50,50)">
                        <path d="M 56 85 L 56 68 L 60 68 L 60 45 L 75 30 L 75 10 L 58 10 L 58 28 L 42 28 L 42 10 L 25 10 L 25 30 L 40 45 L 40 68 L 44 68 L 44 85 Z" fill="currentColor" opacity="0.2" stroke="currentColor" strokeWidth="4" strokeLinejoin="round"/>
                        <rect x="46" y="74" width="3" height="5" fill="var(--bg-base)"/>
                        <rect x="51" y="74" width="3" height="5" fill="var(--bg-base)"/>
                        <rect x="48" y="40" width="4" height="24" rx="2" fill="currentColor" />
                    </g>
                </g>
            </svg>
          </div>
          
          <div className="hidden sm:block">
            <span className="font-black text-sm tracking-wider uppercase bg-clip-text text-transparent bg-gradient-to-r from-[var(--text-primary)] via-[var(--accent)] to-[var(--text-primary)]">SCOPELOGIC ENGINE</span>
            <span className="text-[9px] uppercase font-semibold text-[var(--text-muted)] tracking-widest block -mt-1">NeuroSync Sovereign Suite</span>
          </div>
        </div>

        <div className="flex bg-[var(--bg-nested)] p-1 rounded-xl border border-[var(--card-border)] items-center space-x-1">
          <button onClick={() => handleTabSwitch('dashboard')} className={\`px-5 py-1.5 rounded-lg text-sm font-semibold transition-all duration-200 flex items-center space-x-2 focusable \${activeTab === 'dashboard' ? 'text-white bg-[var(--accent)] shadow shadow-[var(--accent-glow)] dark:text-zinc-950' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}\`}>
            <LayoutDashboard className={\`w-4 h-4 \${activeTab === 'dashboard' ? 'text-white dark:text-zinc-950' : ''}\`} />
            <span>Dashboard</span>
          </button>
          <button onClick={() => handleTabSwitch('setups')} className={\`px-5 py-1.5 rounded-lg text-sm font-semibold transition-all duration-200 flex items-center space-x-2 focusable \${activeTab === 'setups' ? 'text-white bg-[var(--accent)] shadow shadow-[var(--accent-glow)] dark:text-zinc-950' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}\`}>
            <Sliders className={\`w-4 h-4 \${activeTab === 'setups' ? 'text-white dark:text-zinc-950' : ''}\`} />
            <span>Set-ups</span>
          </button>
        </div>

        <div className="flex items-center space-x-2">
          <button onClick={toggleTheme} className="w-9 h-9 rounded-lg border border-[var(--card-border)] bg-[var(--bg-nested)] hover:opacity-85 flex items-center justify-center transition-all focusable">
            {theme === 'dark' ? <Sun className="w-4 h-4 text-[var(--accent)]" /> : <Moon className="w-4 h-4 text-[var(--accent)]" />}
          </button>
          <button onClick={() => { setIsMetaExplorerOpen(true); playSynthSound(500, 'sine', 0.15, 0.05); }} className="w-9 h-9 rounded-lg border border-[var(--card-border)] bg-[var(--bg-nested)] hover:opacity-85 flex items-center justify-center transition-all focusable">
            <Database className="w-4 h-4 text-[var(--accent)]" />
          </button>
          <button onClick={() => { setIsSidebarOpen(!isSidebarOpen); playSynthSound(600, 'sine', 0.12, 0.04); }} className="w-9 h-9 rounded-lg border border-[var(--card-border)] bg-[var(--bg-nested)] hover:opacity-85 flex items-center justify-center text-[var(--accent)] focusable">
            <Sidebar className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* SUITE SWITCHER SIDEBAR */}
      <aside className={\`fixed left-0 top-16 h-[calc(100vh-4rem)] w-72 bg-[var(--bg-surface-glass)] backdrop-blur-md border-r border-[var(--card-border)] z-30 transition-transform duration-300 transform shadow-2xl flex flex-col \${isSuiteSwitcherOpen ? 'translate-x-0' : '-translate-x-full'}\`}>
        <div className="p-4 border-b border-[var(--card-border)] flex items-center justify-between">
          <div className="flex items-center space-x-2 text-[var(--accent)]">
            <Compass className="w-4 h-4" />
            <h3 className="font-bold text-xs tracking-wider uppercase">Sovereign Suite Switcher</h3>
          </div>
          <button onClick={() => setIsSuiteSwitcherOpen(false)} className="p-1 rounded hover:bg-zinc-800/40 text-[var(--text-muted)] hover:text-[var(--text-primary)]">
            <X className="w-4 h-4" />
          </button>
        </div>
        <nav className="flex-1 p-4 space-y-2 overflow-y-auto font-medium">
          <button onClick={() => triggerSuiteDemo('CoreExec')} className="w-full flex items-center p-3 rounded-xl hover:bg-[var(--bg-nested)] border border-transparent hover:border-[var(--card-border)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition text-left focusable">
            <Cpu className="w-4 h-4 mr-3" />
            <span className="text-xs font-bold uppercase tracking-wider">CoreExec (Orchestrator)</span>
          </button>
          <button onClick={() => triggerSuiteDemo('BaseVault')} className="w-full flex items-center p-3 rounded-xl hover:bg-[var(--bg-nested)] border border-transparent hover:border-[var(--card-border)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition text-left focusable">
            <Vault className="w-4 h-4 mr-3" />
            <span className="text-xs font-bold uppercase tracking-wider">BaseVault (Database)</span>
          </button>
          <button onClick={() => triggerSuiteDemo('PortGrid')} className="w-full flex items-center p-3 rounded-xl hover:bg-[var(--bg-nested)] border border-transparent hover:border-[var(--card-border)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition text-left focusable">
            <Grid3X3 className="w-4 h-4 mr-3" />
            <span className="text-xs font-bold uppercase tracking-wider">PortGrid (Skills Hub)</span>
          </button>
          <button onClick={() => triggerSuiteDemo('RouteSwitch')} className="w-full flex items-center p-3 rounded-xl hover:bg-[var(--bg-nested)] border border-transparent hover:border-[var(--card-border)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition text-left focusable">
            <Shuffle className="w-4 h-4 mr-3" />
            <span className="text-xs font-bold uppercase tracking-wider">RouteSwitch (Router)</span>
          </button>
          <div className="flex items-center justify-between p-3 rounded-xl bg-[var(--accent)]/10 border border-[var(--accent)] text-[var(--text-primary)] transition focusable cursor-default">
            <div className="flex items-center space-x-3">
              <FileQuestion className="w-4 h-4 text-[var(--accent)]" />
              <span className="text-xs font-bold uppercase tracking-wider">ScopeLogic (Proposal)</span>
            </div>
            <span className="w-2 h-2 rounded-full bg-[var(--accent)] animate-pulse"></span>
          </div>
          <button onClick={() => triggerSuiteDemo('ScoutDaemon')} className="w-full flex items-center p-3 rounded-xl hover:bg-[var(--bg-nested)] border border-transparent hover:border-[var(--card-border)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition text-left focusable">
            <Radar className="w-4 h-4 mr-3" />
            <span className="text-xs font-bold uppercase tracking-wider">ScoutDaemon (Predictive)</span>
          </button>
        </nav>
        <div className="p-4 border-t border-[var(--card-border)] bg-zinc-900/20 text-[10px] text-zinc-500 flex flex-col space-y-1 font-mono">
          <span>Sovereign Platform Framework</span>
          <span>Design Core: Grit, Not Grime</span>
        </div>
      </aside>

      {/* RIGHT SIDEBAR */}
      <aside className={\`fixed right-0 top-16 h-[calc(100vh-4rem)] w-80 bg-[var(--bg-surface-glass)] backdrop-blur-md border-l border-[var(--card-border)] z-30 transition-transform duration-300 transform shadow-2xl flex flex-col \${isSidebarOpen ? 'translate-x-0' : 'translate-x-full'}\`}>
        <div className="p-4 border-b border-[var(--card-border)] flex items-center justify-between">
          <div className="flex items-center space-x-2 text-[var(--accent)]">
            <FolderSearch className="w-4 h-4" />
            <h3 className="font-bold text-sm tracking-wider uppercase">Project Target Workspace</h3>
          </div>
          <button onClick={() => setIsSidebarOpen(false)} className="p-1 rounded hover:bg-zinc-800/40 text-[var(--text-muted)] hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          <div className="space-y-2">
            <label className="text-xs font-semibold text-[var(--text-muted)] tracking-wider uppercase block">Project Database Workspace</label>
            <div className="relative">
              <select value={activeProject} onChange={(e) => handleProjectSwitch(e.target.value)} className="w-full bg-[var(--bg-surface)] border border-[var(--card-border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] appearance-none focusable">
                <option value="alex-workspace">Alex (Freelance Creator Silo)</option>
                <option value="sam-workspace">Sam (Hobbyist Developer Silo)</option>
                <option value="custom-workspace">Add New Custom Silo...</option>
              </select>
              <ChevronDown className="w-4 h-4 text-[var(--accent)] absolute right-3 top-3 pointer-events-none" />
            </div>
          </div>
          <div className="bg-[var(--bg-nested)] border border-[var(--card-border)] rounded-lg p-3 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[var(--accent)] uppercase tracking-wider flex items-center space-x-1">
                <DatabaseBackup className="w-3 h-3" />
                <span>SQLite WAL Persistence</span>
              </span>
              <span className="px-1.5 py-0.5 bg-green-500/10 text-green-400 rounded text-[9px] uppercase font-bold tracking-widest border border-green-500/20 animate-pulse">Synchronous</span>
            </div>
            <p className="text-[11px] text-[var(--text-muted)] leading-relaxed font-medium">State storage backed strictly by relational tables to prevent context window explosion.</p>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button onClick={() => spawnAlert("Backup Complete", "Sovereign backup file successfully compiled. saved local backup bundle.", "green")} className="bg-[var(--bg-surface)] hover:opacity-90 border border-[var(--card-border)] py-1.5 px-2 rounded-md text-[11px] font-bold hover:border-[var(--accent)]/50 flex items-center justify-center space-x-1.5 text-[var(--accent)] focusable">
                <Download className="w-3 h-3" />
                <span>Backup DB</span>
              </button>
              <button onClick={() => spawnAlert("Database Restored", "Local databases updated and re-verified cleanly.", "cyan")} className="bg-[var(--bg-surface)] hover:opacity-90 border border-[var(--card-border)] py-1.5 px-2 rounded-md text-[11px] font-bold hover:border-[var(--accent)]/50 flex items-center justify-center space-x-1.5 text-[var(--accent)] focusable">
                <Upload className="w-3 h-3" />
                <span>Restore DB</span>
              </button>
            </div>
          </div>
          <div className="bg-[var(--bg-nested)] border border-[var(--card-border)] rounded-lg p-3 space-y-3">
            <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider flex items-center space-x-1.5">
              <ChartSpline className="w-3.5 h-3.5 text-[var(--accent)]" />
              <span>ScopeLogic Telemetry</span>
            </span>
            <p className="text-[11px] text-[var(--text-muted)] leading-relaxed font-medium">Real-time metrics tracking requirements extraction ELO benchmarks.</p>
            <div className="space-y-1">
              <div className="flex justify-between text-[11px]">
                <span>Syntactic Grammar Adherence</span>
                <span className="text-green-500 font-bold">100%</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span>Average Interview Cycles</span>
                <span className="text-[var(--accent)] font-bold">5.4 rounds</span>
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-[var(--text-muted)] tracking-wider uppercase">ScopeLogic Activity Log</label>
              <button onClick={() => { setPinoLogs([]); playSynthSound(300, 'sine', 0.1, 0.02); }} className="text-[10px] text-[var(--accent)] hover:underline font-bold">Clear</button>
            </div>
            <div className="w-full h-44 bg-zinc-950 border border-[var(--card-border)] rounded-lg p-2 font-mono text-[9px] text-zinc-300 overflow-y-auto space-y-1">
              {pinoLogs.map((log, i) => (
                <div key={i} className={\`text-[var(--terminal-text)] truncate opacity-85 font-semibold \${log.includes('AUDIT') ? 'text-[var(--accent)]' : ''}\`}>{log}</div>
              ))}
              <div ref={pinoEndRef} />
            </div>
          </div>
        </div>
        <div className="p-3 border-t border-[var(--card-border)] bg-zinc-900/40 text-[10px] text-zinc-500 font-mono text-center">
          System ELO Rank: <span className="text-[var(--accent)] font-bold">3,533 edges</span> | v1.0-Beta
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <div className="flex-1 flex pt-16 relative overflow-hidden">
        <main className={\`flex-1 flex flex-col md:flex-row transition-all duration-300 p-6 space-y-6 md:space-y-0 md:space-x-6 min-h-[calc(100vh-4rem)] mr-0 \${isSidebarOpen ? 'lg:mr-80' : ''}\`}>
          
          {/* DASHBOARD TAB */}
          <div className={\`flex-1 flex-col lg:flex-row space-y-6 lg:space-y-0 lg:space-x-6 w-full \${activeTab === 'dashboard' ? 'flex' : 'hidden'}\`}>
            
            <div className="flex-1 bg-[var(--bg-surface-glass)] border border-[var(--card-border)] backdrop-blur-md rounded-2xl p-5 shadow-xl flex flex-col relative overflow-hidden transition-colors duration-300">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_var(--grid-color)_0%,_transparent_75%)] pointer-events-none"></div>
              <div className="relative z-10 flex flex-col h-full space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-[var(--card-border)] pb-3 gap-3">
                  <div>
                    <h1 className="text-xl font-black tracking-wide">ScopeLogic Interview & Synthesis Room</h1>
                    <p className="text-xs text-[var(--text-muted)] mt-0.5 font-medium">Gather requirements via bounded interview loops, filter hallucinations using multi-model consensus, and compile draft-only workflow DAG configurations.</p>
                  </div>
                  <button onClick={resetInterview} className="px-5 py-2 rounded-xl bg-gradient-to-r from-[var(--accent)] via-cyan-600 to-sky-600 hover:opacity-95 text-white dark:text-zinc-950 dark:font-extrabold text-sm font-bold flex items-center justify-center space-x-2 transition-all shadow-lg shadow-[var(--accent-glow)] focusable">
                    <RefreshCw className="w-4 h-4 text-white dark:text-zinc-950" />
                    <span>Restart Loop</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 flex-1">
                  
                  <div className="glow-card rounded-2xl p-4 flex flex-col h-[400px]">
                    <div className="flex items-center justify-between border-b border-[var(--card-border)] pb-2 mb-3">
                      <span className="text-xs font-bold text-[var(--accent)] flex items-center space-x-1.5">
                        <MessageSquareQuote className="w-4 h-4" />
                        <span>Bounded Interview (Max {interviewMaxRounds} rounds)</span>
                      </span>
                      <span className="px-2 py-0.5 bg-[var(--bg-nested)] text-[var(--accent)] rounded text-[10px] font-mono font-black border border-[var(--accent)]/20">Round {interviewRound} / {interviewMaxRounds}</span>
                    </div>
                    <div className="flex-1 overflow-y-auto space-y-3 p-1 text-xs">
                      {interviewMessages.map(m => (
                        <div key={m.id} className={m.sender === 'USER' ? "bg-zinc-800 dark:bg-zinc-900 border border-zinc-700/50 p-2.5 rounded-xl rounded-tr-none self-end max-w-[90%] ml-auto text-right leading-relaxed font-semibold shadow-sm" : "bg-[var(--bg-nested)] border border-[var(--card-border)] p-2.5 rounded-xl rounded-tl-none self-start max-w-[90%] leading-relaxed shadow-sm"}>
                          <span className={\`font-bold text-[9px] \${m.sender === 'USER' ? 'text-zinc-500' : 'text-[var(--accent)]'} block mb-1 uppercase tracking-wider\`}>{m.sender === 'USER' ? 'Billie:' : 'ScopeLogic:'}</span>
                          {m.text}
                        </div>
                      ))}
                      <div ref={interviewEndRef} />
                    </div>
                    <div className="mt-3 pt-2 border-t border-[var(--card-border)] flex items-center space-x-2">
                      <input 
                        type="text" 
                        value={interviewInput}
                        onChange={e => setInterviewInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleInterviewSubmit()}
                        placeholder="Specify your requirements..." 
                        className="flex-1 bg-[var(--bg-surface)] border border-[var(--card-border)] text-xs rounded-xl px-3 py-2 text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]" 
                      />
                      <button onClick={handleInterviewSubmit} className="p-2 bg-[var(--accent)] text-white dark:text-zinc-950 hover:opacity-90 rounded-xl transition focusable">
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="glow-card rounded-2xl p-4 flex flex-col h-[400px] relative">
                    <div className="absolute inset-0 bg-red-500/[0.02] dark:bg-red-500/[0.01] pointer-events-none rounded-2xl"></div>
                    <div className="flex items-center justify-between border-b border-[var(--card-border)] pb-2 mb-3 z-10 relative">
                      <span className="text-xs font-bold text-[var(--accent)] flex items-center space-x-1.5">
                        <Container className="w-4 h-4" />
                        <span>Draft-Only Proposal Boundary (Quarantined)</span>
                      </span>
                      <span className="px-2 py-0.5 bg-red-500/10 text-red-500 rounded text-[9px] font-black uppercase tracking-widest border border-red-500/20">Quarantined</span>
                    </div>
                    <div className="flex-1 bg-zinc-950 border border-[var(--card-border)] p-3 rounded-xl font-mono text-[10px] text-cyan-400 overflow-y-auto leading-relaxed select-text relative z-10">
                      <pre>{compiledDAGOutput}</pre>
                    </div>
                    <div className="mt-3 pt-2 border-t border-[var(--card-border)] flex gap-2 relative z-10">
                      <button onClick={approveProposal} disabled={!isDraftCompiled} className="flex-1 bg-green-600 hover:bg-green-700 text-white disabled:opacity-30 disabled:pointer-events-none py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1.5 focusable">
                        <CheckCircle className="w-4 h-4" />
                        <span>Approve & Write</span>
                      </button>
                      <button onClick={rejectProposal} disabled={!isDraftCompiled} className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 disabled:opacity-30 disabled:pointer-events-none py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1.5 focusable">
                        <Ban className="w-4 h-4" />
                        <span>Reject Proposal</span>
                      </button>
                    </div>
                  </div>

                </div>
              </div>
            </div>

            <div className="w-full lg:w-96 flex flex-col space-y-6">
              
              <div className="glow-card rounded-2xl p-5 relative overflow-hidden transition-colors duration-300">
                <div className="flex items-center justify-between border-b border-[var(--card-border)] pb-3 mb-4">
                  <div className="flex items-center space-x-2 text-[var(--accent)]">
                    <Scale className="w-4 h-4" />
                    <h3 className="font-bold text-xs tracking-wider uppercase">AI Jury Consensus</h3>
                  </div>
                  <button onClick={triggerConsensusRefresh} className="text-[10px] text-[var(--accent)] hover:underline flex items-center space-x-1 font-bold focusable">
                    <RefreshCw className={\`w-3 h-3 \${isConsensusAuditing ? 'animate-spin' : ''}\`} />
                    <span>Re-audit</span>
                  </button>
                </div>
                <div className="space-y-4">
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs font-semibold">
                      <span>Consensus Rating</span>
                      <span className="text-green-500 font-bold">98.4% (Gold)</span>
                    </div>
                    <div className="w-full h-2 bg-zinc-800/80 rounded-full overflow-hidden border border-[var(--card-border)]">
                      <div className="h-full bg-gradient-to-r from-[var(--accent)] to-teal-500 rounded-full transition-all duration-300" style={{ width: '98%' }}></div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {['Qwen-2.5-72B-Free', 'Llama-3-70B-Free', 'Phi-3-Medium-Free'].map(m => (
                      <div key={m} className="flex justify-between text-[11px] items-center p-1.5 bg-[var(--bg-nested)] border border-[var(--card-border)] rounded-lg">
                        <span className="font-semibold">{m}</span>
                        <span className="px-2 py-0.5 bg-green-500/10 text-green-400 text-[9px] rounded font-bold border border-green-500/20">AGREED</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="glow-card rounded-2xl p-5 relative overflow-hidden transition-colors duration-300">
                <div className="flex items-center justify-between border-b border-[var(--card-border)] pb-3 mb-4">
                  <div className="flex items-center space-x-2 text-[var(--accent)]">
                    <Binary className="w-4 h-4" />
                    <h3 className="font-bold text-xs tracking-wider uppercase">Grammar-Constrained Telemetry</h3>
                  </div>
                  <span className="text-[9px] font-mono text-zinc-500 font-bold">XGrammar Active</span>
                </div>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-2 text-center text-xs">
                    <div className="bg-[var(--bg-nested)] p-2 rounded-xl border border-[var(--card-border)]">
                      <span className="text-[9px] text-[var(--text-muted)] font-bold uppercase block">Token Savings</span>
                      <span className="text-sm font-bold text-[var(--accent)] font-mono">14,200 (23%)</span>
                    </div>
                    <div className="bg-[var(--bg-nested)] p-2 rounded-xl border border-[var(--card-border)]">
                      <span className="text-[9px] text-[var(--text-muted)] font-bold uppercase block">Parse Validity</span>
                      <span className="text-sm font-bold text-green-500 font-mono">100% PERFECT</span>
                    </div>
                  </div>
                  <div className="bg-zinc-950 border border-[var(--card-border)] p-2.5 rounded-xl font-mono text-[9px] text-cyan-400 h-24 overflow-y-auto space-y-1">
                    <div className="opacity-80">[Parser] State Transition: T_OBJECT_OPEN {'>'} KEY('nodes')</div>
                    <div className="opacity-80">[Parser] Match strict regex pattern structure...</div>
                    <div className="opacity-100 text-[var(--accent)]">[Masking Engine] Zeroed probabilities of all non-conforming JSON tokens</div>
                  </div>
                </div>
              </div>

              <div className="glow-card rounded-2xl p-5 relative overflow-hidden transition-colors duration-300">
                <div className="flex items-center justify-between border-b border-[var(--card-border)] pb-3 mb-4">
                  <div className="flex items-center space-x-2 text-[var(--accent)]">
                    <Wallet className="w-4 h-4" />
                    <h3 className="font-bold text-xs tracking-wider uppercase">Free Mode Governor</h3>
                  </div>
                  <span className="px-1.5 py-0.5 bg-[var(--accent)]/10 text-[var(--accent)] rounded text-[9px] uppercase font-bold tracking-widest border border-[var(--accent)]/20">Zero Spending</span>
                </div>
                <div className="space-y-4">
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs font-semibold">
                      <span>Daily Quota Burn</span>
                      <span className="text-[var(--accent)] font-bold">12,500 / 50,000 Tokens</span>
                    </div>
                    <div className="w-full h-2 bg-zinc-800/80 rounded-full overflow-hidden border border-[var(--card-border)]">
                      <div className="h-full bg-gradient-to-r from-[var(--accent)] to-amber-600 rounded-full transition-all duration-300" style={{ width: '25%' }}></div>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] text-[var(--text-muted)] font-medium">
                      <label>Adjust Daily Cap (tokens)</label>
                      <span>{dailyQuotaCap.toLocaleString()} cap</span>
                    </div>
                    <input type="range" min="10000" max="100000" step="5000" value={dailyQuotaCap} onChange={e => { setDailyQuotaCap(Number(e.target.value)); writeAuditLog(\`CONFIG: Governor Daily token spending threshold limits recalculated to: \${e.target.value}\`); }} className="w-full h-1 bg-[var(--card-border)] rounded-lg appearance-none cursor-pointer accent-[var(--accent)]" />
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[var(--card-border)] text-center font-medium">
                    <div className="bg-[var(--bg-nested)] p-2 rounded-lg border border-[var(--card-border)]">
                      <span className="text-[9px] text-[var(--text-muted)] font-bold uppercase block">Forecast Status</span>
                      <span className="text-xs font-bold text-green-500 uppercase">SAFE TO RUN</span>
                    </div>
                    <div className="bg-[var(--bg-nested)] p-2 rounded-lg border border-[var(--card-border)]">
                      <span className="text-[9px] text-[var(--text-muted)] font-bold uppercase block">Daily calls used</span>
                      <span className="text-xs font-bold text-[var(--accent)] font-mono">22 calls</span>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>

          {/* SET-UPS TAB */}
          <div className={\`flex-1 flex-col lg:flex-row space-y-6 lg:space-y-0 lg:space-x-6 w-full \${activeTab === 'setups' ? 'flex' : 'hidden'}\`}>
            
            <div className="flex-1 bg-[var(--bg-surface-glass)] border border-[var(--card-border)] backdrop-blur-md rounded-2xl p-5 shadow-xl flex flex-col relative overflow-hidden transition-colors duration-300">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_var(--grid-color)_0%,_transparent_75%)] pointer-events-none"></div>
              <div className="relative z-10 flex flex-col h-full space-y-4">
                <div className="border-b border-[var(--card-border)] pb-3">
                  <h1 className="text-xl font-black tracking-wide">ScopeLogic Engine Set-ups</h1>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5 font-medium">Control requirements gathering loops, model consensus juries, and strict outlines grammar schema structures.</p>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                  <div className="space-y-4">
                    <h3 className="text-sm font-black text-[var(--accent)] flex items-center space-x-2">
                      <MessageSquare className="w-4 h-4" />
                      <span>Bounded Interview Specifications</span>
                    </h3>
                    <div className="space-y-3 bg-[var(--bg-nested)] border border-[var(--card-border)] rounded-xl p-4">
                      <div className="space-y-2">
                        <div className="flex justify-between text-xs font-semibold">
                          <span className="text-[var(--text-muted)]">Maximum Interview Rounds</span>
                          <span className="font-black text-[var(--accent)]">{interviewMaxRounds} rounds ({interviewMaxRounds > 8 ? 'High token consumption' : 'Strict limit'})</span>
                        </div>
                        <input type="range" min="3" max="15" value={interviewMaxRounds} onChange={e => setInterviewMaxRounds(Number(e.target.value))} className="w-full h-1 bg-[var(--card-border)] rounded-lg appearance-none cursor-pointer accent-[var(--accent)]" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-[var(--text-muted)]">Rigor Level</label>
                        <select className="w-full bg-[var(--bg-surface)] border border-[var(--card-border)] rounded-lg px-2.5 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] focusable">
                          <option value="high">High Reasoning (Continuous multi-model cross reference)</option>
                          <option value="standard">Standard (Saves token budget)</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="text-sm font-black text-[var(--accent)] flex items-center space-x-2">
                      <Gavel className="w-4 h-4" />
                      <span>AI Jury & Consensus Thresholds</span>
                    </h3>
                    <div className="space-y-3 bg-[var(--bg-nested)] border border-[var(--card-border)] rounded-xl p-4">
                      <div className="space-y-2">
                        <div className="flex justify-between text-xs font-semibold">
                          <span className="text-[var(--text-muted)]">Minimum Consensus Match</span>
                          <span className="font-black text-[var(--accent)]">{consensusThreshold}% ({consensusThreshold >= 95 ? 'Gold level' : consensusThreshold >= 80 ? 'Amber review' : 'Unverified risk'})</span>
                        </div>
                        <input type="range" min="60" max="100" value={consensusThreshold} onChange={e => setConsensusThreshold(Number(e.target.value))} className="w-full h-1 bg-[var(--card-border)] rounded-lg appearance-none cursor-pointer accent-[var(--accent)]" />
                      </div>
                      <div className="space-y-1 text-xs">
                        <span className="font-bold text-[var(--text-muted)] block mb-1">Jury Members:</span>
                        <div className="grid grid-cols-2 gap-2">
                          <label className="flex items-center space-x-1.5">
                            <input type="checkbox" defaultChecked className="rounded accent-[var(--accent)]" />
                            <span>Llama 3 70B</span>
                          </label>
                          <label className="flex items-center space-x-1.5">
                            <input type="checkbox" defaultChecked className="rounded accent-[var(--accent)]" />
                            <span>Qwen 2.5 72B</span>
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4 md:col-span-2">
                    <h3 className="text-sm font-black text-[var(--accent)] flex items-center space-x-2">
                      <Binary className="w-4 h-4" />
                      <span>Grammar Masking & Compiling Rules</span>
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-[var(--bg-nested)] border border-[var(--card-border)] rounded-xl p-4">
                      <div className="flex items-center justify-between p-2 rounded bg-[var(--bg-surface)] border border-[var(--card-border)]">
                        <div>
                          <span className="text-xs font-bold block">Logic Masking</span>
                          <span className="text-[9px] text-[var(--text-muted)] font-semibold block">Guarantee structured JSON</span>
                        </div>
                        <input type="checkbox" defaultChecked className="w-4 h-4 text-[var(--accent)] bg-zinc-800 border-zinc-700 rounded" />
                      </div>
                      <div className="flex items-center justify-between p-2 rounded bg-[var(--bg-surface)] border border-[var(--card-border)]">
                        <div>
                          <span className="text-xs font-bold block">Strict Typings</span>
                          <span className="text-[9px] text-[var(--text-muted)] font-semibold block">Reject flexible schema fields</span>
                        </div>
                        <input type="checkbox" defaultChecked className="w-4 h-4 text-[var(--accent)] bg-zinc-800 border-zinc-700 rounded" />
                      </div>
                      <div className="flex items-center justify-between p-2 rounded bg-[var(--bg-surface)] border border-[var(--card-border)]">
                        <div>
                          <span className="text-xs font-bold block">Pre-Compile Checks</span>
                          <span className="text-[9px] text-[var(--text-muted)] font-semibold block">Verify acyclic DAG bounds</span>
                        </div>
                        <input type="checkbox" defaultChecked className="w-4 h-4 text-[var(--accent)] bg-zinc-800 border-zinc-700 rounded" />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end space-x-3 pt-6 border-t border-[var(--card-border)] mt-auto">
                  <button onClick={() => { spawnAlert('Specifications Reset', 'Platform variables returned to original zero-budget hardware defaults.', 'cyan'); writeAuditLog('SYSTEM: Reverted ScopeLogic parameters to baseline standards.'); }} className="px-5 py-2 rounded-xl bg-[var(--bg-nested)] hover:opacity-90 text-sm font-bold border border-[var(--card-border)] transition focusable">Reset Defaults</button>
                  <button onClick={() => { spawnAlert('Configuration Persistent', 'ScopeLogic parameters written cleanly to local SQLite config tables.', 'green'); writeAuditLog('SYSTEM: Applied ScopeLogic parameters. Active validation thresholds updated.'); }} className="px-5 py-2 rounded-xl bg-gradient-to-r from-[var(--accent)] to-sky-600 hover:opacity-90 text-white dark:text-zinc-950 font-black text-sm transition shadow-lg shadow-[var(--accent-glow)] focusable">Apply Configurations</button>
                </div>
              </div>
            </div>

            <div className="w-full lg:w-96 flex flex-col space-y-6">
              <div className="glow-card rounded-2xl p-5 relative overflow-hidden transition-colors duration-300">
                <div className="flex items-center justify-between border-b border-[var(--card-border)] pb-3 mb-4">
                  <div className="flex items-center space-x-2 text-[var(--accent)]">
                    <ShieldCheck className="w-4 h-4" />
                    <h3 className="font-bold text-xs tracking-wider uppercase">Category A Guardrails</h3>
                  </div>
                  <span className="text-[10px] text-green-500 font-bold uppercase tracking-wider font-mono">ENFORCED</span>
                </div>
                <div className="space-y-3 text-xs">
                  <div className="flex items-start space-x-2 border-b border-[var(--card-border)] pb-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5" />
                    <div>
                      <span className="font-bold block text-[var(--text-primary)]">SA-01: Explanations SQL Block</span>
                      <p className="text-[11px] text-[var(--text-muted)] font-medium">No INSERT/UPDATE queries permitted in explanation paths.</p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-2 border-b border-[var(--card-border)] pb-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5" />
                    <div>
                      <span className="font-bold block text-[var(--text-primary)]">SA-02: Executive Code Quarantine</span>
                      <p className="text-[11px] text-[var(--text-muted)] font-medium">Strictly forbids raw bash, sh, or python compilation blocks.</p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5" />
                    <div>
                      <span className="font-bold block text-[var(--text-primary)]">SA-04: Node Category Sanity</span>
                      <p className="text-[11px] text-[var(--text-muted)] font-medium">Workflows forbidden from adding shell, exec, or eval nodes.</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="glow-card rounded-2xl p-5 relative overflow-hidden transition-colors duration-300">
                <div className="flex items-center justify-between border-b border-[var(--card-border)] pb-3 mb-4">
                  <div className="flex items-center space-x-2 text-[var(--accent)]">
                    <ShieldAlert className="w-4 h-4" />
                    <h3 className="font-bold text-xs tracking-wider uppercase">Quarantine Invariants</h3>
                  </div>
                  <span className="text-[9px] font-mono text-zinc-500 font-bold">Assume Breach</span>
                </div>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between p-2 rounded bg-[var(--accent)]/5 border border-[var(--accent)]/20">
                    <span className="font-bold">Proposals strictly Draft-Only</span>
                    <Lock className="w-3.5 h-3.5 text-[var(--accent)]" />
                  </div>
                  <div className="flex justify-between p-2 rounded bg-[var(--bg-nested)] border border-[var(--card-border)] text-zinc-400">
                    <span className="font-bold">0 Authority to mutate file states</span>
                    <Lock className="w-3.5 h-3.5 text-zinc-400" />
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

      {/* CHAT SENTINEL */}
      <div className="fixed bottom-12 right-6 z-50 flex flex-col items-end">
        <button onClick={() => { setIsChatOpen(!isChatOpen); playSynthSound(450, 'triangle', 0.1, 0.05); }} className="w-12 h-12 rounded-full bg-gradient-to-tr from-[var(--accent)] to-sky-600 text-white dark:text-zinc-950 flex items-center justify-center shadow-lg shadow-[var(--accent-glow)] hover:scale-105 transform transition duration-200 focusable">
          <BotMessageSquare className="w-6 h-6" />
        </button>
        <div className={\`w-80 h-96 bg-[var(--bg-surface-glass)] backdrop-blur-md border border-[var(--card-border)] rounded-2xl shadow-2xl mt-3 flex-col overflow-hidden transition-all duration-300 \${isChatOpen ? 'flex' : 'hidden'}\`}>
          <div className="bg-gradient-to-r from-zinc-950 to-cyan-950 p-3 flex items-center justify-between border-b border-[var(--card-border)]">
            <div className="flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-green-400"></span>
              <span className="text-xs font-bold tracking-wide uppercase text-white">Cerebro Assist Sentinel</span>
            </div>
            <button onClick={() => setIsChatOpen(false)} className="text-zinc-400 hover:text-white">
              <Minus className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3 text-xs">
            {chatMessages.map(m => (
              <div key={m.id} className={m.sender === 'USER' ? "bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--card-border)] p-2.5 rounded-xl rounded-tr-none self-end max-w-[85%] ml-auto text-right leading-relaxed shadow-sm font-semibold" : "bg-[var(--terminal-bg)] text-[var(--terminal-text)] border border-[var(--accent)]/20 p-2.5 rounded-xl rounded-tl-none self-start max-w-[85%] leading-relaxed shadow-sm"}>
                <span className={\`font-black text-[9px] \${m.sender === 'USER' ? 'text-zinc-400' : 'text-[var(--accent)]'} block mb-1\`}>{m.sender === 'USER' ? 'OPERATOR:' : 'CEREBRO SENTINEL:'}</span>
                {m.text}
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          <div className="p-2 border-t border-[var(--card-border)] bg-zinc-950/50 flex items-center space-x-1">
            <input 
              type="text" 
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleChatSubmit()}
              placeholder="Query our local cognitive nexus..." 
              className="flex-1 bg-[var(--bg-surface)] border border-[var(--card-border)] text-xs rounded-lg px-3 py-2 text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]" 
            />
            <button onClick={handleChatSubmit} className="p-2 bg-[var(--accent)] text-white dark:text-zinc-950 hover:opacity-90 rounded-lg transition focusable">
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* TOAST NOTIFICATION */}
      <div className={\`fixed top-20 left-1/2 transform -translate-x-1/2 z-50 bg-[var(--bg-surface-glass)] backdrop-blur-md border border-[var(--card-border)] p-4 rounded-xl shadow-2xl transition-all duration-300 pointer-events-none flex items-center space-x-3 max-w-sm \${toast ? 'opacity-100 translate-y-2' : 'opacity-0 translate-y-0'}\`}>
        {toast && (
          <>
            <div className={\`w-8 h-8 rounded-full flex items-center justify-center border \${toast.theme === 'red' ? 'bg-red-500/15 text-red-400 border-red-500/30' : toast.theme === 'green' ? 'bg-green-500/15 text-green-400 border-green-500/30' : 'bg-[var(--accent)]/15 text-[var(--accent)] border-[var(--accent)]/30'}\`}>
              {toast.theme === 'red' ? <TriangleAlert className="w-4 h-4" /> : toast.theme === 'green' ? <CircleCheckBig className="w-4 h-4" /> : <Info className="w-4 h-4" />}
            </div>
            <div className="flex-1">
              <span className={\`font-bold text-xs block uppercase tracking-wider \${toast.theme === 'red' ? 'text-red-400' : toast.theme === 'green' ? 'text-green-400' : 'text-[var(--accent)]'}\`}>{toast.title}</span>
              <p className="text-[11px] text-[var(--text-muted)] mt-0.5 font-bold">{toast.body}</p>
            </div>
          </>
        )}
      </div>

      {/* META EXPLORER */}
      {isMetaExplorerOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-6">
          <div className="w-full max-w-2xl bg-[var(--bg-surface)] border border-[var(--card-border)] rounded-2xl p-6 shadow-2xl flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between border-b border-[var(--card-border)] pb-3 mb-4">
              <div className="flex items-center space-x-2 text-[var(--accent)]">
                <Database className="w-5 h-5" />
                <h2 className="font-bold text-lg">System Cognitive Metadata Mapping</h2>
              </div>
              <button onClick={() => setIsMetaExplorerOpen(false)} className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-[var(--text-muted)] mb-4 font-semibold">Below is the verified programmatical list of system cognitive structures parsed directly from our active <code className="bg-[var(--bg-nested)] border border-[var(--card-border)] px-1 rounded">&lt;meta&gt;</code> Tags.</p>
            <div className="flex-1 overflow-y-auto space-y-3 font-mono text-[11px] pr-2">
              {metadata.map(([name, content]) => (
                <div key={name} className="p-3 bg-[var(--bg-nested)] border border-[var(--card-border)] rounded-xl space-y-1.5 transition hover:border-[var(--accent)]">
                  <div className="flex items-center space-x-2 text-[var(--accent)]">
                    <Tag className="w-3.5 h-3.5" />
                    <span className="font-bold text-xs uppercase">{name}</span>
                  </div>
                  <p className="text-[var(--text-muted)] text-[10px] leading-relaxed font-semibold">{content}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-3 border-t border-[var(--card-border)] flex justify-end">
              <button onClick={() => setIsMetaExplorerOpen(false)} className="bg-[var(--accent)] text-white dark:text-zinc-950 px-4 py-2 rounded-xl text-xs font-bold focusable">Return to cockpit</button>
            </div>
          </div>
        </div>
      )}
      
    </div>
  );
}
\`;

fs.writeFileSync('/home/williamdeldaymarketing/Projects/NeuroSyncMega/src/ui/views/ScopeLogicDashboard.tsx', tsxContent);
console.log('Successfully wrote ScopeLogicDashboard.tsx');
