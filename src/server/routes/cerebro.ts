import { Hono } from 'hono';
import { db } from '../../core/basevault/db';
import { CerebroVectorStore } from '../../core/memory/cerebro/vector';
import { ReflectionExecutor } from '../../core/memory/cerebro/reflection';
import { log } from '../../core/observability/logger';
import { computeDecayFactor, DEFAULT_DECAY_RATE, DEFAULT_ACCESS_BOOST } from '../../core/memory/cerebro/habituation';

// Reads the user-configurable decay-rate / access-boost multipliers from
// system_settings (CerebroDashboard's "Habituation Scoring Algorithms"
// sliders — cerebro_decay_multiplier / cerebro_access_boost). These were
// previously saved but never consumed anywhere; this helper is the single
// place that reads them back out, falling back to the same defaults
// HabituationScorer uses when unset or not a valid number.
function getDecaySettings(): { decayRate: number; accessBoost: number } {
  const rows = db
    .prepare(`SELECT key, value FROM system_settings WHERE key IN ('cerebro_decay_multiplier', 'cerebro_access_boost')`)
    .all() as { key: string; value: string }[];

  let decayRate = DEFAULT_DECAY_RATE;
  let accessBoost = DEFAULT_ACCESS_BOOST;

  for (const row of rows) {
    const n = Number(row.value);
    if (!Number.isFinite(n)) continue;
    if (row.key === 'cerebro_decay_multiplier') decayRate = n;
    if (row.key === 'cerebro_access_boost') accessBoost = n;
  }

  return { decayRate, accessBoost };
}

export const cerebroRouter = new Hono();

