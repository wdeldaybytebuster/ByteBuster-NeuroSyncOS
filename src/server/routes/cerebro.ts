import { Hono } from 'hono';
import { db } from '../../core/basevault/db';
import { CerebroVectorStore } from '../../core/memory/cerebro/vector';
import { ReflectionExecutor } from '../../core/memory/cerebro/reflection';
import { log } from '../../core/observability/logger';

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
    const { query } = await c.req.json();
    if (!query) return c.json({ success: false, error: 'No query provided' }, 400);

    const results = CerebroVectorStore.search(query, undefined, undefined, 3);

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
      SELECT id, fact, confidence, status, source_run_id, created_at
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
    
    // Insert into cerebro_memories_meta
    const memId = crypto.randomUUID();
    db.prepare(`
      INSERT INTO cerebro_memories_meta (id, content, type, last_accessed_at, access_count, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(memId, approval.fact, 'fact', Date.now(), 0, Date.now());

    // Mark as approved
    db.prepare(`UPDATE cerebro_learning_approvals SET status = 'approved' WHERE id = ?`).run(id);

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
    const { message, history } = await c.req.json();
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
      const routed = await routeQuery(message);
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
