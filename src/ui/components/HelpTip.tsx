import React from 'react';
import { Info } from 'lucide-react';
import { useDeveloperMode } from './DeveloperModeContext';
import { usePreferences } from './PreferencesContext';
import { shouldShowHelpTip } from './preferencesLogic';

interface HelpTipProps {
  /** Plain-English explanation of a technical term, shown on hover/focus. */
  text: string;
}

/**
 * Small inline info icon with a plain-English tooltip explaining a technical
 * term. Renders ONLY in Hobbyist Mode (Developer Mode users see nothing) AND
 * only while UnifiedMasterDashboard's SmartTips setting is on — that setting
 * used to be pure local UI state with no consumer anywhere; this is the
 * actual "45+ educational tooltips" kill-switch its label promises.
 * Usage: <h2>Database Save Points <HelpTip text="A save point is..." /></h2>
 */
export function HelpTip({ text }: HelpTipProps) {
  const { isDeveloperMode } = useDeveloperMode();
  const { smartTipsEnabled } = usePreferences();
  if (!shouldShowHelpTip(isDeveloperMode, smartTipsEnabled)) return null;

  return (
    <span className="relative inline-flex group align-middle" tabIndex={0} aria-label={text} role="note">
      <Info size={13} className="text-gray-500 group-hover:text-cyan-300 group-focus:text-cyan-300 cursor-help transition-colors shrink-0" />
      <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 top-full mt-2 w-60 z-50 hidden group-hover:block group-focus:block bg-black/90 border border-white/10 rounded-lg p-2.5 text-[10px] font-normal normal-case tracking-normal text-gray-300 leading-relaxed text-left shadow-xl backdrop-blur-md">
        {text}
      </span>
    </span>
  );
}
