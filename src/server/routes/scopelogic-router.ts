import { Hono } from 'hono';
import path from 'path';
import fs from 'fs';
import { ScopeLogicSession, type GenerateFn } from '../../core/scopelogic/interview';

// ─── ScopeLogic Routes (extracted from server/index.ts) ──────────────────────
// Pulled into a proper Hono sub-router (matching every other route group in
// this codebase) so per-project session isolation is unit-testable the same way
// todos/coreexec/system routes already are.
//
// Per-project sessions: a single global ScopeLogicSession meant two browser
// tabs on two different projects silently shared and corrupted each other's
// interview state — inconsistent now that dag_proposals carries a real
// project_id. We key one session per project.
//
// Map key convention: the normalized project key is `projectId` when it is a
// non-empty string, else the sentinel '__global__' (no active project / "Global"
// scope). This matches how /proposals/stage treats a null projectId as the
// valid Global scope.
//
// Unbounded growth: a long-running server could accumulate one idle session per
// project ever interviewed. Sessions are lightweight in-memory objects (a few
// arrays + counters — no file handles, sockets, or DB connections), so this is
// low-risk, but we still cap the Map at MAX_SESSIONS with simple insertion-order
// LRU eviction rather than ignoring it: on overflow the least-recently-used key
// is evicted, and a re-visited project's interview would restart from scratch
// (acceptable — the durable artifact is the staged dag_proposals row, not the
// in-memory interview). 64 is comfortably above any realistic simultaneous
// project count for a local-first single-operator app.

export const scopelogicRouter = new Hono();

const GLOBAL_KEY = '__global__';
const MAX_SESSIONS = 64;

let generateFn: GenerateFn | undefined;

/** Injected from server/index.ts so the interview routes through the real LLM. */
export function injectScopeLogicGenerateFn(fn: GenerateFn): void {
  generateFn = fn;
}

const sessions = new Map<string, ScopeLogicSession>();

function normalizeKey(projectId: string | null | undefined): string {
  return typeof projectId === 'string' && projectId.trim() !== '' ? projectId : GLOBAL_KEY;
}

function getOrCreateSession(projectId: string | null | undefined): ScopeLogicSession {
  const key = normalizeKey(projectId);
  let session = sessions.get(key);
  if (!session) {
    session = new ScopeLogicSession(generateFn);
    sessions.set(key, session);
    // Insertion-order LRU: Map preserves insertion order, so the first key is
    // the least-recently-created/touched. Evict it when over the cap.
    if (sessions.size > MAX_SESSIONS) {
      const oldest = sessions.keys().next().value;
      if (oldest !== undefined && oldest !== key) sessions.delete(oldest);
    }
  } else {
    // Touch: re-insert to move this key to the most-recent (end) position.
    sessions.delete(key);
    sessions.set(key, session);
  }
  return session;
}

/**
 * Reset (or replace) ONLY the given project's session, leaving every other
 * project's in-flight interview untouched.
 */
function resetSession(projectId: string | null | undefined): void {
  const key = normalizeKey(projectId);
  sessions.set(key, new ScopeLogicSession(generateFn));
}

/** Test-only: wipe all in-memory sessions so suites start from a clean slate. */
export function __clearScopeLogicSessionsForTest(): void {
  sessions.clear();
}

scopelogicRouter.get('/history', (c) => {
  const projectId = c.req.query('projectId') ?? null;
  const session = getOrCreateSession(projectId);
  return c.json({
    round: session.round,
    isComplete: session.isComplete,
    history: session.getHistory(),
  });
});

scopelogicRouter.post('/prompt', async (c) => {
  try {
    const body = await c.req.json();
    const { message } = body;
    const projectId = body.projectId ?? body.project_id ?? null;
    if (!message) return c.json({ error: 'Message is required' }, 400);

    const session = getOrCreateSession(projectId);
    const result = await session.processUserInputAsync(message, projectId ?? undefined);
    return c.json(result);
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }
});

scopelogicRouter.post('/reset', async (c) => {
  // reset carries a body (mirroring /proposals/stage) so it targets exactly one
  // project's session. Tolerate a missing/empty body → resets the Global session.
  let projectId: string | null = null;
  try {
    const body = await c.req.json();
    projectId = body?.projectId ?? body?.project_id ?? null;
  } catch {
    projectId = null;
  }
  resetSession(projectId);
  return c.json({ success: true, message: 'Session reset. Ready for a new interview.' });
});

// There is no real prompt-versioning system (no version number, no CI-gated
// test count) -- SYSTEM_PROMPT in interview.ts is a plain string constant.
// This surfaces the one real, honest fact available: when that file was
// actually last modified on disk, replacing a fabricated "v3.2.1" / fake
// test-pass count that ScopeLogicDashboard used to show as if it were live.
scopelogicRouter.get('/prompt-info', (c) => {
  try {
    const interviewFilePath = path.join(process.cwd(), 'src/core/scopelogic/interview.ts');
    const stat = fs.statSync(interviewFilePath);
    return c.json({ lastModifiedMs: stat.mtimeMs });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});
