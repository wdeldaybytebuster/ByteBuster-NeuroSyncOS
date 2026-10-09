import { DynamicThreadPool } from 'poolifier';
import * as os from 'os';
import fs from 'fs';
import path from 'path';

// Name of the worker bundle produced by scripts/build-sidecar.js.
const WORKER_BUNDLE = 'worker.js';

const cores = os.cpus().length;
// Hard-cap the worker pool at 2 to strictly prevent OOM crashing on 8-core/6GB RAM devices
// since two separate pools (CoreExec + Cerebro) run simultaneously.
export const safeMaxThreads = 2;

/**
 * Resolve the JS file poolifier's DynamicThreadPool should spawn as a worker.
 *
 * Worker threads used to be pointed straight at `worker.ts`, relying on
 * `workerOptions.execArgv: ['--import', 'tsx']` to let tsx transpile it
 * inside the spawned thread. That's unreliable across Node versions: on
 * Node 22.18+, tsx's ESM loader hook races Node's own native TypeScript
 * type-stripping specifically inside worker_threads (the main thread is
 * fine either way) — see tracked issue #3 for the full diagnostic trail of
 * fixes attempted and why each one failed (SyntaxError, then
 * ERR_MODULE_NOT_FOUND, then ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX on
 * `sandbox.ts`'s constructor parameter properties, then
 * ERR_UNKNOWN_FILE_EXTENSION). None of those are real fixes; they just
 * relocate the same tsx-in-a-worker-thread problem.
 *
 * The fix: sidestep worker-thread TS loading entirely. Synchronously
 * bundle `worker.ts` and its local (non-npm) dependency tree into one
 * dependency-free, already-plain-JS CommonJS file with esbuild (a real
 * TypeScript compiler, not a type-stripper — handles constructor parameter
 * properties and everything else fine) the moment this module is first
 * imported, and point the pool at that instead. `execArgv` can then be `[]`
 * — the spawned thread never needs to know TypeScript existed.
 *
 * npm packages (better-sqlite3, etc.) are deliberately left external
 * (`packages: 'external'`) rather than bundled, so native addons keep
 * resolving normally via node_modules and aren't touched by the bundler.
 *
 * The compiled file is written next to `worker.ts` (not to a tmp dir) so
 * `__dirname`-relative lookups inside the bundled code (e.g.
 * `scraping.ts`'s `path.resolve(__dirname, './python_scripts/scraper.py')`)
 * still resolve to `src/core/coreexec/`, exactly as before bundling —
 * after bundling, `__dirname` refers to wherever the one output file
 * physically lives, not each original source file's location.
 */
function resolveWorkerFile(): string {
  if (path.extname(__filename) !== '.ts') {
    // Running from compiled JS (the packaged sidecar). Prefer the worker
    // bundle staged as a real Tauri resource: worker_threads and poolifier need
    // a physical filesystem path, not pkg's virtual /snapshot/ path. The host
    // sets NEUROSYNC_RESOURCE_DIR in src-tauri/src/lib.rs.
    const resourceDir = process.env.NEUROSYNC_RESOURCE_DIR;
    if (resourceDir && resourceDir.length > 0) {
      const stagedBundle = path.join(resourceDir, 'resources', 'bin', WORKER_BUNDLE);
      if (fs.existsSync(stagedBundle)) {
        return stagedBundle;
      }
    }

    // Fallback to the adjacent bundle in the pkg snapshot. This keeps local
    // packaged probes and future runtimes without an external resource layout
    // working when pkg's worker-thread integration supports that path.
    const snapshotBundle = path.join(__dirname, WORKER_BUNDLE);
    if (fs.existsSync(snapshotBundle)) {
      return snapshotBundle;
    }

    // Return the expected snapshot location so poolifier's error names the
    // path we actually looked for.
    return snapshotBundle;
  }

  // Bundled at runtime by esbuild — a CommonJS require on purpose: the pool
  // module is itself CJS-loaded from the .generated.cjs bundle context, and
  // esbuild's buildSync API is only consumed here.
  const esbuild = require('esbuild') as typeof import('esbuild');
  const outfile = path.join(__dirname, 'worker.generated.cjs');

  esbuild.buildSync({
    entryPoints: [path.join(__dirname, 'worker.ts')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: `node${process.versions.node.split('.')[0]}`,
    packages: 'external',
    sourcemap: 'inline',
    logLevel: 'silent',
  });

  return outfile;
}

const workerFile = resolveWorkerFile();

export const workerPool = new DynamicThreadPool(
  1, // Min workers
  safeMaxThreads, // Max workers
  workerFile,
  {
    workerOptions: {
      // No tsx/TS loading needed anymore — the pointed-to file is already
      // plain, pre-bundled JS regardless of Node version. See
      // resolveWorkerFile()'s doc comment above.
      execArgv: [],
    },
    errorHandler: (e) => console.error('[CoreExec] Worker Pool Error:', e),
    onlineHandler: () => console.log(`[CoreExec] Worker pool initialized with safe limit: ${safeMaxThreads}`),
  }
);
