// @vitest-environment jsdom
/**
 * Phase F-5 — first jsdom-environment test in the suite. Vitest 4 removed
 * `environmentMatchGlobs`; this per-file docblock pragma is the sanctioned
 * replacement (see vitest.config.ts — the default environment stays 'node').
 *
 * Scope: OSLayout is the navigation shell of the whole OS — it owns the
 * NavigationContext (active view + active project) and persists the active
 * project to localStorage. Its eight dashboard children are mocked: each is
 * a real view with its own SSE/fetch effects, and the layout contract under
 * test is view switching + context wiring, not dashboard internals. (F-3
 * turns these same imports into lazy boundaries — this harness keeps working
 * unchanged because it mocks the modules, not the import style.)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { OSLayout, useNavigation } from './OSLayout';

/**
 * Context consumer probe — rendered as the DEFAULT view's dashboard so it
 * proves children read NavigationContext FROM THE PROVIDER OSLayout mounts
 * (a bare render of the probe outside OSLayout would read the default value).
 */
function NavProbe() {
  const nav = useNavigation();
  return (
    <div>
      <span data-testid="active-view">{nav.activeView}</span>
      <span data-testid="active-project">{nav.activeProjectId ?? 'global'}:{nav.activeProjectName}</span>
      <button data-testid="goto-master" onClick={() => nav.navigate('master')}>master</button>
      <button data-testid="set-project" onClick={() => nav.setActiveProject('p-7', 'Ops')}>set</button>
    </div>
  );
}

// ── mocked views (module factories run lazily — imports are initialized by
// then, so the jsx-runtime reference inside is safe) ──────────────────────
vi.mock('../views/CoreExecDashboard', () => ({
  CoreExecDashboard: () => <NavProbe />,
}));
vi.mock('../views/UnifiedMasterDashboard', () => ({
  UnifiedMasterDashboard: ({ onNavigate }: { onNavigate?: (view: string) => void }) => (
    <div data-testid="view-master">
      <button data-testid="master-to-basevault" onClick={() => onNavigate?.('basevault')}>go</button>
    </div>
  ),
}));
vi.mock('../views/BaseVaultDashboard', () => ({
  BaseVaultDashboard: () => <div data-testid="view-basevault" />,
}));
vi.mock('../views/CerebroDashboard', () => ({
  CerebroDashboard: () => <div data-testid="view-cerebro" />,
}));
vi.mock('../views/RouteSwitchDashboard', () => ({
  RouteSwitchDashboard: () => <div data-testid="view-routeswitch" />,
}));
vi.mock('../views/PortGridDashboard', () => ({
  PortGridDashboard: () => <div data-testid="view-portgrid" />,
}));
vi.mock('../views/ScopeLogicDashboard', () => ({
  ScopeLogicDashboard: () => <div data-testid="view-scopelogic" />,
}));
vi.mock('../views/ScoutDaemonDashboard', () => ({
  ScoutDaemonDashboard: () => <div data-testid="view-scoutdaemon" />,
}));
vi.mock('../components/CerebroChatbot', () => ({
  CerebroChatbot: () => <div data-testid="chatbot" />,
}));

const PROJECT_KEY = 'ns-active-project';

describe('OSLayout navigation shell (jsdom, Phase F-5)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders the default view (coreexec) with a context probe + the global chatbot', async () => {
    render(<OSLayout />);
    // findBy (not getBy): with F-3 lazy boundaries the first view resolves in
    // a microtask — asserting via findBy keeps this harness valid post-lazy.
    expect((await screen.findByTestId('active-view')).textContent).toBe('coreexec');
    expect(screen.getByTestId('chatbot')).not.toBeNull();
    cleanup();
  });

  it('NavigationContext drives view switching in both directions', async () => {
    render(<OSLayout />);
    await screen.findByTestId('active-view');

    fireEvent.click(screen.getByTestId('goto-master'));
    expect(await screen.findByTestId('view-master')).not.toBeNull();
    expect(screen.queryByTestId('active-view')).toBeNull(); // probe unmounted with coreexec

    fireEvent.click(screen.getByTestId('master-to-basevault'));
    expect(await screen.findByTestId('view-basevault')).not.toBeNull();
    cleanup();
  });

  it('restores the active project from localStorage on boot', async () => {
    localStorage.setItem(PROJECT_KEY, JSON.stringify({ id: 'p-42', name: 'Deliverable' }));
    render(<OSLayout />);
    await screen.findByTestId('active-view');
    expect(screen.getByTestId('active-project').textContent).toBe('p-42:Deliverable');
    cleanup();
  });

  it('persists a project selection through setActiveProject', async () => {
    render(<OSLayout />);
    await screen.findByTestId('active-view');
    expect(screen.getByTestId('active-project').textContent).toBe('global:Global');

    fireEvent.click(screen.getByTestId('set-project'));
    expect(screen.getByTestId('active-project').textContent).toBe('p-7:Ops');
    expect(JSON.parse(localStorage.getItem(PROJECT_KEY) as string)).toEqual({ id: 'p-7', name: 'Ops' });
    cleanup();
  });

  it('survives a corrupted localStorage entry (falls back to Global)', async () => {
    localStorage.setItem(PROJECT_KEY, 'not-json{');
    render(<OSLayout />);
    await screen.findByTestId('active-view');
    expect(screen.getByTestId('active-project').textContent).toBe('global:Global');
    cleanup();
  });
});
