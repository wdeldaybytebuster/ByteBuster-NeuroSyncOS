import { ThreadWorker } from 'poolifier';
import { runReflectionSweep, CerebroWorkerInput } from './reflection-sweep';
// §5 / Phase F-6 — the worker side of the write channel: ops route to the
// main-thread single-writer sink for this task's duration, released in the
// finally below (closing the far end settles the main-side drain).
import { configureWriteClient, releaseWriteClient } from '../../basevault/write-queue';

export interface CerebroWorkerOutput {
  status: 'success' | 'error';
  message?: string;
  error?: string;
}

class CerebroWorker extends ThreadWorker<CerebroWorkerInput, CerebroWorkerOutput> {
  public constructor() {
    super({
      execute: async (input) => {
        if (!input) return { status: 'error', error: 'No input provided' };
        const hasWritePort = !!input.writePort;
        if (input.writePort) configureWriteClient(input.writePort);
        try {
          await runReflectionSweep(input);
          return { status: 'success', message: 'Reflection cycle and sweep completed successfully' };
        } catch (err: any) {
          console.error('[CerebroWorker] Failed during reflection cycle', err);
          return { status: 'error', error: err.message };
        } finally {
          if (hasWritePort) releaseWriteClient();
        }
      }
    });
  }
}

export default new CerebroWorker();
