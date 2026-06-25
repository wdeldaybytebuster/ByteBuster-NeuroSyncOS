import { DynamicThreadPool } from 'poolifier';
import * as os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

// Provide __dirname equivalent in ESM if needed, or stick to __dirname if CommonJS.
// Assuming Node.js environment. We'll use standard __dirname since tsx/ts-node usually resolves it.
// If using ESM:
// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);

const cores = os.cpus().length;
export const safeMaxThreads = Math.max(1, cores - 1);

// We assume we are running via tsx or compiled to js
const workerFile = path.extname(__filename) === '.ts' 
  ? path.join(__dirname, 'worker.ts')
  : path.join(__dirname, 'worker.js');

export const workerPool = new DynamicThreadPool(
  1, // Min workers
  safeMaxThreads, // Max workers
  workerFile,
  {
    workerOptions: {
      execArgv: process.env.NODE_ENV === 'production' ? [] : ['--import', 'tsx']
    },
    errorHandler: (e) => console.error('[CoreExec] Worker Pool Error:', e),
    onlineHandler: () => console.log(`[CoreExec] Worker pool initialized with safe limit: ${safeMaxThreads}`),
  }
);
