import { Worker } from 'worker_threads';
import path from 'path';

export class GitNexusParser {
  private worker: Worker | null = null;

  async parseCodebase(sourceCode: string): Promise<any[]> {
    return new Promise((resolve, reject) => {
      // NOTE: experimentalRawTransfer is strictly disabled.
      
      // Determine the extension to use (ts or js)
      const workerExt = __filename.endsWith('.ts') ? '.ts' : '.js';
      const workerPath = path.resolve(__dirname, `gitnexus-worker${workerExt}`);
      
      const workerOptions: any = {};
      
      // If we are running in a ts-node or similar environment for .ts files
      if (workerExt === '.ts') {
        workerOptions.execArgv = ['--require', 'ts-node/register'];
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
