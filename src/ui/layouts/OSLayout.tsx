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

export function OSLayout() {
  const [activeView, setActiveView] = useState('coreexec');
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeProjectName, setActiveProjectName] = useState('Global');
  const [leftBarOpen, setLeftBarOpen] = useState(false);
  const [rightBarOpen, setRightBarOpen] = useState(false);

  const setActiveProject = (id: string | null, name: string) => {
    setActiveProjectId(id);
    setActiveProjectName(name);
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
