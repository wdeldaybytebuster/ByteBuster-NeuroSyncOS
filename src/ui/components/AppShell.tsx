import React from 'react';
import { Menu, Sidebar, X, Sun, Moon, Code2 } from 'lucide-react';
import { ModuleRouter } from './ModuleRouter';
import { ProjectSwitcher } from './ProjectSwitcher';
import { useNavigation } from '../layouts/OSLayout';
import { useTheme } from './ThemeContext';
import { useDeveloperMode } from './DeveloperModeContext';

interface AppShellProps {
  moduleId: string;
  moduleName: string;
  moduleLogo: string;
  accentColor: string;
  children: React.ReactNode;
  activeView: 'dashboard' | 'setups';
  onViewChange: (view: 'dashboard' | 'setups') => void;
}

export function AppShell({ moduleId, moduleName, moduleLogo, accentColor, children, activeView, onViewChange }: AppShellProps) {
  const { activeProjectName, leftBarOpen, setLeftBarOpen, rightBarOpen, setRightBarOpen } = useNavigation();
  const { theme, setTheme } = useTheme();
  const { isDeveloperMode, setDeveloperMode } = useDeveloperMode();

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* TOP NAVIGATION BAR */}
      <header className="h-16 shrink-0 flex items-center justify-between px-4 border-b border-white/5 bg-void/80 backdrop-blur-md z-40">
        {/* Left: Hamburger + Logo (hero) + Brand + Module Name */}
        <div className="flex items-center gap-4">
          <button onClick={() => setLeftBarOpen(!leftBarOpen)} className="w-8 h-8 rounded-md flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-all" aria-label="Toggle module navigation">
            <Menu size={18} />
          </button>
          <img src={moduleLogo} alt={moduleName} className="h-11 w-11 object-contain drop-shadow-lg" style={{ filter: `drop-shadow(0 0 8px ${accentColor}40)` }} />
          <div className="hidden sm:flex flex-col">
            <span className="text-base font-black tracking-wide" style={{ color: accentColor }}>{moduleName}</span>
            <span className="text-[9px] font-mono text-gray-500 tracking-widest uppercase -mt-0.5">ByteBuster NeuroSyncOS v1.0</span>
          </div>
        </div>

        {/* Center: View Toggles */}
        <div className="flex items-center gap-1 bg-white/5 p-1 rounded-lg border border-white/5">
          <button
            onClick={() => onViewChange('dashboard')}
            className={`px-4 py-1.5 rounded-md text-xs font-bold tracking-wide transition-all ${activeView === 'dashboard' ? 'text-black shadow-md' : 'text-gray-400 hover:text-white'}`}
            style={activeView === 'dashboard' ? { backgroundColor: accentColor } : {}}
          >
            Dashboard
          </button>
          <button
            onClick={() => onViewChange('setups')}
            className={`px-4 py-1.5 rounded-md text-xs font-bold tracking-wide transition-all ${activeView === 'setups' ? 'text-black shadow-md' : 'text-gray-400 hover:text-white'}`}
            style={activeView === 'setups' ? { backgroundColor: accentColor } : {}}
          >
            Set-up
          </button>
        </div>

        {/* Right: Developer Mode toggle + Theme toggle + Project filter badge + Sidebar toggle */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setDeveloperMode(!isDeveloperMode)}
            className={`w-8 h-8 rounded-md flex items-center justify-center transition-all ${isDeveloperMode ? 'text-black' : 'text-gray-400 hover:text-white hover:bg-white/10'}`}
            style={isDeveloperMode ? { backgroundColor: accentColor } : {}}
            aria-label="Toggle Developer Mode"
            aria-pressed={isDeveloperMode}
            title={isDeveloperMode ? 'Developer Mode: ON — showing raw technical details' : 'Developer Mode: OFF — showing simple explanations'}
          >
            <Code2 size={16} />
          </button>
          <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="w-8 h-8 rounded-md flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-all" aria-label="Toggle theme">
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <div className="hidden md:flex items-center gap-2 text-[10px] font-mono">
            <span className="text-gray-500">Filter:</span>
            <span className="px-2 py-0.5 rounded border border-white/10 bg-white/5" style={{ color: activeProjectName === 'Global' ? '#00FF41' : accentColor }}>
              {activeProjectName}
            </span>
            {activeView === 'setups' && <span className="text-yellow-500 font-bold">(ignored)</span>}
          </div>
          <button onClick={() => setRightBarOpen(!rightBarOpen)} className="w-8 h-8 rounded-md flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-all" aria-label="Toggle project switcher">
            <Sidebar size={18} />
          </button>
        </div>
      </header>

      {/* BODY: Left Bar + Center + Right Bar (flex layout — center shrinks when bars open) */}
      <div className="flex-1 flex overflow-hidden">
        {/* LEFT BAR: Module Router */}
        <aside className={`shrink-0 h-full transition-all duration-300 overflow-hidden bg-void/95 backdrop-blur-xl border-r border-white/5 shadow-2xl flex flex-col ${leftBarOpen ? 'w-64' : 'w-0 border-r-0'}`}>
          <div className="p-4 border-b border-white/5 flex items-center justify-between min-w-[16rem]">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Modules</span>
            <button onClick={() => setLeftBarOpen(false)} className="w-6 h-6 rounded flex items-center justify-center text-gray-500 hover:text-white hover:bg-white/10"><X size={14} /></button>
          </div>
          <div className="min-w-[16rem]">
            <ModuleRouter currentModule={moduleId} />
          </div>
        </aside>

        {/* CENTER CANVAS */}
        <main className="flex-1 overflow-y-auto min-w-0">
          {children}
        </main>

        {/* RIGHT BAR: Project Switcher */}
        <aside className={`shrink-0 h-full transition-all duration-300 overflow-hidden bg-void/95 backdrop-blur-xl border-l border-white/5 shadow-2xl flex flex-col ${rightBarOpen ? 'w-72' : 'w-0 border-l-0'}`}>
          <div className="p-4 border-b border-white/5 flex items-center justify-between min-w-[18rem]">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Context</span>
            <button onClick={() => setRightBarOpen(false)} className="w-6 h-6 rounded flex items-center justify-center text-gray-500 hover:text-white hover:bg-white/10"><X size={14} /></button>
          </div>
          <div className="min-w-[18rem]">
            <ProjectSwitcher />
          </div>
        </aside>
      </div>
    </div>
  );
}
