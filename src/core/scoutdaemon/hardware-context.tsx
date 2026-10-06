import React, { createContext, useContext, ReactNode } from 'react';

export type HardwareTier = 'constrained' | 'standard' | 'high-performance';

const HardwareContext = createContext<HardwareTier>('standard');

export function HardwareProvider({ tier, children }: { tier: HardwareTier, children: ReactNode }) {
  return <HardwareContext.Provider value={tier}>{children}</HardwareContext.Provider>;
}

export function useHardwareTier(): HardwareTier {
  return useContext(HardwareContext);
}
