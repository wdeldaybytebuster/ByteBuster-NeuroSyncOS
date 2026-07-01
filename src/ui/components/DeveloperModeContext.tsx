import React, { createContext, useContext, useEffect, useState } from 'react';

const API = 'http://localhost:3743';

interface DeveloperModeContextType {
  isDeveloperMode: boolean;
  setDeveloperMode: (value: boolean) => void;
}

const DeveloperModeContext = createContext<DeveloperModeContextType | undefined>(undefined);

export function DeveloperModeProvider({ children }: { children: React.ReactNode }) {
  const [isDeveloperMode, setIsDeveloperMode] = useState<boolean>(() => {
    const stored = localStorage.getItem('ns-developer-mode');
    return stored === 'true';
  });

  // Fallback: if localStorage was empty (cleared, or first-ever launch),
  // pick up a previously-persisted server-side value once it resolves.
  // Never blocks initial render — defaults to false until this settles.
  useEffect(() => {
    if (localStorage.getItem('ns-developer-mode') !== null) return;
    fetch(`${API}/api/system/settings`)
      .then(r => r.json())
      .then(d => {
        if (d?.success && d.settings?.developer_mode === true) {
          setIsDeveloperMode(true);
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setDeveloperMode = (value: boolean) => {
    setIsDeveloperMode(value);
    localStorage.setItem('ns-developer-mode', String(value));
    // Fire-and-forget sync to system_settings — mirrors PortGridDashboard's saveSettings() pattern.
    fetch(`${API}/api/system/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ developer_mode: value }),
    }).catch(() => {});
  };

  return (
    <DeveloperModeContext.Provider value={{ isDeveloperMode, setDeveloperMode }}>
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