// §3.1 — Cerebro Health: vector count, last reflection timestamp, derived status.
cerebroRouter.get('/health', (c) => {
  try {
    const vectorCountRow = db
      .prepare('SELECT COUNT(*) AS n FROM cerebro_memories_meta')
      .get() as { n: number } | undefined;
    const lastTouchRow = db
      .prepare('SELECT MAX(last_accessed_at) AS ts FROM cerebro_memories_meta')
      .get() as { ts: number | null } | undefined;

    const vectorCount = vectorCountRow?.n ?? 0;
    const lastReflection = lastTouchRow?.ts ?? null;
    const now = Date.now();

    // Derive status from idleness. Empty store is 'cold' (still nominal — read-only baseline).
    let status: 'cold' | 'nominal' | 'stale' | 'warning' = 'cold';
    if (lastReflection != null) {
      const ageMs = now - lastReflection;
      if (ageMs < 60 * 60 * 1000) status = 'nominal';        // touched within 1h
      else if (ageMs < 24 * 60 * 60 * 1000) status = 'stale'; // 1h–24h
      else status = 'warning';                                // >24h
    }

    return c.json({ success: true, vectorCount, lastReflection, status, now });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// Execute raw SQL query (Admin / Explorer)
cerebroRouter.post('/query', async (c) => {
  try {
    const { query } = await c.req.json();
    if (!query) return c.json({ success: false, error: 'No query provided' }, 400);

    const stmt = db.prepare(query);
    const results = stmt.all();

    return c.json({ success: true, data: results });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 400);
  }
});

// Trigger asynchronous Reflection Cycle
cerebroRouter.post('/habituate', async (c) => {
  try {
    // Run reflection asynchronously
    setTimeout(() => ReflectionExecutor.runReflectionCycle().catch(log.error), 0);
    return c.json({ success: true, message: 'Reflection cycle initiated' });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// Vector Search — routes through CerebroVectorStore keyword/semantic search.
// When a real embedding pipeline is wired (Phase 8+), VectorStore will use
// the float[1536] path automatically; for now it operates in keyword-fallback
// mode which is fully functional for free-tier testing.
cerebroRouter.post('/vector-search', async (c) => {
  try {
    const { query, projectId } = await c.req.json();
    if (!query) return c.json({ success: false, error: 'No query provided' }, 400);

    const results = CerebroVectorStore.search(query, undefined, undefined, 3, projectId);

    return c.json({
      success: true,
      results: results.length
        ? results
        : [{ id: 'no-match', text: 'No semantic matches found. Keyword fallback returned empty.', distance: 1.0 }],
    });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// GET learning approvals queue
cerebroRouter.get('/learning-approvals', (c) => {
  try {
    const queue = db.prepare(`
      SELECT id, fact, confidence, status, source_run_id, created_at, conflict_with_id, conflict_reasoning
      FROM cerebro_learning_approvals
      WHERE status = 'pending'
      ORDER BY created_at ASC
    `).all();
    return c.json({ success: true, queue });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// Approve a learning fact
cerebroRouter.post('/learning-approvals/:id/approve', async (c) => {
  try {
    const id = c.req.param('id');
    const approval = db.prepare('SELECT * FROM cerebro_learning_approvals WHERE id = ?').get(id) as any;

    if (!approval) return c.json({ success: false, error: 'Not found' }, 404);

    // If this approval was flagged as conflicting with (updating/contradicting)
    // an existing memory, the new fact SUPERSEDES the old one: delete the old
    // row from both cerebro_memories_meta and cerebro_memories_vec (mirrors the
    // two-table delete pattern used by prune-confirm above) before inserting
    // the new fact, rather than leaving both sitting side-by-side.
    const memId = crypto.randomUUID();
    const approve = db.transaction(() => {
      if (approval.conflict_with_id) {
        db.prepare('DELETE FROM cerebro_memories_meta WHERE id = ?').run(approval.conflict_with_id);
        db.prepare('DELETE FROM cerebro_memories_vec WHERE id = ?').run(approval.conflict_with_id);
      }

      db.prepare(`
        INSERT INTO cerebro_memories_meta (id, content, type, last_accessed_at, access_count, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(memId, approval.fact, 'fact', Date.now(), 0, Date.now());

      // Mark as approved
      db.prepare(`UPDATE cerebro_learning_approvals SET status = 'approved' WHERE id = ?`).run(id);
    });
    approve();

    return c.json({ success: true, message: 'Fact approved and stored in memory.' });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// Reject a learning fact
cerebroRouter.post('/learning-approvals/:id/reject', (c) => {
  try {
    const id = c.req.param('id');
    db.prepare(`UPDATE cerebro_learning_approvals SET status = 'rejected' WHERE id = ?`).run(id);
    return c.json({ success: true, message: 'Fact rejected.' });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// Decay stats — real "Nearing Decay" count for the Habituation Decay widget,
// replacing its hardcoded 0. Mirrors HabituationScorer.rank's decay term
// (src/core/memory/cerebro/habituation.ts: decayFactor = e^-(daysSinceAccess*0.3))
// applied per-row against cerebro_memories_meta.last_accessed_at. A memory
// "nearing decay" is one whose decayFactor has fallen below 0.1 (~7.7+ days
// since last access), independent of the boost/similarity terms rank() also
// applies (those rank search results; this just measures raw idleness).
cerebroRouter.get('/decay-stats', (c) => {
  try {
    const NEARING_DECAY_THRESHOLD = 0.1;
    const rows = db.prepare('SELECT last_accessed_at FROM cerebro_memories_meta').all() as { last_accessed_at: number }[];
    const now = Date.now();
    const { decayRate } = getDecaySettings();

    let nearingDecay = 0;
    for (const row of rows) {
      const daysSinceAccess = Math.max(0, (now - row.last_accessed_at) / (1000 * 60 * 60 * 24));
      const decayFactor = computeDecayFactor(daysSinceAccess, decayRate);
      if (decayFactor < NEARING_DECAY_THRESHOLD) nearingDecay++;
    }

    return c.json({ success: true, nearingDecay, total: rows.length, threshold: NEARING_DECAY_THRESHOLD });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// ─── Pruning ────────────────────────────────────────────────────────────────
// Conservative by design: manual trigger only, never a silent background
// auto-delete. Preview (dry run) and confirm (destructive) MUST use identical
// selection logic — both recompute server-side from the same threshold so the
// UI can never show one set and delete a different one (no TOCTOU / no
// client-supplied id list is trusted). A memory only becomes prune-eligible
// once it is already "nearing decay" by the /decay-stats definition, so the
// default threshold is the SAME 0.1 the decay-stats widget uses — we do not
// introduce a second, divergent threshold.
const PRUNE_DECAY_THRESHOLD = 0.1;

// Shared selection: returns memories whose decayFactor has fallen below the
// given threshold, using the exact same decay formula as /decay-stats
// (decayFactor = e^-(daysSinceAccess * 0.3)). Content is truncated for display.
function selectPruneCandidates(threshold: number) {
  const rows = db
    .prepare('SELECT id, content, last_accessed_at FROM cerebro_memories_meta')
    .all() as { id: string; content: string; last_accessed_at: number }[];
  const now = Date.now();
  const { decayRate } = getDecaySettings();

  const candidates: {
    id: string;
    content: string;
    decayFactor: number;
    daysSinceAccess: number;
  }[] = [];

  for (const row of rows) {
    const daysSinceAccess = Math.max(0, (now - row.last_accessed_at) / (1000 * 60 * 60 * 24));
    const decayFactor = computeDecayFactor(daysSinceAccess, decayRate);
    if (decayFactor < threshold) {
      candidates.push({
        id: row.id,
        content: (row.content ?? '').length > 80 ? row.content.slice(0, 80) + '…' : (row.content ?? ''),
        decayFactor,
        daysSinceAccess: Math.round(daysSinceAccess * 10) / 10,
      });
    }
  }

  return candidates;
}

// Parse an optional threshold query/body param, falling back to the shared
// default. Guards against NaN / out-of-range values so preview and confirm
// stay consistent.
function resolveThreshold(raw: unknown): number {
  const n = typeof raw === 'string' ? parseFloat(raw) : typeof raw === 'number' ? raw : NaN;
  if (!Number.isFinite(n) || n <= 0 || n > 1) return PRUNE_DECAY_THRESHOLD;
  return n;
}

// Prune preview — DRY RUN, no deletion. Returns the actual candidate list so
// the UI can show the user exactly what would be removed before they confirm.
cerebroRouter.get('/prune-preview', (c) => {
  try {
    const threshold = resolveThreshold(c.req.query('threshold'));
    const candidates = selectPruneCandidates(threshold);
    return c.json({ success: true, candidates, count: candidates.length, threshold });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// Prune confirm — DESTRUCTIVE. Recomputes the candidate set server-side from
// the same threshold (does NOT trust a client id list), deletes matching rows
// from BOTH cerebro_memories_meta AND cerebro_memories_vec (they share id), and
// logs the real count to cerebro_prune_log. All in a single transaction.
cerebroRouter.post('/prune-confirm', async (c) => {
  try {
    // Threshold may arrive as a query param or a JSON body param; both must
    // match what the preview showed the user.
    let bodyThreshold: unknown;
    try {
      const body = await c.req.json();
      bodyThreshold = body?.threshold;
    } catch {
      // No/invalid body is fine — fall through to query param / default.
    }
    const threshold = resolveThreshold(c.req.query('threshold') ?? bodyThreshold);

    const candidates = selectPruneCandidates(threshold);

    const prune = db.transaction((ids: string[]) => {
      const delMeta = db.prepare('DELETE FROM cerebro_memories_meta WHERE id = ?');
      const delVec = db.prepare('DELETE FROM cerebro_memories_vec WHERE id = ?');
      for (const id of ids) {
        delMeta.run(id);
        delVec.run(id);
      }
      db.prepare('INSERT INTO cerebro_prune_log (id, pruned_at, count) VALUES (?, ?, ?)').run(
        crypto.randomUUID(),
        Date.now(),
        ids.length
      );
    });

    prune(candidates.map((m) => m.id));

    return c.json({ success: true, pruned: candidates.length, threshold });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// Prune history — real rolling 30-day sum of pruned memories, replacing the
// hardcoded "Pruned (30d): 0" counter. Defaults to 0 when nothing pruned.
cerebroRouter.get('/prune-history', (c) => {
  try {
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const row = db
      .prepare('SELECT SUM(count) AS total FROM cerebro_prune_log WHERE pruned_at >= ?')
      .get(thirtyDaysAgo) as { total: number | null } | undefined;
    return c.json({ success: true, pruned30d: row?.total ?? 0 });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// Pin high-confidence memories — resets last_accessed_at to now for all memories with access_count > threshold
cerebroRouter.post('/pin-high-confidence', (c) => {
  try {
    const threshold = 3; // memories accessed 3+ times are considered high-confidence
    const now = Date.now();
    const result = db.prepare('UPDATE cerebro_memories_meta SET last_accessed_at = ? WHERE access_count >= ?').run(now, threshold);
    return c.json({ success: true, message: `Pinned ${result.changes} high-confidence memories.`, pinned: result.changes });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// CEREBRO CHAT — Floating assistant endpoint
// Routes user questions through the LLM with system context about NeuroSync
// ═══════════════════════════════════════════════════════════════════════════════

import { RouteSwitchEngine } from '../../core/routeswitch/engine';
import { routeQuery } from '../../core/memory/context-router';

let chatEngine: RouteSwitchEngine | null = null;
export function injectChatEngine(engine: RouteSwitchEngine) { chatEngine = engine; }

const CEREBRO_SYSTEM_PROMPT = `You are Cerebro, the intelligent assistant for NeuroSync Sovereign OS. You help users navigate the system and answer questions about how to use it.

SYSTEM MODULES:
- CoreExec: Workflow orchestration engine. DAG task runner with retries and scheduling. Go here for: running workflows, viewing task status, setting up cron schedules.
- RouteSwitch: LLM provider management. Go here for: adding LLM providers (OpenAI, local GGUF), setting fallback chains, configuring defaults per scope (Global/Cerebro/Project/Agent), managing API keys, cost limits.
- ScopeLogic: Requirements interview engine. Go here for: starting a new workflow proposal via a guided interview, generating DAG blueprints.
- PortGrid: Skills hub and approval gateway. Go here for: reviewing workflow proposals visually before execution, managing tool permissions, approving/rejecting staged workflows.
- BaseVault: Database management. Go here for: viewing stored workflow runs, backup/restore, schema migrations, redaction settings, retention policies.
- ScoutDaemon: Background foresight engine. Go here for: hardware monitoring, idle-detection, predictive early termination settings, kill switch.
- Cerebro: Long-term memory and learning. Go here for: memory search, reflection cycles, learning approvals.

NAVIGATION COMMANDS:
When the user asks how to do something, tell them which module to go to and whether it's in the Dashboard view (operational/monitoring) or Set-up view (configuration). Use format: "Navigate to [MODULE] → [Dashboard/Set-up]" to guide them.

COMMON TASKS:
- Add an LLM provider: RouteSwitch → Set-up → Provider Registry → Add Provider
- Set fallback order: RouteSwitch → Set-up → Default & Fallback Chain → select scope → order providers
- Create a new project: Right sidebar (click sidebar icon) → + New Workspace
- Start a workflow interview: ScopeLogic → Dashboard → type in the interview chat
- Approve a proposal: PortGrid → Dashboard → review the visual flowchart → Approve
- Check workflow status: CoreExec → Dashboard → select a run
- Set up cron scheduling: CoreExec → Set-up → Workflow Cron Scheduler
- Backup database: BaseVault → Set-up → Sovereign Portability → Execute Live Backup
- Configure redaction: BaseVault → Set-up → Zero-Trust Redaction Engine

Keep answers concise and actionable. If the user asks something you can't help with, say so honestly.`;

cerebroRouter.post('/chat', async (c) => {
  try {
    const { message, history, projectId } = await c.req.json();
    if (!message) return c.json({ success: false, error: 'message is required' }, 400);

    if (!chatEngine) {
      return c.json({ success: false, error: 'Chat engine not initialized' }, 500);
    }

    // Tri-Modal Context Router: pick which knowledge source(s) to consult based
    // on the question's intent, and prepend any retrieved context to the prompt.
    // (OKF is injected downstream by RouteSwitchEngine, so the 'okf' branch adds
    // no block here — see context-router.ts for the rationale.)
    let routedContextBlock = '';
    try {
      const routed = await routeQuery(message, projectId);
      routedContextBlock = routed.map((r) => r.contextBlock).filter(Boolean).join('\n');
      log.info(
        '[CerebroChat] context router →',
        routed.map((r) => r.source).join(', '),
        routedContextBlock ? `(+${routedContextBlock.length} chars)` : '(no extra block)'
      );
    } catch (err: any) {
      // Context routing is best-effort — never block the chat response.
      log.warn('[CerebroChat] context routing failed (non-fatal):', err?.message);
    }

    // Build prompt with conversation history for context
    const historyContext = (history || []).slice(-6).map((m: any) =>
      `${m.role === 'user' ? 'User' : 'Cerebro'}: ${m.text}`
    ).join('\n');

    const fullPrompt = `${CEREBRO_SYSTEM_PROMPT}\n\n${routedContextBlock ? `${routedContextBlock}\n` : ''}${historyContext ? `CONVERSATION HISTORY:\n${historyContext}\n\n` : ''}User: ${message}\n\nCerebro:`;

    const result = await chatEngine.execute({
      prompt: fullPrompt,
      estimatedTokens: 300,
      scope: 'cerebro',
      ...(projectId !== undefined ? { projectId } : {}),
    });

    // Extract navigation hints from the response
    const navMatch = result.content.match(/Navigate to (\w+)/i);
    const suggestedNav = navMatch ? navMatch[1]!.toLowerCase() : null;

    return c.json({
      success: true,
      reply: result.content,
      suggestedNavigation: suggestedNav,
      provider: result.provider,
    });
  } catch (err: any) {
    // Graceful fallback for when LLM is not configured
    return c.json({
      success: true,
      reply: "I'm currently running in offline mode without an active LLM provider. To enable me, go to RouteSwitch → Set-up → Provider Registry and add an LLM provider, then set up a routing rule for the Cerebro scope.",
      suggestedNavigation: 'routeswitch',
      provider: 'fallback',
    });
  }
});
