import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { isMainThread } from 'worker_threads';

import type { Database as BetterSqlite3Database } from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';

// Resolve database directory in local workspace (.data)
//
// Tests must NEVER touch the real dev/user database — Vitest sets
// `process.env.VITEST` automatically, so under test we use a private
// in-memory database instead. Without this, running the test suite while
// the dev server is running would delete real registered providers,
// routing rules, and projects (several tests do unscoped `DELETE FROM
// projects` / `tasks` / `workflow_runs` as cleanup) — live-observed
// 2026-07-03, wiped a user's provider registry twice mid-session.
const isTestEnv = !!process.env.VITEST;
const dataDir = path.join(process.cwd(), '.data');
if (!isTestEnv && !fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

export const dbPath = isTestEnv ? ':memory:' : path.join(dataDir, 'neurosync.db');

// Instantiate better-sqlite3 database
export const db: BetterSqlite3Database = new Database(dbPath, { 
  verbose: isMainThread && process.env.NODE_ENV === 'development' ? console.log : undefined 
});

// Load Vector Search Extension
sqliteVec.load(db);

// Enforce Write-Ahead Logging (WAL) for concurrent reads/writes and performance
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

// Schema Initialization Function
export function initDB() {
  if (!isMainThread && process.env.NODE_ENV !== 'test') return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      workspace_path TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workflows (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      dag_template TEXT NOT NULL,
      cron_schedule TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS workflow_runs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      dag_layout TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      status TEXT NOT NULL,
      claim_lease INTEGER,
      output_data TEXT,
      FOREIGN KEY(run_id) REFERENCES workflow_runs(id) ON DELETE CASCADE
    );
    
    CREATE TABLE IF NOT EXISTS os_todos (
      id TEXT PRIMARY KEY,
      dag_node_id TEXT NOT NULL,
      severity TEXT NOT NULL,
      escalation_reason TEXT NOT NULL,
      required_action_type TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY(dag_node_id) REFERENCES tasks(id) ON DELETE CASCADE
    );

    -- Optimize task querying by status and run_id
    CREATE INDEX IF NOT EXISTS idx_tasks_run_id_status ON tasks(run_id, status);

    -- Cerebro Memory Tables
    -- project_id NULL = GLOBAL/USER-tier memory (visible everywhere); set = PROJECT-tier
    -- (visible only to that project), mirroring the tier convention on okf_nodes.
    CREATE TABLE IF NOT EXISTS cerebro_memories_meta (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      type TEXT NOT NULL,
      project_id TEXT,
      last_accessed_at INTEGER NOT NULL,
      access_count INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS cerebro_memories_vec USING vec0(
      id TEXT PRIMARY KEY,
      embedding float[1536]
    );

    CREATE TABLE IF NOT EXISTS cerebro_learning_approvals (
      id TEXT PRIMARY KEY,
      fact TEXT NOT NULL,
      confidence REAL NOT NULL,
      status TEXT NOT NULL,
      source_run_id TEXT,
      created_at INTEGER NOT NULL
    );

    -- Cerebro prune history: one row per manual prune action. Powers the
    -- "Pruned (30d)" counter (SUM(count) over the last 30 days). Pruning is
    -- manual-trigger only (never a silent background auto-delete) since it
    -- permanently removes user memory rows from cerebro_memories_meta/_vec.
    CREATE TABLE IF NOT EXISTS cerebro_prune_log (
      id TEXT PRIMARY KEY,
      pruned_at INTEGER NOT NULL,
      count INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    -- ScopeLogic DAG proposals awaiting human approval (System B).
    -- Previously crammed as a single JSON blob into system_settings under the
    -- fixed key 'pending_proposal' with no confidence, no project scoping, and
    -- no audit trail. This real table lets a staged proposal be confidence-gated
    -- (Deference UI, 0.70 threshold) and surfaced in the SAME PortGrid approval
    -- queue as os_todos. project_id is nullable (proposals staged under a
    -- "Global"/no-active-project scope are legitimate). No FK on project_id:
    -- proposal history should survive project deletion for audit, and staging
    -- must not fail if the id doesn't (yet) resolve to a projects row.
    CREATE TABLE IF NOT EXISTS dag_proposals (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      proposal TEXT NOT NULL,
      confidence REAL NOT NULL DEFAULT 0.5,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_dag_proposals_status ON dag_proposals(status, created_at);

    CREATE TABLE IF NOT EXISTS model_benchmarks (
      model_id TEXT PRIMARY KEY,
      avg_latency_ms REAL,
      avg_tps REAL,
      failure_rate REAL,
      total_runs INTEGER
    );

    CREATE TABLE IF NOT EXISTS discovered_models (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      context_length INTEGER,
      pricing_prompt TEXT,
      pricing_completion TEXT,
      fetched_at INTEGER NOT NULL
    );

    -- LLM Provider Registry: named provider entries with encrypted API keys
    CREATE TABLE IF NOT EXISTS llm_providers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      config_json TEXT NOT NULL,
      api_key_encrypted TEXT,
      is_enabled INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    -- LLM Routing Rules: per-scope fallback chains
    CREATE TABLE IF NOT EXISTS llm_routing_rules (
      id TEXT PRIMARY KEY,
      scope TEXT NOT NULL,
      scope_id TEXT,
      provider_chain TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(scope, scope_id)
    );

    -- OKF Knowledge Graph: individual Markdown concept files indexed
    CREATE TABLE IF NOT EXISTS okf_nodes (
      id TEXT PRIMARY KEY,
      tier TEXT NOT NULL CHECK(tier IN ('GLOBAL', 'USER', 'PROJECT')),
      project_id TEXT,
      type TEXT NOT NULL,
      title TEXT,
      confidence REAL NOT NULL DEFAULT 1.0,
      content_hash TEXT,
      frontmatter_json TEXT,
      file_path TEXT UNIQUE NOT NULL,
      last_indexed_at INTEGER NOT NULL,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    -- OKF Edges: relationships between concept files (from Markdown links)
    CREATE TABLE IF NOT EXISTS okf_edges (
      source_node_id TEXT NOT NULL,
      target_node_id TEXT NOT NULL,
      relationship_type TEXT NOT NULL DEFAULT 'references',
      PRIMARY KEY (source_node_id, target_node_id),
      FOREIGN KEY (source_node_id) REFERENCES okf_nodes(id) ON DELETE CASCADE,
      FOREIGN KEY (target_node_id) REFERENCES okf_nodes(id) ON DELETE CASCADE
    );

    -- ScoutDaemon quarantined research (isolated from active knowledge graph)
    CREATE TABLE IF NOT EXISTS scout_okf_nodes (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      type TEXT NOT NULL,
      title TEXT,
      confidence REAL NOT NULL DEFAULT 0.5,
      content_hash TEXT,
      frontmatter_json TEXT,
      file_path TEXT UNIQUE NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'promoted', 'rejected')),
      created_at INTEGER NOT NULL,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE SET NULL
    );

    -- Indexes for graph traversal performance
    CREATE INDEX IF NOT EXISTS idx_okf_nodes_tier ON okf_nodes(tier, project_id);
    CREATE INDEX IF NOT EXISTS idx_okf_nodes_type ON okf_nodes(type);
    CREATE INDEX IF NOT EXISTS idx_okf_edges_source ON okf_edges(source_node_id);
    CREATE INDEX IF NOT EXISTS idx_okf_edges_target ON okf_edges(target_node_id);
    CREATE INDEX IF NOT EXISTS idx_scout_okf_status ON scout_okf_nodes(status);
    CREATE INDEX IF NOT EXISTS idx_cerebro_memories_project ON cerebro_memories_meta(project_id);
  `);

  try {
    db.exec(`ALTER TABLE projects ADD COLUMN workspace_path TEXT;`);
  } catch (e: any) {
    // Ignore error if column already exists
    if (!e.message.includes('duplicate column name')) {
      console.error('Error adding workspace_path column:', e);
    }
  }

  try {
    db.exec(`ALTER TABLE projects ADD COLUMN project_root_path TEXT;`);
  } catch (e: any) {
    if (!e.message.includes('duplicate column name')) {
      console.error('Error adding project_root_path column:', e);
    }
  }

  try {
    // Deference UI (0.70 threshold) — numeric confidence per pending approval.
    // Default 0.5 puts legacy/un-scored rows in the "needs a look" bucket
    // rather than silently qualifying them for bulk auto-approval.
    db.exec(`ALTER TABLE os_todos ADD COLUMN confidence REAL NOT NULL DEFAULT 0.5;`);
  } catch (e: any) {
    if (!e.message.includes('duplicate column name')) {
      console.error('Error adding confidence column to os_todos:', e);
    }
  }

  try {
    // Soft-delete for projects: archived_at is NULL for active projects.
    // There was previously no delete/archive path at all, so orphaned/test
    // project rows had no way to be cleaned up short of a raw DB edit.
    db.exec(`ALTER TABLE projects ADD COLUMN archived_at INTEGER;`);
  } catch (e: any) {
    if (!e.message.includes('duplicate column name')) {
      console.error('Error adding archived_at column to projects:', e);
    }
  }

  try {
    // Real "Orchestration Metrics" (CoreExecDashboard) needs a completion
    // timestamp to compute latency -- previously only created_at existed,
    // so run duration was uncomputable and the dashboard showed a fabricated
    // "42ms" string instead.
    db.exec(`ALTER TABLE workflow_runs ADD COLUMN completed_at INTEGER;`);
  } catch (e: any) {
    if (!e.message.includes('duplicate column name')) {
      console.error('Error adding completed_at column to workflow_runs:', e);
    }
  }

  try {
    // Free Mode Governor paid-provider lock: opt-in per-provider "this costs
    // real money" flag. DEFAULT 0 (free) for every row — including all existing
    // rows — is deliberate: nothing is silently reclassified by provider type.
    // The global lock (system_settings.free_mode_unlocked) only skips a provider
    // once a user explicitly marks it paid, so a currently-working free proxy
    // setup can never be blocked by shipping this migration.
    db.exec(`ALTER TABLE llm_providers ADD COLUMN is_paid_tier INTEGER NOT NULL DEFAULT 0;`);
  } catch (e: any) {
    if (!e.message.includes('duplicate column name')) {
      console.error('Error adding is_paid_tier column to llm_providers:', e);
    }
  }

  try {
    db.exec(`ALTER TABLE cerebro_memories_meta ADD COLUMN project_id TEXT;`);
  } catch (e: any) {
    if (!e.message.includes('duplicate column name')) {
      console.error('Error adding project_id column to cerebro_memories_meta:', e);
    }
  }

  try {
    // Reflexion contradiction-detection: when a newly-extracted fact is highly
    // similar (>0.85) to an existing memory but is classified as a genuine
    // update/contradiction (not a reworded duplicate), it is queued here for
    // human approval instead of being silently discarded or inserted alongside
    // a possibly-conflicting memory. NULL for ordinary (non-conflicting) approvals.
    db.exec(`ALTER TABLE cerebro_learning_approvals ADD COLUMN conflict_with_id TEXT;`);
  } catch (e: any) {
    if (!e.message.includes('duplicate column name')) {
      console.error('Error adding conflict_with_id column to cerebro_learning_approvals:', e);
    }
  }

  try {
    db.exec(`ALTER TABLE cerebro_learning_approvals ADD COLUMN conflict_reasoning TEXT;`);
  } catch (e: any) {
    if (!e.message.includes('duplicate column name')) {
      console.error('Error adding conflict_reasoning column to cerebro_learning_approvals:', e);
    }
  }

  try {
    // Explicit per-project repo mapping for the GitNexus code-structure modality —
    // lets resolveRepoForCall() disambiguate when more than one repo is indexed
    // on the machine, instead of giving up on the whole modality (gitnexus-client.ts).
    db.exec(`ALTER TABLE projects ADD COLUMN gitnexus_repo_name TEXT;`);
  } catch (e: any) {
    if (!e.message.includes('duplicate column name')) {
      console.error('Error adding gitnexus_repo_name column to projects:', e);
    }
  }

  // Per-project execution permission archetype (real enforcement, gated in
  // core/coreexec/worker.ts). Nullable with NO default: NULL means "no
  // archetype assigned — behave exactly as today, fully permissive". A
  // non-NULL value (e.g. 'code_execute' | 'research_only' | 'admin_operator')
  // opts the project into gating of the shell/scrape task actions.
  try {
    db.exec(`ALTER TABLE projects ADD COLUMN permission_archetype TEXT;`);
  } catch (e: any) {
    if (!e.message.includes('duplicate column name')) {
      console.error('Error adding permission_archetype column to projects:', e);
    }
  }

  migratePendingProposalBlob();
}

/**
 * One-time migration: an existing staged proposal used to live as a single JSON
 * blob in system_settings under the key 'pending_proposal'. Move any such blob
 * into the new dag_proposals table (default confidence 0.5, no project scope,
 * status 'pending') so it does NOT silently vanish for a user who has one
 * staged right now, then delete the old key. Idempotent: after the key is
 * cleared this is a no-op. Only handles the single-key case that exists today.
 */
export function migratePendingProposalBlob() {
  try {
    const legacy = db
      .prepare("SELECT value FROM system_settings WHERE key = 'pending_proposal'")
      .get() as { value: string } | undefined;
    if (!legacy) return;

    db.transaction(() => {
      db.prepare(
        'INSERT INTO dag_proposals (id, project_id, proposal, confidence, status, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      ).run(randomUUID(), null, legacy.value, 0.5, 'pending', Date.now());
      db.prepare("DELETE FROM system_settings WHERE key = 'pending_proposal'").run();
    })();
  } catch (e: any) {
    console.error('Error migrating legacy pending_proposal blob:', e);
  }
}
