import React, { createContext, useContext, useEffect, useState } from 'react';
import { coerceBooleanSetting } from './preferencesLogic';

const API = 'http://localhost:3743';

interface PreferencesContextType {
  /** Global SmartTips kill-switch (UnifiedMasterDashboard Set-up, Control C).
   * Gates every <HelpTip> in the app — HelpTip already hides itself in
   * Developer Mode; this ALSO hides it in Hobbyist Mode when the user has
   * turned tips off. Defaults to true (today's pre-existing always-on
   * behavior) until a saved value resolves. */
  smartTipsEnabled: boolean;
  setSmartTipsEnabled: (value: boolean) => void;
  /** Reduced Motion (same Control). Toggles the `ns-reduced-motion` class on
   * <html>, which index.css uses to force every animation/transition
   * duration to ~0 app-wide — real, not a per-component gate, because this
   * codebase's transition-all/animate-* utility classes are used in every
   * single dashboard component. Defaults to false (today's pre-existing
   * always-animated behavior). */
  reducedMotion: boolean;
  setReducedMotion: (value: boolean) => void;
}

const PreferencesContext = createContext<PreferencesContextType | undefined>(undefined);

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [smartTipsEnabled, setSmartTipsEnabledState] = useState<boolean>(() => {
    const stored = localStorage.getItem('ns-smart-tips');
    return stored === null ? true : stored === 'true';
  });
  const [reducedMotion, setReducedMotionState] = useState<boolean>(() => {
    return localStorage.getItem('ns-reduced-motion') === 'true';
  });

  // Fallback: if localStorage was empty for either preference (cleared, or
  // first-ever launch), pick up a previously-persisted server-side value
  // once it resolves. Mirrors DeveloperModeContext's same fallback pattern.
  useEffect(() => {
    const needsSmartTips = localStorage.getItem('ns-smart-tips') === null;
    const needsReducedMotion = localStorage.getItem('ns-reduced-motion') === null;
    if (!needsSmartTips && !needsReducedMotion) return;
    fetch(`${API}/api/system/settings`)
      .then(r => r.json())
      .then(d => {
        if (!d?.success || !d.settings) return;
        if (needsSmartTips) {
          setSmartTipsEnabledState(coerceBooleanSetting(d.settings.smart_tips, true));
        }
        if (needsReducedMotion) {
          setReducedMotionState(coerceBooleanSetting(d.settings.reduced_motion, false));
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The actual real-world effect: force every animation/transition duration
  // to ~0 app-wide while reducedMotion is on (see index.css `.ns-reduced-motion`).
  useEffect(() => {
    const root = document.documentElement;
    if (reducedMotion) root.classList.add('ns-reduced-motion');
    else root.classList.remove('ns-reduced-motion');
  }, [reducedMotion]);

  const setSmartTipsEnabled = (value: boolean) => {
    setSmartTipsEnabledState(value);
    localStorage.setItem('ns-smart-tips', String(value));
    fetch(`${API}/api/system/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ smart_tips: value }),
    }).catch(() => {});
  };

  const setReducedMotion = (value: boolean) => {
    setReducedMotionState(value);
    localStorage.setItem('ns-reduced-motion', String(value));
    fetch(`${API}/api/system/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reduced_motion: value }),
    }).catch(() => {});
  };

  return (
    <PreferencesContext.Provider value={{ smartTipsEnabled, setSmartTipsEnabled, reducedMotion, setReducedMotion }}>
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences() {
  const context = useContext(PreferencesContext);
  if (context === undefined) {
    throw new Error('usePreferences must be used within a PreferencesProvider');
  }
  return context;
}
