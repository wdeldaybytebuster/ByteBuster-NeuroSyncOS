import { Hono } from 'hono';
import cron from 'node-cron';
import { CronExpressionParser } from 'cron-parser';
import { db } from '../../core/basevault/db';

export const schedulerListRouter = new Hono();

interface ScheduleRow {
  id: string;
  name: string;
  cron_schedule: string;
}

interface ScheduleJob {
  id: string;
  name: string;
  cron: string;
  nextTick: number | null; // epoch ms; null if invalid cron
}

/**
 * Compute the next tick for a cron expression using cron-parser 5.6.1+
 * (bundled types, MIT, robust handling of 5-field cron syntax incl. L, W, #).
 *
 * node-cron's ScheduledTask does NOT expose a public `nextDate()` method in
 * v4.5.0 (verified empirically via typeof probe.nextDate === 'undefined'),
 * so cron-parser is the source of truth for next-tick ETA in §3.1 Master
 * widgets. Shared `cron.validate` gate keeps acceptance consistent with
 * the live scheduler.ts refresh loop.
 *
 * Returns null for invalid cron expressions or any runtime failure.
 */
function probeNextTick(expr: string): number | null {
  if (!cron.validate(expr)) return null;
  try {
    const interval = CronExpressionParser.parse(expr, { currentDate: new Date() });
    const ms = interval.next().getTime();
    return Number.isFinite(ms) ? ms : null;
  } catch {
    // cron-parser is stricter than node-cron on edge cases (overlapping ranges,
    // invalid step values, exhausted iterations). Any parse/iteration error
    // resolves to null so the route stays well-formed.
    return null;
  }
}

schedulerListRouter.get('/jobs', (c) => {
  try {
    const rows = db
      .prepare(
        "SELECT id, name, cron_schedule FROM workflows WHERE cron_schedule IS NOT NULL ORDER BY created_at DESC"
      )
      .all() as ScheduleRow[];

    const now = Date.now();
    const jobs: ScheduleJob[] = rows.map((row) => {
      const nextTick = probeNextTick(row.cron_schedule);
      return {
        id: row.id,
        name: row.name,
        cron: row.cron_schedule,
        nextTick,
      };
    });

    return c.json({ success: true, count: jobs.length, now, jobs });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});
