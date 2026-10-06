import { Worker } from 'worker_threads';
import fs from 'fs';
import path from 'path';

const WORKER_BUNDLE = 'gitnexus-worker.js';

export class GitNexusParser {
  private worker: Worker | null = null;

  async parseCodebase(sourceCode: string): Promise<any[]> {
    return new Promise((resolve, reject) => {
      // NOTE: experimentalRawTransfer is strictly disabled.
      
      const isTypeScriptSource = path.extname(__filename) === '.ts';
      const workerOptions: any = {};
      let workerPath: string;

      if (isTypeScriptSource) {
        // Development/test source path. Keep existing ts-node support when a
        // caller runs the source tree directly.
        workerPath = path.resolve(__dirname, 'gitnexus-worker.ts');
        workerOptions.execArgv = ['--require', 'ts-node/register'];
      } else {
        // Packaged sidecar: worker_threads needs a real filesystem path, not
        // pkg's virtual /snapshot/ filesystem. The Tauri host provides the
        // resource directory; fall back to an adjacent bundled worker for
        // non-Tauri compiled layouts.
        const resourceDir = process.env.NEUROSYNC_RESOURCE_DIR;
        const stagedWorker = resourceDir && resourceDir.length > 0
          ? path.join(resourceDir, 'resources', 'bin', WORKER_BUNDLE)
          : undefined;
        const adjacentWorker = path.resolve(__dirname, WORKER_BUNDLE);

        workerPath = stagedWorker && fs.existsSync(stagedWorker)
          ? stagedWorker
          : adjacentWorker;
      }

      this.worker = new Worker(workerPath, workerOptions);

      const allSymbols: any[] = [];

      this.worker.on('message', (msg) => {
        if (msg.type === 'CHUNK') {
          allSymbols.push(...msg.payload);
        } else if (msg.type === 'DONE') {
          this.worker?.terminate();
          resolve(allSymbols);
        } else if (msg.type === 'ERROR') {
          this.worker?.terminate();
          reject(new Error(msg.payload));
        }
      });

      this.worker.on('error', (err) => {
        reject(err);
      });

      this.worker.on('exit', (code) => {
        if (code !== 0) {
          reject(new Error(`Worker stopped with exit code ${code}`));
        }
      });

      this.worker.postMessage({ type: 'PARSE', sourceCode });
    });
  }
}
