import { db } from '../basevault/db';

export class Benchmarker {
  public recordRun(modelId: string, latencyMs: number, tokens: number, isFailure: boolean): void {
    const stmt = db.prepare('SELECT * FROM model_benchmarks WHERE model_id = ?');
    const row = stmt.get(modelId) as { 
      model_id: string, 
      avg_latency_ms: number, 
      avg_tps: number, 
      failure_rate: number, 
      total_runs: number 
    } | undefined;

    const tps = latencyMs > 0 ? (tokens / (latencyMs / 1000)) : 0;
    const failVal = isFailure ? 1 : 0;

    if (!row) {
      const insert = db.prepare(`
        INSERT INTO model_benchmarks (model_id, avg_latency_ms, avg_tps, failure_rate, total_runs)
        VALUES (?, ?, ?, ?, 1)
      `);
      insert.run(modelId, latencyMs, tps, failVal);
    } else {
      const newTotal = row.total_runs + 1;
      const newAvgLatency = row.avg_latency_ms + (latencyMs - row.avg_latency_ms) / newTotal;
      const newAvgTps = row.avg_tps + (tps - row.avg_tps) / newTotal;
      const newFailureRate = row.failure_rate + (failVal - row.failure_rate) / newTotal;

      const update = db.prepare(`
        UPDATE model_benchmarks
        SET avg_latency_ms = ?, avg_tps = ?, failure_rate = ?, total_runs = ?
        WHERE model_id = ?
      `);
      update.run(newAvgLatency, newAvgTps, newFailureRate, newTotal, modelId);
    }
  }
}
