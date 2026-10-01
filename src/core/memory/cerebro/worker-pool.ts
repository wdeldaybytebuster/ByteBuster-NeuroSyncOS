import { DynamicThreadPool } from 'poolifier';
import * as os from 'os';
import path from 'path';

const cores = os.cpus().length;
// Hard-cap the worker pool at 2 to prevent OOM crashing on 8-core/6GB RAM devices
// since two separate pools (CoreExec + Cerebro) run simultaneously.
export const safeMaxThreads = Math.min(2, Math.max(1, cores - 1));

function resolveWorkerFile(): string {
  if (path.extname(__filename) !== '.ts') {
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
