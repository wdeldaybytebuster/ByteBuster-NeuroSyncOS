import { db } from './db.js';

export interface WriteTask {
  type: 'WRITE';
  sql: string;
  params: any[];
}

/**
 * Executes a write task sequentially on the main thread.
 * This ensures no SQLITE_BUSY deadlocks occur from concurrent worker mutations.
 */
export async function executeWriteTask(task: WriteTask): Promise<any> {
  return new Promise((resolve, reject) => {
    try {
      const stmt = db.prepare(task.sql);
      const result = stmt.run(...task.params);
      resolve(result);
    } catch (error) {
      reject(error);
    }
  });
}
