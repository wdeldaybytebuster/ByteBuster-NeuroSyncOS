import React, { useState } from 'react';
import { Activity, BrainCircuit, Cpu, ShieldCheck, LayoutDashboard, Database } from 'lucide-react';
import { UnifiedMasterDashboard } from '../views/UnifiedMasterDashboard';
import { CoreExecDashboard } from '../views/CoreExecDashboard';
import { RouteSwitchDashboard } from '../views/RouteSwitchDashboard';
import { CerebroDashboard } from '../views/CerebroDashboard';
import { BaseVaultDashboard } from '../views/BaseVaultDashboard';
import { ScopeLogicDashboard } from '../views/ScopeLogicDashboard';
import { ScoutDaemonDashboard } from '../views/ScoutDaemonDashboard';
import { ThemeToggle } from '../components/ThemeToggle';

export function OSLayout() {
  const [activeView, setActiveView] = useState('master');

  const renderView = () => {
    switch (activeView) {
      case 'master': return <UnifiedMasterDashboard onNavigate={setActiveView} />;
      case 'coreexec': return <CoreExecDashboard />;
      case 'routeswitch': return <RouteSwitchDashboard />;
      case 'cerebro': return <CerebroDashboard />;
      case 'basevault': return <BaseVaultDashboard />;
      case 'scopelogic': return <ScopeLogicDashboard />;
      case 'scoutdaemon': return <ScoutDaemonDashboard />;
      default: return <UnifiedMasterDashboard onNavigate={setActiveView} />;
    }
  };

  return (
    <div className="flex h-screen w-full bg-void text-foreground font-sans overflow-hidden transition-colors duration-300">
      {/* Sidebar Navigation */}
      <nav className="w-64 glass-enclave border-r border-white/5 flex flex-col pt-6 z-10 shadow-2xl relative overflow-y-auto custom-scrollbar transition-colors duration-300">
        <div className="px-6 mb-8 relative z-10 shrink-0">
          <h1 className="flex items-center gap-2">
            <img src="/NeuroSyncSovereignOSLogo.png" alt="NeuroSyncOS Logo" className="h-10 w-auto object-contain drop-shadow-glow-gold" />
          </h1>
          <p className="text-[10px] text-sterling-silver/70 font-mono mt-2 tracking-widest uppercase border-b border-white/10 pb-2">v1.0.0 NeuroSyncOS</p>
        </div>

        <div className="flex flex-col gap-2 px-4 relative z-10 mb-8">
          <NavItem 
            id="master" active={activeView === 'master'} onClick={setActiveView} 
            icon={<LayoutDashboard size={18} />} label="Master Dashboard"
            glowColor="sovereign-gold"
          />
          <NavItem 
            id="scopelogic" active={activeView === 'scopelogic'} onClick={setActiveView} 
            icon={<BrainCircuit size={18} />} label="ScopeLogic"
            glowColor="route-switch"
          />
          <NavItem 
            id="coreexec" active={activeView === 'coreexec'} onClick={setActiveView} 
            icon={<Cpu size={18} />} label="CoreExec & DAGs"
            glowColor="core-exec"
          />
          <NavItem 
            id="routeswitch" active={activeView === 'routeswitch'} onClick={setActiveView} 
            icon={<ShieldCheck size={18} />} label="RouteSwitch LLM"
            glowColor="route-switch"
          />
          <NavItem 
            id="cerebro" active={activeView === 'cerebro'} onClick={setActiveView} 
            icon={<BrainCircuit size={18} />} label="Cerebro Logic"
            glowColor="neural-blue"
          />
          <NavItem 
            id="basevault" active={activeView === 'basevault'} onClick={setActiveView} 
            icon={<Database size={18} />} label="BaseVault Storage"
            glowColor="neural-blue"
          />
          <NavItem 
            id="scoutdaemon" active={activeView === 'scoutdaemon'} onClick={setActiveView} 
            icon={<Activity size={18} />} label="ScoutDaemon"
            glowColor="report-green"
          />
        </div>

        <div className="mt-auto p-6 relative z-10 shrink-0 flex flex-col gap-6">
          <ThemeToggle />
          
          <div className="text-[10px] uppercase tracking-widest text-gray-500 text-center font-mono flex flex-col gap-1 items-center">
            <ShieldCheck size={14} className="text-report-green drop-shadow-glow-cyan" />
            Zero-Trust Isolation
          </div>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto relative bg-transparent">
        {renderView()}
      </main>
    </div>
  );
}

function NavItem({ id, active, onClick, icon, label, glowColor }: any) {
  // Use dynamic tailwind classes based on glowColor
  const activeClasses: Record<string, string> = {
    'sovereign-gold': 'bg-sovereign-gold/10 text-sovereign-gold border-sovereign-gold/30 shadow-glow-gold',
    'core-exec': 'bg-core-exec/10 text-core-exec border-core-exec/30 shadow-glow-blue',
    'route-switch': 'bg-route-switch/10 text-route-switch border-route-switch/30 shadow-glow-amber',
    'neural-blue': 'bg-neural-blue/10 text-neural-blue border-neural-blue/30 shadow-glow-blue',
  };

  const hoverClasses = `hover:bg-white/5 hover:text-white border-transparent`;
  
  return (
    <button
      onClick={() => onClick(id)}
      className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-semibold transition-all duration-300 border ${
        active ? activeClasses[glowColor] : hoverClasses + ' text-gray-400'
      }`}
    >
      <span className={`${active ? `drop-shadow-glow-${glowColor.split('-').pop()}` : 'opacity-70'}`}>
        {icon}
      </span>
      {label}
    </button>
  );
}
