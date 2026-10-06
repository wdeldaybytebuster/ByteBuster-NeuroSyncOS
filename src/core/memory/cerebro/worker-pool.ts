import { DynamicThreadPool } from 'poolifier';
import * as os from 'os';
import fs from 'fs';
import path from 'path';

// Name of the worker bundle produced by scripts/build-sidecar.js. Cerebro uses
// its own name so it cannot collide with the CoreExec worker, which previously
// resolved to the same `worker.js` path.
const WORKER_BUNDLE = 'worker-cerebro.js';

const cores = os.cpus().length;
// Hard-cap the worker pool at 2 to strictly prevent OOM crashing on 8-core/6GB RAM devices
// since two separate pools (CoreExec + Cerebro) run simultaneously.
export const safeMaxThreads = 2;

function resolveWorkerFile(): string {
  if (path.extname(__filename) !== '.ts') {
    // Packaged: prefer the bundle shipped in the pkg snapshot beside the server
    // bundle, then a copy staged as a real Tauri bundle resource (see
    // resolveWorkerFile in src/core/coreexec/worker-pool.ts for the rationale).
    const snapshotBundle = path.join(__dirname, WORKER_BUNDLE);
    if (fs.existsSync(snapshotBundle)) {
      return snapshotBundle;
    }

    const resourceDir = process.env.NEUROSYNC_RESOURCE_DIR;
    if (resourceDir && resourceDir.length > 0) {
      const stagedBundle = path.join(resourceDir, 'resources', 'bin', WORKER_BUNDLE);
      if (fs.existsSync(stagedBundle)) {
        return stagedBundle;
      }
    }

    return snapshotBundle;
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

export const cerebroWorkerPool = new DynamicThreadPool(
  1,
  safeMaxThreads,
  workerFile,
  {
    workerOptions: {
      execArgv: [],
    },
    errorHandler: (e) => console.error('[Cerebro] Worker Pool Error:', e),
    onlineHandler: () => console.log(`[Cerebro] Worker pool initialized with safe limit: ${safeMaxThreads}`),
  }
);
