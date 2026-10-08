/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render } from '@testing-library/react';
// These imports will be implemented by the Engineer
import App from './App';
import * as HardwareContext from '../core/scoutdaemon/hardware-context';

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Mock the Genesis Profiler hook that will be injected
vi.mock('../core/scoutdaemon/hardware-context', () => ({
  useHardwareTier: () => 'constrained',
}));

// Mock out complex children that throw without providers
vi.mock('./components/ScopeLogicChat', () => ({ ScopeLogicChat: () => <div /> }));
vi.mock('./components/RunHistory', () => ({ RunHistory: () => <div /> }));
vi.mock('./components/ApprovalCockpit', () => ({ ApprovalCockpit: () => <div /> }));
vi.mock('./components/SettingsModal', () => ({ SettingsModal: () => <div /> }));
vi.mock('./components/Statusline', () => ({ Statusline: () => <div /> }));

describe('UI Degradation Engine', () => {
  it('strips glassmorphism CSS and disables animations on constrained tier', () => {
    // Render the main app
    const { container } = render(<App />);
    
    // Assert that the degradation class is applied to the root container
    expect(container.firstElementChild?.classList.contains('hardware-constrained')).toBe(true);
    
    // Assert that glassmorphism classes are absent
    const glassPanels = container.querySelectorAll('.glass-panel');
    expect(glassPanels.length).toBe(0); // Should be replaced with solid-panel or similar
    
    // Check that animations are globally disabled
    expect(container.firstElementChild?.classList.contains('disable-animations')).toBe(true);
  });
});
