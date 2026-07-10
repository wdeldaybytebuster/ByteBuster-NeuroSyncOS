/**
 * Pure decision logic behind UnifiedMasterDashboard's SmartTips + Reduced
 * Motion settings (PreferencesContext.tsx, HelpTip.tsx). Kept separate from
 * the React context/component so it's directly unit-testable without a
 * DOM/React test harness (this codebase's vitest config runs in the `node`
 * environment — no `document`/`localStorage` — see scoutTelemetry.ts for the
 * same pattern applied to ScoutDaemon's Sensory Modality).
 */

/**
 * Coerces a raw system_settings value into a boolean. GET /api/system/settings
 * JSON.parse()s each stored value, so a boolean saved via POST usually comes
 * back as a genuine JS boolean already — but this stays defensive against a
 * raw 'true'/'false' string slipping through (e.g. a value written directly
 * into the DB, or a future settings source that doesn't round-trip through
 * JSON.parse). Returns `fallback` when the key was never saved (`undefined`).
 */
export function coerceBooleanSetting(raw: unknown, fallback: boolean): boolean {
  if (raw === undefined) return fallback;
  return raw === true || raw === 'true';
}

/**
 * HelpTip's actual visibility gate: hidden in Developer Mode (regardless of
 * SmartTips), and hidden in Hobbyist Mode when SmartTips has been turned off.
 * Visible only for a Hobbyist-Mode user with SmartTips on.
 */
export function shouldShowHelpTip(isDeveloperMode: boolean, smartTipsEnabled: boolean): boolean {
  return !isDeveloperMode && smartTipsEnabled;
}
