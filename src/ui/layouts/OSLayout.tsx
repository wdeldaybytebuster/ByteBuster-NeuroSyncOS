import React, { useState, createContext, useContext } from 'react';
import { UnifiedMasterDashboard } from '../views/UnifiedMasterDashboard';
import { CoreExecDashboard } from '../views/CoreExecDashboard';
import { RouteSwitchDashboard } from '../views/RouteSwitchDashboard';
import { CerebroDashboard } from '../views/CerebroDashboard';
import { BaseVaultDashboard } from '../views/BaseVaultDashboard';
import { PortGridDashboard } from '../views/PortGridDashboard';
import { ScopeLogicDashboard } from '../views/ScopeLogicDashboard';
import { ScoutDaemonDashboard } from '../views/ScoutDaemonDashboard';
import { CerebroChatbot } from '../components/CerebroChatbot';

// Global navigation + project context
interface NavigationContextType {
  activeView: string;
  navigate: (view: string) => void;
  activeProjectId: string | null;
  activeProjectName: string;
  setActiveProject: (id: string | null, name: string) => void;
  leftBarOpen: boolean;
  setLeftBarOpen: (open: boolean) => void;
  rightBarOpen: boolean;
  setRightBarOpen: (open: boolean) => void;
}

export const NavigationContext = createContext<NavigationContextType>({
  activeView: 'master',
  navigate: () => {},
  activeProjectId: null,
  activeProjectName: 'Global',
  setActiveProject: () => {},
  leftBarOpen: false,
  setLeftBarOpen: () => {},
  rightBarOpen: false,
  setRightBarOpen: () => {},
});

export function useNavigation() {
  return useContext(NavigationContext);
}

const ACTIVE_PROJECT_STORAGE_KEY = 'ns-active-project';

function readStoredActiveProject(): { id: string | null; name: string } {
  try {
    const raw = localStorage.getItem(ACTIVE_PROJECT_STORAGE_KEY);
    if (!raw) return { id: null, name: 'Global' };
    const parsed = JSON.parse(raw);
    if (typeof parsed.id === 'string' && typeof parsed.name === 'string') return parsed;
  } catch { /* fall through to default */ }
  return { id: null, name: 'Global' };
}

export function OSLayout() {
  const [activeView, setActiveView] = useState('coreexec');
  const initialProject = readStoredActiveProject();
  const [activeProjectId, setActiveProjectId] = useState<string | null>(initialProject.id);
  const [activeProjectName, setActiveProjectName] = useState(initialProject.name);
  const [leftBarOpen, setLeftBarOpen] = useState(false);
  const [rightBarOpen, setRightBarOpen] = useState(false);

  const setActiveProject = (id: string | null, name: string) => {
    setActiveProjectId(id);
    setActiveProjectName(name);
    try {
      localStorage.setItem(ACTIVE_PROJECT_STORAGE_KEY, JSON.stringify({ id, name }));
    } catch { /* localStorage unavailable — selection just won't persist */ }
  };

  const renderView = () => {
    switch (activeView) {
      case 'master': return <UnifiedMasterDashboard onNavigate={setActiveView} />;
      case 'coreexec': return <CoreExecDashboard />;
      case 'routeswitch': return <RouteSwitchDashboard />;
      case 'cerebro': return <CerebroDashboard />;
      case 'basevault': return <BaseVaultDashboard />;
      case 'portgrid': return <PortGridDashboard />;
      case 'scopelogic': return <ScopeLogicDashboard />;
      case 'scoutdaemon': return <ScoutDaemonDashboard />;
      default: return <UnifiedMasterDashboard onNavigate={setActiveView} />;
    }
  };

  return (
    <NavigationContext.Provider value={{ activeView, navigate: setActiveView, activeProjectId, activeProjectName, setActiveProject, leftBarOpen, setLeftBarOpen, rightBarOpen, setRightBarOpen }}>
      <div className="h-screen w-full bg-void text-foreground font-sans overflow-hidden transition-colors duration-300">
        {renderView()}
        <CerebroChatbot />
      </div>
    </NavigationContext.Provider>
  );
}
