import React from 'react';
import { useNavigation } from '../layouts/OSLayout';
import { useDeveloperMode } from './DeveloperModeContext';
import { MODULE_LABELS } from './moduleLabels';

const modules = [
  { id: 'master', logo: '/NeuroSyncSovereignOSLogo.png', color: '#D4AF37' },
  { id: 'coreexec', logo: '/COREEXECLogo.png', color: '#00E5FF' },
  { id: 'basevault', logo: '/BASEVAULTLogo.png', color: '#D4AF37' },
  { id: 'routeswitch', logo: '/ROUTESWITCHLogo.png', color: '#FFB300' },
  { id: 'scopelogic', logo: '/SCOPELOGICLogo.png', color: '#00E5FF' },
  { id: 'portgrid', logo: '/PORTGRIDLogo.png', color: '#00FFCC' },
  { id: 'scoutdaemon', logo: '/SCOUTDAEMONLogo.png', color: '#8E24AA' },
  { id: 'cerebro', logo: '/CerebroLogo.png', color: '#2DD4BF' },
];

interface ModuleRouterProps {
  currentModule: string;
  onNavigate?: () => void;
}

export function ModuleRouter({ currentModule, onNavigate }: ModuleRouterProps) {
  const { navigate } = useNavigation();
  const { isDeveloperMode } = useDeveloperMode();

  return (
    <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
      {modules.map(mod => {
        const isActive = mod.id === currentModule;
        const labels = MODULE_LABELS[mod.id];
        const label = labels ? (isDeveloperMode ? labels.dev : labels.simple) : mod.id;
        return (
          <button
            key={mod.id}
            onClick={() => { navigate(mod.id); onNavigate?.(); }}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 ${
              isActive
                ? 'bg-white/10 border border-white/10 shadow-lg'
                : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'
            }`}
            style={isActive ? { color: mod.color, borderColor: `${mod.color}33` } : {}}
          >
            <img src={mod.logo} alt={label} className="w-5 h-5 object-contain" />
            <span className="truncate">{label}</span>
            {isActive && <span className="ml-auto w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: mod.color }}></span>}
          </button>
        );
      })}
    </nav>
  );
}
