/**
 * ScoutDaemon's "Sensory Modality" selector (ScoutDaemonDashboard's Set-up
 * view, Control B) used to be three independent checkboxes that were saved
 * to system_settings (scout_sse_enabled / scout_polling_enabled /
 * scout_manual_mode) but never read back by anything — the dashboard's own
 * telemetry widget always opened a bare `EventSource('/api/system/metrics')`
 * regardless of what was saved, and the three checkboxes could all be
 * checked (or unchecked) at once despite the setting being conceptually a
 * single choice.
 *
 * This module is the real, testable decision logic behind the fix:
 *   - a single `SensoryMode` setting ('sse' | 'polling' | 'manual') replaces
 *     the three independent booleans (still persisted under one
 *     system_settings key, `scout_sensory_mode`, via the existing generic
 *     POST/GET /api/system/settings routes — see ScoutDaemonDashboard.tsx);
 *   - `startTelemetrySubscription` is the one place that decides HOW the
 *     dashboard receives telemetry updates for a given mode. It takes its
 *     I/O (opening an EventSource, fetching a snapshot, a timer) as injected
 *     dependencies so this file has zero DOM/browser dependency and can be
 *     unit-tested directly (see scoutTelemetry.test.ts) even though this
 *     codebase has no React/DOM test harness.
 *
 * Mode semantics:
 *   - 'sse'     — exactly today's behavior: one open EventSource, pushed to
 *                 by the server every ~3s. No polling, no manual gating.
 *   - 'polling' — no EventSource is opened at all; a periodic timer calls
 *                 the plain-GET /api/system/metrics/snapshot endpoint
 *                 instead (added in system.ts alongside this fix — the SSE
 *                 stream had no polling-compatible plain-GET equivalent
 *                 before now).
 *   - 'manual'  — no EventSource, no timer. Telemetry only updates when the
 *                 caller explicitly invokes the returned `refreshNow()`.
 */

export type SensoryMode = 'sse' | 'polling' | 'manual';

const VALID_MODES: readonly SensoryMode[] = ['sse', 'polling', 'manual'];

/** Coerces an arbitrary settings value into a known mode, defaulting to
 * 'sse' — the pre-existing (and only) real behavior before this setting
 * did anything, so an unset/corrupt setting can never silently stop
 * telemetry from updating. */
export function normalizeSensoryMode(value: unknown): SensoryMode {
  return (VALID_MODES as readonly unknown[]).includes(value) ? (value as SensoryMode) : 'sse';
}

/** Minimal EventSource surface this module needs — satisfied by the real
 * DOM EventSource, and trivially fakeable in tests. */
export interface TelemetryEventSourceLike {
  addEventListener(event: 'telemetry', cb: (evt: { data: string }) => void): void;
  close(): void;
}

export interface TelemetrySubscriptionDeps {
  /** Opens the SSE connection. Only called in 'sse' mode. */
  openEventSource: () => TelemetryEventSourceLike;
  /** Fetches one telemetry snapshot (GET /api/system/metrics/snapshot). Called
   * repeatedly in 'polling' mode, and once per `refreshNow()` call in any mode. */
  fetchSnapshot: () => Promise<unknown>;
  /** Invoked with each new telemetry payload (parsed SSE `data`, or a raw
   * snapshot object) as it becomes available. */
  onUpdate: (data: any) => void;
  /** Polling cadence in ms. Defaults to 5000. Only used in 'polling' mode. */
  pollIntervalMs?: number;
  /** Injectable timer, defaulting to the real globals — overridden by tests
   * using vi.useFakeTimers() would otherwise still work, but this also lets
   * a caller with NO fake-timer support supply its own. */
  setIntervalFn?: typeof setInterval;
  clearIntervalFn?: typeof clearInterval;
}

export interface TelemetrySubscription {
  /** Stops whatever automatic mechanism (EventSource/timer) is active. */
  stop: () => void;
  /** Fetches one snapshot immediately and feeds it through onUpdate — the
   * "manual" mode's explicit trigger, but also usable in any mode as an
   * on-demand refresh. */
  refreshNow: () => Promise<void>;
}

/**
 * Starts (or deliberately doesn't start) an automatic telemetry feed for the
 * given mode. Returns a handle to stop it and/or trigger a manual refresh.
 *
 * 'sse': opens the EventSource once; onUpdate fires on each 'telemetry' event.
 * 'polling': no EventSource; onUpdate fires every pollIntervalMs via fetchSnapshot.
 * 'manual': nothing automatic happens — stop() is a no-op and refreshNow() is
 *           the only way onUpdate ever fires.
 */
export function startTelemetrySubscription(
  mode: SensoryMode,
  deps: TelemetrySubscriptionDeps,
): TelemetrySubscription {
  const setIntervalFn = deps.setIntervalFn ?? setInterval;
  const clearIntervalFn = deps.clearIntervalFn ?? clearInterval;

  const refreshNow = async () => {
    const snapshot = await deps.fetchSnapshot();
    deps.onUpdate(snapshot);
  };

  if (mode === 'sse') {
    const es = deps.openEventSource();
    es.addEventListener('telemetry', (evt) => {
      try {
        deps.onUpdate(JSON.parse(evt.data));
      } catch {
        // malformed SSE payload — ignore, matches the pre-existing
        // try/catch-and-drop behavior in ScoutDaemonDashboard's old inline handler.
      }
    });
    return { stop: () => es.close(), refreshNow };
  }

  if (mode === 'polling') {
    const intervalMs = deps.pollIntervalMs ?? 5000;
    const id = setIntervalFn(() => {
      refreshNow().catch(() => {});
    }, intervalMs);
    return { stop: () => clearIntervalFn(id), refreshNow };
  }

  // 'manual' — no automatic mechanism at all.
  return { stop: () => {}, refreshNow };
}
