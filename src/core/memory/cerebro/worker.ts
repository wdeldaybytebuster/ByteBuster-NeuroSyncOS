import { ThreadWorker } from 'poolifier';
import { runReflectionSweep, CerebroWorkerInput } from './reflection-sweep';

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
        try {
          await runReflectionSweep(input);
          return { status: 'success', message: 'Reflection cycle and sweep completed successfully' };
        } catch (err: any) {
          console.error('[CerebroWorker] Failed during reflection cycle', err);
          return { status: 'error', error: err.message };
        }
      }
    });
  }
}

export default new CerebroWorker();
