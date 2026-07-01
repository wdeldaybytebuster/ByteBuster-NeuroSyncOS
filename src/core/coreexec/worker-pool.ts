import { DynamicThreadPool } from 'poolifier';
import * as os from 'os';
import path from 'path';

const cores = os.cpus().length;
export const safeMaxThreads = Math.max(1, cores - 1);

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
    // Already running from compiled JS (no separate backend build exists
    // today, but keep this branch for a future real production build).
    return path.join(__dirname, 'worker.js');
  }

  // eslint-disable-next-line @typescript-eslint/no-var-requires
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
