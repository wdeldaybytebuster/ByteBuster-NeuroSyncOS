/**
 * §3.0 — ScoutDaemon Incremental Filesystem Watcher (Axiom 3: Zero-Friction Sync).
 *
 * Uses chokidar (inotify-backed on Linux) to detect file changes inside active
 * project roots and trigger incremental OKF re-indexing for ONLY the changed
 * file — not a full project scan.
 *
 * HARDWARE CONSTRAINT COMPLIANCE:
 * - `usePolling: false` — uses kernel inotify, zero libuv threadpool cost.
 * - `awaitWriteFinish` with 800ms stabilityThreshold debounces rapid saves.
 * - `depth: 6` limits recursion to prevent stack pressure on eMMC I/O.
 * - One watcher instance per project. A global registry prevents duplicate
 *   watchers from accumulating on repeated project activations.
 * - `persistent: false` so the watcher does NOT prevent the Node.js process
 *   from exiting cleanly (important for earlyoom-safe shutdown on OOM events).
 *
 * MODULE BOUNDARY:
 * This module ONLY observes and emits scout SSE events. It NEVER calls
 * CoreExec, modifies BaseVault directly, or takes any autonomous action.
 * All OKF indexing side-effects are fire-and-forget async helpers that
 * write only to the scout_okf_nodes staging table (draft status), not
 * directly to okf_nodes.
 */

import chokidar, { FSWatcher } from 'chokidar';
import path from 'path';
import { scoutEmitter } from './sse';
import { log } from '../observability/logger';
import { queueForIndexing } from './idle';

// Global registry: projectId → active FSWatcher.
const activeWatchers = new Map<string, FSWatcher>();

/** File extensions eligible for incremental OKF indexing. */
const WATCHED_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.md', '.mdx', '.json']);

/**
 * Per-project debounce map.
 * Coalesces rapid saves into a single indexing call. 800ms absorbs
 * editor "save on every keystroke" behaviour without eMMC write bursts.
 */
const debounceMap = new Map<string, NodeJS.Timeout>();
const DEBOUNCE_MS = 800;

/**
 * Start a chokidar watcher for the given project root.
 * Idempotent: a second call for the same projectId is a no-op.
 */
export function startWatcher(projectId: string, rootPath: string): void {
  if (activeWatchers.has(projectId)) {
    log.info(`[ScoutDaemon:Watcher] Watcher already active for project ${projectId}. Skipping.`);
    return;
  }

  log.info(`[ScoutDaemon:Watcher] Starting watcher for project ${projectId} at ${rootPath}`);

  const watcher = chokidar.watch(rootPath, {
    usePolling: false,
    awaitWriteFinish: { stabilityThreshold: DEBOUNCE_MS, pollInterval: 100 },
    depth: 6,
    persistent: false,
    ignored: [
      /(^|[/\\])\../,
      /node_modules/,
      /\.git/,
      /dist\//,
      /\.data\//,
      /\.gitnexus\//,
    ],
    ignoreInitial: true,
  });

  const handleChange = (filePath: string) => {
    const ext = path.extname(filePath);
    if (!WATCHED_EXTENSIONS.has(ext)) return;
    const existing = debounceMap.get(filePath);
    if (existing) clearTimeout(existing);
    debounceMap.set(
      filePath,
      setTimeout(() => {
        debounceMap.delete(filePath);
        queueForIndexing(filePath);
      }, DEBOUNCE_MS),
    );
  };

  watcher
    .on('change', handleChange)
    .on('add', handleChange)
    .on('error', (err) => log.error(`[ScoutDaemon:Watcher] chokidar error for ${projectId}:`, err));

  activeWatchers.set(projectId, watcher);
  scoutEmitter.emit('update', {
    type: 'WATCHER_STARTED',
    projectId,
    rootPath,
    timestamp: Date.now(),
  });
}

/** Stop the watcher for a specific project. */
export async function stopWatcher(projectId: string): Promise<void> {
  const watcher = activeWatchers.get(projectId);
  if (!watcher) return;
  await watcher.close();
  activeWatchers.delete(projectId);
  log.info(`[ScoutDaemon:Watcher] Stopped watcher for project ${projectId}.`);
  scoutEmitter.emit('update', { type: 'WATCHER_STOPPED', projectId, timestamp: Date.now() });
}

/** Stop all active watchers. Called from server shutdown hook. */
export async function stopAllWatchers(): Promise<void> {
  const ids = [...activeWatchers.keys()];
  await Promise.all(ids.map(stopWatcher));
  log.info(`[ScoutDaemon:Watcher] All watchers stopped.`);
}
