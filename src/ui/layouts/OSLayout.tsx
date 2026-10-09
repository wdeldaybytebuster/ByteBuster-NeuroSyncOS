import React, { useState, createContext, useContext, lazy, Suspense } from 'react';
import { CerebroChatbot } from '../components/CerebroChatbot';

// Phase F-3 — the eight dashboards are lazy boundaries. Each view pulls a
// heavy dependency family with it (CoreExec → xyflow canvas, PortGrid →
// xterm terminal, …); eagerly importing all of them charged every boot with
// the whole graph even though exactly one is ever mounted. `lazy()` +
// Suspense splits them into separately-loaded chunks that pair with the
// F-2 manualChunks map. The named-export mapping (.then(m => ({default})))
// is required because each view exports its component by name.
//
// CerebroChatbot stays EAGER on purpose (blueprint F-3): it is a global
// singleton mounted on every view from first paint — lazy-loading the
// assistant would add a flash of missing UI to every navigation.
const UnifiedMasterDashboard = lazy(() =>
  import('../views/UnifiedMasterDashboard.js').then(m => ({ default: m.UnifiedMasterDashboard })));
const CoreExecDashboard = lazy(() =>
  import('../views/CoreExecDashboard.js').then(m => ({ default: m.CoreExecDashboard })));
const RouteSwitchDashboard = lazy(() =>
  import('../views/RouteSwitchDashboard.js').then(m => ({ default: m.RouteSwitchDashboard })));
const CerebroDashboard = lazy(() =>
  import('../views/CerebroDashboard.js').then(m => ({ default: m.CerebroDashboard })));
const BaseVaultDashboard = lazy(() =>
  import('../views/BaseVaultDashboard.js').then(m => ({ default: m.BaseVaultDashboard })));
const PortGridDashboard = lazy(() =>
  import('../views/PortGridDashboard.js').then(m => ({ default: m.PortGridDashboard })));
const ScopeLogicDashboard = lazy(() =>
  import('../views/ScopeLogicDashboard.js').then(m => ({ default: m.ScopeLogicDashboard })));
const ScoutDaemonDashboard = lazy(() =>
  import('../views/ScoutDaemonDashboard.js').then(m => ({ default: m.ScoutDaemonDashboard })));

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

/**
 * F-3 Suspense fallback for the lazy dashboard boundary. A loading state
 * only — no placeholder/mock data (AGENTS.md rule 4: dashboards poll live
 * SQLite + daemons; nothing offline may stand in for them).
 */
function DashboardFallback() {
  return (
    <div className="h-full w-full flex items-center justify-center bg-void text-muted-foreground font-mono text-sm">
      <span className="animate-pulse">Loading module…</span>
    </div>
  );
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
        <Suspense fallback={<DashboardFallback />}>
          {renderView()}
        </Suspense>
        <CerebroChatbot />
      </div>
    </NavigationContext.Provider>
  );
}
