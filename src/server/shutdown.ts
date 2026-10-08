/**
 * P2-2 — centralized graceful shutdown: the SINGLE owner of SIGINT/SIGTERM.
 *
 * Previously every module owned a slice of teardown (notably
 * terminal-session.ts's own SIGINT/SIGTERM + process.exit racers). Now:
 * this module owns the signal handlers, the drain flag, the stop order,
 * the WAL checkpoint, and the one process.exit. terminal-session.ts keeps
 * ONLY session disposal (disposeAllTerminalSessions, called from here) and
 * its synchronous 'exit'-event last resort.
 *
 * Stop order:
 *   1. drain (new HTTP work → 503 via shutdownDrainingMiddleware)
 *   2. stop producers of new work (heartbeat, idle, reflection, scheduler, mdns)
 *   3. drop the network surface (closeAllConnections, then server.close)
 *   4. release transports, pools, terminals
 *      (gitnexus parse workers are short-lived and self-terminating —
 *      see scoutdaemon/parser.ts — so there is no persistent handle; the
 *      stopGitnexusWorker slot exists if one is ever introduced)
 *   5. WAL checkpoint TRUNCATE, then db.close
 *   6. single exit (re-entrant signals collapse into the in-flight run)
 *
 * Every stop is best-effort (try/catch + continue) so one stuck module can
 * never veto the rest of teardown. A single unref'd force-exit watchdog
 * bounds the whole sequence; it never outlives the process.
 */
import type { MiddlewareHandler } from 'hono';
import { db } from '../core/basevault/db';
import { disposeAllTerminalSessions } from '../core/portgrid/terminal-session';

let draining = false;
let shutdownStarted = false;
let handlersInstalled = false;

/** True once gracefulShutdown has begun — new work must be refused. */
export function isDraining(): boolean {
  return draining;
}

/** Test seam: reset module flags (production never calls this). */
export function _resetShutdownForTests(): void {
  draining = false;
  shutdownStarted = false;
  handlersInstalled = false;
}

/**
 * Hono middleware: 503 while draining. server-main mounts this FIRST so it
 * preempts routes, rate-limit bookkeeping, and auth during teardown.
 */
export const shutdownDrainingMiddleware: MiddlewareHandler = async (c, next) => {
  if (draining) {
    return c.json({ error: 'Server is shutting down' }, 503);
  }
  await next();
};

/** Minimal http.Server surface shutdown needs (real server satisfies this). */
export interface ShutdownServer {
  close(cb?: (err?: Error) => void): void;
  closeAllConnections?(): void;
}

export interface ShutdownHandles {
  server?: ShutdownServer;
  stopHeartbeat?: () => void | Promise<void>;
  stopMdns?: () => void | Promise<void>;
  stopTransport?: () => void | Promise<void>;
  stopIdle?: () => void | Promise<void>;
  stopReflection?: () => void | Promise<void>;
  stopScheduler?: () => void | Promise<void>;
  stopGitnexusWorker?: () => void | Promise<void>;
  stopWorkerPool?: () => void | Promise<void>;
  /** WAL checkpoint TRUNCATE + db.close. Defaults to the BaseVault db. */
  checkpointAndCloseDb?: () => void | Promise<void>;
}

export interface ShutdownOptions {
  exitCode?: number;
  /** Injected for tests so they never kill the runner. Defaults to process.exit. */
  exit?: (code: number) => void;
  /** Bound for the whole sequence before forced exit. Defaults to 10 s. */
  forceExitMs?: number;
}

function defaultCheckpointAndCloseDb(): void {
  try {
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  } catch (err) {
    console.error('[Shutdown] WAL checkpoint failed (continuing):', err);
  }
  try {
    db.close();
  } catch (err) {
    console.error('[Shutdown] db.close failed (continuing):', err);
  }
}

async function settle(name: string, fn?: () => void | Promise<void>): Promise<void> {
  if (!fn) return;
  try {
    await fn();
  } catch (err) {
    console.error(`[Shutdown] ${name} stop failed (continuing):`, err);
  }
}

export async function gracefulShutdown(
  handles: ShutdownHandles = {},
  opts: ShutdownOptions = {},
): Promise<void> {
  // Single exit: a second signal while the first run is in flight collapses
  // here instead of racing it to process.exit.
  if (shutdownStarted) return;
  shutdownStarted = true;
  draining = true;

  const exitCode = opts.exitCode ?? 0;
  const exitFn = opts.exit ?? process.exit;
  const forceTimer = setTimeout(() => {
    try {
      exitFn(1);
    } catch { /* exiting anyway */ }
  }, opts.forceExitMs ?? 10_000);
  (forceTimer as unknown as { unref?: () => void })?.unref?.();

  try {
    console.log('[Shutdown] Draining — new requests receive 503.');

    // 1. Stop producers of new work (timers first — Axiom 6).
    await settle('heartbeat', handles.stopHeartbeat);
    await settle('idle-detector', handles.stopIdle);
    await settle('reflection-daemon', handles.stopReflection);
    await settle('scheduler', handles.stopScheduler);
    await settle('mdns-discovery', handles.stopMdns);

    // 2. Drop the network surface: idle sockets first so server.close can
    // finish instead of waiting out keep-alives.
    if (handles.server) {
      try {
        handles.server.closeAllConnections?.();
      } catch (err) {
        console.error('[Shutdown] closeAllConnections failed (continuing):', err);
      }
      await new Promise<void>((resolve) => {
        try {
          handles.server!.close(() => resolve());
        } catch (err) {
          console.error('[Shutdown] server.close threw (continuing):', err);
          resolve();
        }
      });
    }

    // 3. Release transports, pools, and interactive sessions.
    await settle('transport', handles.stopTransport);
    await settle('gitnexus-worker', handles.stopGitnexusWorker);
    await settle('worker-pool', handles.stopWorkerPool);
    try {
      await disposeAllTerminalSessions();
    } catch (err) {
      console.error('[Shutdown] terminal sessions dispose failed (continuing):', err);
    }

    // 4. Single-writer shutdown: checkpoint WAL back into the db file, then close.
    try {
      await (handles.checkpointAndCloseDb ?? defaultCheckpointAndCloseDb)();
    } catch (err) {
      console.error('[Shutdown] checkpoint+close failed (continuing):', err);
    }
  } finally {
    clearTimeout(forceTimer);
    try {
      exitFn(exitCode);
    } catch { /* exiting anyway */ }
  }
}

/**
 * Install the process signal handlers exactly once. The ONLY place SIGINT /
 * SIGTERM are handled process-wide — terminal-session.ts must not add its own.
 */
export function installShutdownHandlers(handles: ShutdownHandles): void {
  if (handlersInstalled) return;
  handlersInstalled = true;
  const run = (): void => {
    void gracefulShutdown(handles);
  };
  process.on('SIGINT', run);
  process.on('SIGTERM', run);
}
