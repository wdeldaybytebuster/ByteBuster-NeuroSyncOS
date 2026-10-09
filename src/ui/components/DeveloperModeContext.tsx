import React, { createContext, useContext, useEffect, useState } from 'react';
import { API, authFetch } from '../lib/api';


interface DeveloperModeContextType {
  isDeveloperMode: boolean;
  setDeveloperMode: (value: boolean) => void;
  isConstrained: boolean;
}

const DeveloperModeContext = createContext<DeveloperModeContextType | undefined>(undefined);

export function DeveloperModeProvider({ children }: { children: React.ReactNode }) {
  // Default is TRUE — the canonical module names (CoreExec Engine, BaseVault Storage,
  // RouteSwitch LLM, ScopeLogic, PortGrid Skills, ScoutDaemon, Cerebro Memory) are
  // the system default per AGENTS.md. Simple mode is opt-in, not the baseline.
  const [isDeveloperMode, setIsDeveloperMode] = useState<boolean>(() => {
    const stored = localStorage.getItem('ns-developer-mode');
    // If no preference has ever been stored, start in Developer mode.
    return stored === null ? true : stored === 'true';
  });
  const [isConstrained, setIsConstrained] = useState<boolean>(false);

  // On first-ever launch (no localStorage key), sync the true default to the server
  // so the system_settings table reflects reality.
  useEffect(() => {
    if (localStorage.getItem('ns-developer-mode') !== null) return;
    localStorage.setItem('ns-developer-mode', 'true');
    const syncDefault = async () => {
      try {
        await authFetch(`${API}/api/system/settings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ developer_mode: true }),
        });
      } catch (err: any) {
        if (err instanceof TypeError || err.message === 'Failed to fetch') {
          const queue = JSON.parse(localStorage.getItem('ns-sync-queue') || '[]');
          queue.push({ endpoint: '/api/system/settings', payload: { developer_mode: true } });
          localStorage.setItem('ns-sync-queue', JSON.stringify(queue));
        }
      }
    };
    syncDefault();
    // Mount-only by construction: this effect is the first-launch default
    // sync. It must run exactly once (it WRITES the localStorage key it
    // guards on), so it deliberately declares no dependencies — re-running
    // on any dep change would re-POST the default to the server.
  }, []);

  useEffect(() => {
    authFetch(`${API}/api/system/settings`)
      .then(r => r.json())
      .then(d => {
        if (d.settings?.hardware_tier) {
          setIsConstrained(d.settings.hardware_tier === 'constrained');
        }
      })
      .catch(console.error);
  }, []);

  const setDeveloperMode = async (value: boolean) => {
    setIsDeveloperMode(value);
    localStorage.setItem('ns-developer-mode', String(value));
    try {
      await authFetch(`${API}/api/system/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ developer_mode: value }),
      });
    } catch (err: any) {
      if (err instanceof TypeError || err.message === 'Failed to fetch') {
        // Queue the action in local state instead of throwing
        const queue = JSON.parse(localStorage.getItem('ns-sync-queue') || '[]');
        queue.push({ endpoint: '/api/system/settings', payload: { developer_mode: value } });
        localStorage.setItem('ns-sync-queue', JSON.stringify(queue));
      }
    }
  };

  return (
    <DeveloperModeContext.Provider value={{ isDeveloperMode, setDeveloperMode, isConstrained }}>
      {children}
    </DeveloperModeContext.Provider>
  );
}

export function useDeveloperMode() {
  const context = useContext(DeveloperModeContext);
  if (context === undefined) {
    throw new Error('useDeveloperMode must be used within a DeveloperModeProvider');
  }
  return context;
}
