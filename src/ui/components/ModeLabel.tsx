import React from 'react';
import { useDeveloperMode } from './DeveloperModeContext';

/**
 * Returns the plain-English label in Hobbyist Mode (default) and the
 * technical label in Developer Mode. Thin wrapper over useDeveloperMode().
 */
export function useModeLabel(simple: string, dev: string): string {
  const { isDeveloperMode } = useDeveloperMode();
  return isDeveloperMode ? dev : simple;
}

interface ModeLabelProps {
  /** Plain-English wording shown in Hobbyist Mode (the default). */
  simple: string;
  /** Technical wording shown in Developer Mode. */
  dev: string;
}

/**
 * Inline text that swaps between hobbyist and developer wording.
 * Usage: <ModeLabel simple="Safe Command Zone" dev="P0 Command Sandbox" />
 */
export function ModeLabel({ simple, dev }: ModeLabelProps) {
  return <>{useModeLabel(simple, dev)}</>;
}
