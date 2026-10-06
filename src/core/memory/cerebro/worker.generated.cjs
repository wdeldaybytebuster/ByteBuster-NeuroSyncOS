"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/core/memory/cerebro/worker.ts
var worker_exports = {};
__export(worker_exports, {
  default: () => worker_default
});
module.exports = __toCommonJS(worker_exports);
var import_poolifier = require("poolifier");

// src/core/basevault/db.ts
var import_better_sqlite3 = __toESM(require("better-sqlite3"));
var import_path = __toESM(require("path"));
var import_fs = __toESM(require("fs"));
var import_crypto = require("crypto");
var import_worker_threads = require("worker_threads");
var sqliteVec = __toESM(require("sqlite-vec"));
var isTestEnv = !!process.env.VITEST;
var dataDir = import_path.default.join(process.cwd(), ".data");
if (!isTestEnv && !import_fs.default.existsSync(dataDir)) {
  import_fs.default.mkdirSync(dataDir, { recursive: true });
}
var dbPath = isTestEnv ? ":memory:" : import_path.default.join(dataDir, "neurosync.db");
var db = new import_better_sqlite3.default(dbPath, {
  verbose: import_worker_threads.isMainThread && process.env.NODE_ENV === "development" ? console.log : void 0
});
sqliteVec.load(db);
db.pragma("journal_mode = WAL");
db.pragma("synchronous = NORMAL");
db.pragma("foreign_keys = ON");
db.pragma("busy_timeout = 5000");
db.function("sha256", (text) => (0, import_crypto.createHash)("sha256").update(text || "").digest("hex"));
function initDB() {
  if (!import_worker_threads.isMainThread && process.env.NODE_ENV !== "test") return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      workspace_path TEXT,
      project_root_path TEXT,
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
      track TEXT NOT NULL DEFAULT 'track2',
      created_at INTEGER NOT NULL,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      status TEXT NOT NULL,
      claim_lease INTEGER,
      output_data TEXT,
      retry_count INTEGER NOT NULL DEFAULT 0,
      started_at INTEGER,
      FOREIGN KEY(run_id) REFERENCES workflow_runs(id) ON DELETE CASCADE
    );
    
    CREATE TABLE IF NOT EXISTS os_todos (
      id TEXT PRIMARY KEY,
      dag_node_id TEXT,
      project_id TEXT,
      source_module TEXT NOT NULL DEFAULT 'CoreExec',
      context_payload TEXT,
      severity TEXT NOT NULL,
      escalation_reason TEXT NOT NULL,
      required_action_type TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      resolved_at INTEGER,
      resolved_by TEXT
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
      created_at INTEGER NOT NULL,
      source_tool TEXT
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS cerebro_memories_vec USING vec0(
      id TEXT PRIMARY KEY,
      embedding bit[1536]
    );

    CREATE TABLE IF NOT EXISTS memory_quarantine (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      type TEXT NOT NULL,
      project_id TEXT,
      last_accessed_at INTEGER NOT NULL,
      access_count INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      taint_flag INTEGER NOT NULL DEFAULT 1,
      source_tool TEXT
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS memory_quarantine_vec USING vec0(
      id TEXT PRIMARY KEY,
      embedding bit[1536]
    );

    CREATE TABLE IF NOT EXISTS memory_audit_log (
      id TEXT PRIMARY KEY,
      memory_id TEXT NOT NULL,
      action TEXT NOT NULL,
      previous_content TEXT,
      new_content TEXT,
      changed_at INTEGER NOT NULL,
      previous_hash TEXT
    );

    CREATE TRIGGER IF NOT EXISTS audit_memory_update 
    AFTER UPDATE ON cerebro_memories_meta
    BEGIN
      INSERT INTO memory_audit_log (id, memory_id, action, previous_content, new_content, changed_at, previous_hash)
      VALUES (
        lower(hex(randomblob(16))),
        NEW.id,
        'UPDATE',
        OLD.content,
        NEW.content,
        CAST((julianday('now') - 2440587.5)*86400000 AS INTEGER),
        (SELECT sha256(ifnull(previous_hash, '') || id || action || ifnull(previous_content, '') || ifnull(new_content, '') || changed_at) FROM memory_audit_log ORDER BY changed_at DESC LIMIT 1)
      );
    END;

    CREATE TRIGGER IF NOT EXISTS audit_memory_delete 
    AFTER DELETE ON cerebro_memories_meta
    BEGIN
      INSERT INTO memory_audit_log (id, memory_id, action, previous_content, new_content, changed_at, previous_hash)
      VALUES (
        lower(hex(randomblob(16))),
        OLD.id,
        'DELETE',
        OLD.content,
        NULL,
        CAST((julianday('now') - 2440587.5)*86400000 AS INTEGER),
        (SELECT sha256(ifnull(previous_hash, '') || id || action || ifnull(previous_content, '') || ifnull(new_content, '') || changed_at) FROM memory_audit_log ORDER BY changed_at DESC LIMIT 1)
      );
    END;


    CREATE TABLE IF NOT EXISTS cerebro_learning_approvals (
      id TEXT PRIMARY KEY,
      fact TEXT NOT NULL,
      confidence REAL NOT NULL,
      status TEXT NOT NULL,
      source_run_id TEXT,
      created_at INTEGER NOT NULL,
      source_tool TEXT
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

    -- Council Mode (RouteSwitch high-risk arbitration) computes a real
    -- confidence/disagreement signal from parallel provider calls, but every
    -- caller of RouteSwitchEngine.execute() previously discarded it \u2014 only
    -- result.content was ever read. This table is what makes that signal
    -- queryable/visible (persisted + logged + surfaced in the dashboard)
    -- instead of vanishing silently after being computed at real cost.
    CREATE TABLE IF NOT EXISTS council_decisions (
      id TEXT PRIMARY KEY,
      scope TEXT,
      scope_id TEXT,
      provider_count INTEGER NOT NULL,
      confidence REAL NOT NULL,
      disagreement_score REAL NOT NULL,
      chosen_response_length INTEGER NOT NULL,
      created_at INTEGER NOT NULL
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

    CREATE TABLE IF NOT EXISTS scout_symbols (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      file_path TEXT NOT NULL,
      symbol_type TEXT NOT NULL,
      symbol_name TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    -- \u2500\u2500 Axiom 6: Genesis Hardware Profile (Immutable Ledger) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
    -- Written ONCE by ScoutDaemon's hardware-profiler at first-run setup.
    -- 'tier' is the synthesized classification: constrained | standard | high-performance.
    -- Never modified after initial write; re-profiling inserts a new row with a
    -- new id \u2014 it never overwrites the historical record.
    CREATE TABLE IF NOT EXISTS hardware_profiles (
      id TEXT PRIMARY KEY,
      profiled_at INTEGER NOT NULL,
      cpu_cores INTEGER NOT NULL,
      cpu_physical_cores INTEGER NOT NULL,
      cpu_has_hyperthreading INTEGER NOT NULL DEFAULT 0,
      cpu_brand TEXT,
      ram_total_mb INTEGER NOT NULL,
      storage_type TEXT NOT NULL DEFAULT 'unknown',
      os_platform TEXT NOT NULL,
      os_distro TEXT,
      virtualization TEXT NOT NULL DEFAULT 'none',
      gpu_type TEXT NOT NULL DEFAULT 'none',
      gpu_vram_mb INTEGER NOT NULL DEFAULT 0,
      tier TEXT NOT NULL CHECK(tier IN ('constrained', 'standard', 'high-performance'))
    );

    -- \u2500\u2500 Axiom 6: Derived Environment Rules \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
    -- Key/value pairs synthesized from hardware_profiles by the profiler.
    -- CoreExec reads these at boot to inject taskset, thread caps, heap limits.
    -- RouteSwitch reads 'local_llm_enabled' before attempting local SLM calls.
    CREATE TABLE IF NOT EXISTS environment_rules (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL REFERENCES hardware_profiles(id) ON DELETE CASCADE,
      rule_key TEXT NOT NULL,
      rule_value TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_environment_rules_profile ON environment_rules(profile_id);

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
  } catch (e) {
    if (!e.message.includes("duplicate column name")) {
      console.error("Error adding workspace_path column:", e);
    }
  }
  try {
    db.exec(`ALTER TABLE projects ADD COLUMN project_root_path TEXT;`);
  } catch (e) {
    if (!e.message.includes("duplicate column name")) {
      console.error("Error adding project_root_path column:", e);
    }
  }
  try {
    db.exec(`ALTER TABLE os_todos ADD COLUMN confidence REAL NOT NULL DEFAULT 0.5;`);
  } catch (e) {
    if (!e.message.includes("duplicate column name")) {
      console.error("Error adding confidence column to os_todos:", e);
    }
  }
  try {
    db.exec(`ALTER TABLE projects ADD COLUMN archived_at INTEGER;`);
  } catch (e) {
    if (!e.message.includes("duplicate column name")) {
      console.error("Error adding archived_at column to projects:", e);
    }
  }
  try {
    db.exec(`ALTER TABLE workflow_runs ADD COLUMN completed_at INTEGER;`);
  } catch (e) {
    if (!e.message.includes("duplicate column name")) {
      console.error("Error adding completed_at column to workflow_runs:", e);
    }
  }
  try {
    db.exec(`ALTER TABLE llm_providers ADD COLUMN require_paid_tier INTEGER NOT NULL DEFAULT 0;`);
  } catch (e) {
    if (!e.message.includes("duplicate column name")) {
      console.error("Error adding require_paid_tier column to llm_providers:", e);
    }
  }
  try {
    db.exec(`ALTER TABLE cerebro_memories_meta ADD COLUMN source_tool TEXT;`);
  } catch (e) {
    if (!e.message.includes("duplicate column name")) {
      console.error("Error adding source_tool column to cerebro_memories_meta:", e);
    }
  }
  try {
    db.exec(`ALTER TABLE memory_quarantine ADD COLUMN source_tool TEXT;`);
  } catch (e) {
    if (!e.message.includes("duplicate column name")) {
      console.error("Error adding source_tool column to memory_quarantine:", e);
    }
  }
  try {
    db.exec(`ALTER TABLE llm_providers ADD COLUMN is_paid_tier INTEGER NOT NULL DEFAULT 0;`);
  } catch (e) {
    if (!e.message.includes("duplicate column name")) {
      console.error("Error adding is_paid_tier column to llm_providers:", e);
    }
  }
  try {
    db.exec(`ALTER TABLE cerebro_memories_meta ADD COLUMN project_id TEXT;`);
  } catch (e) {
    if (!e.message.includes("duplicate column name")) {
      console.error("Error adding project_id column to cerebro_memories_meta:", e);
    }
  }
  try {
    db.exec(`ALTER TABLE cerebro_learning_approvals ADD COLUMN conflict_with_id TEXT;`);
  } catch (e) {
    if (!e.message.includes("duplicate column name")) {
      console.error("Error adding conflict_with_id column to cerebro_learning_approvals:", e);
    }
  }
  try {
    db.exec(`ALTER TABLE cerebro_learning_approvals ADD COLUMN conflict_reasoning TEXT;`);
  } catch (e) {
    if (!e.message.includes("duplicate column name")) {
      console.error("Error adding conflict_reasoning column to cerebro_learning_approvals:", e);
    }
  }
  try {
    db.exec(`ALTER TABLE projects ADD COLUMN gitnexus_repo_name TEXT;`);
  } catch (e) {
    if (!e.message.includes("duplicate column name")) {
      console.error("Error adding gitnexus_repo_name column to projects:", e);
    }
  }
  try {
    db.exec(`ALTER TABLE projects ADD COLUMN permission_archetype TEXT;`);
  } catch (e) {
    if (!e.message.includes("duplicate column name")) {
      console.error("Error adding permission_archetype column to projects:", e);
    }
  }
  try {
    db.exec(`ALTER TABLE projects ADD COLUMN project_root_path TEXT;`);
  } catch (e) {
    if (!e.message.includes("duplicate column name")) {
      console.error("Error adding project_root_path column to projects:", e);
    }
  }
  try {
    db.exec(`ALTER TABLE workflow_runs ADD COLUMN track TEXT NOT NULL DEFAULT 'track2';`);
  } catch (e) {
    if (!e.message.includes("duplicate column name")) {
      console.error("Error adding track column to workflow_runs:", e);
    }
  }
  migratePendingProposalBlob();
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS context_events (
        id TEXT PRIMARY KEY,
        project_id TEXT,
        type TEXT NOT NULL,
        summary_text TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_context_events_project ON context_events(project_id, created_at DESC);
    `);
  } catch (e) {
    if (!e.message?.includes("already exists")) {
      console.error("[FIX-4] Error creating context_events table:", e);
    }
  }
  try {
    db.exec(`ALTER TABLE tasks ADD COLUMN node_type TEXT;`);
  } catch (e) {
    if (!e.message?.includes("duplicate column name")) {
      console.error("[FIX-3] Error adding node_type column to tasks:", e);
    }
  }
  try {
    db.exec(`ALTER TABLE cerebro_learning_approvals ADD COLUMN source_tool TEXT;`);
  } catch (e) {
    if (!e.message.includes("duplicate column name")) {
      console.error("Error adding source_tool column to cerebro_learning_approvals:", e);
    }
  }
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS sync_event_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        table_name TEXT NOT NULL,
        action TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        payload TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sync_lock (is_syncing INTEGER);
      INSERT OR IGNORE INTO sync_lock (rowid, is_syncing) VALUES (1, 0);

      DROP TRIGGER IF EXISTS sync_projects_insert;
      CREATE TRIGGER sync_projects_insert AFTER INSERT ON projects
      WHEN (SELECT is_syncing FROM sync_lock WHERE rowid = 1) = 0
      BEGIN
        INSERT INTO sync_event_log (table_name, action, timestamp, payload)
        VALUES ('projects', 'INSERT', CAST((julianday('now') - 2440587.5)*86400000 AS INTEGER), json_object('id', NEW.id, 'name', NEW.name, 'created_at', NEW.created_at));
      END;

      DROP TRIGGER IF EXISTS sync_projects_update;
      CREATE TRIGGER sync_projects_update AFTER UPDATE ON projects
      WHEN (SELECT is_syncing FROM sync_lock WHERE rowid = 1) = 0
      BEGIN
        INSERT INTO sync_event_log (table_name, action, timestamp, payload)
        VALUES ('projects', 'UPDATE', CAST((julianday('now') - 2440587.5)*86400000 AS INTEGER), json_object('id', NEW.id, 'name', NEW.name, 'created_at', NEW.created_at));
      END;

      DROP TRIGGER IF EXISTS sync_workflow_runs_insert;
      CREATE TRIGGER sync_workflow_runs_insert AFTER INSERT ON workflow_runs
      WHEN (SELECT is_syncing FROM sync_lock WHERE rowid = 1) = 0
      BEGIN
        INSERT INTO sync_event_log (table_name, action, timestamp, payload)
        VALUES ('workflow_runs', 'INSERT', CAST((julianday('now') - 2440587.5)*86400000 AS INTEGER), json_object('id', NEW.id, 'project_id', NEW.project_id, 'status', NEW.status));
      END;

      DROP TRIGGER IF EXISTS sync_workflow_runs_update;
      CREATE TRIGGER sync_workflow_runs_update AFTER UPDATE ON workflow_runs
      WHEN (SELECT is_syncing FROM sync_lock WHERE rowid = 1) = 0
      BEGIN
        INSERT INTO sync_event_log (table_name, action, timestamp, payload)
        VALUES ('workflow_runs', 'UPDATE', CAST((julianday('now') - 2440587.5)*86400000 AS INTEGER), json_object('id', NEW.id, 'project_id', NEW.project_id, 'status', NEW.status));
      END;

      DROP TRIGGER IF EXISTS sync_tasks_insert;
      CREATE TRIGGER sync_tasks_insert AFTER INSERT ON tasks
      WHEN (SELECT is_syncing FROM sync_lock WHERE rowid = 1) = 0
      BEGIN
        INSERT INTO sync_event_log (table_name, action, timestamp, payload)
        VALUES ('tasks', 'INSERT', CAST((julianday('now') - 2440587.5)*86400000 AS INTEGER), json_object('id', NEW.id, 'run_id', NEW.run_id, 'status', NEW.status));
      END;

      DROP TRIGGER IF EXISTS sync_tasks_update;
      CREATE TRIGGER sync_tasks_update AFTER UPDATE ON tasks
      WHEN (SELECT is_syncing FROM sync_lock WHERE rowid = 1) = 0
      BEGIN
        INSERT INTO sync_event_log (table_name, action, timestamp, payload)
        VALUES ('tasks', 'UPDATE', CAST((julianday('now') - 2440587.5)*86400000 AS INTEGER), json_object('id', NEW.id, 'run_id', NEW.run_id, 'status', NEW.status));
      END;
    `);
  } catch (e) {
    console.error("Error creating sync_event_log table:", e);
  }
  try {
    db.exec(`ALTER TABLE tasks ADD COLUMN started_at INTEGER;`);
  } catch (e) {
    if (!e.message.includes("duplicate column name")) {
      console.error("Error adding started_at column to tasks:", e);
    }
  }
}
function migratePendingProposalBlob() {
  try {
    const legacy = db.prepare("SELECT value FROM system_settings WHERE key = 'pending_proposal'").get();
    if (!legacy) return;
    db.transaction(() => {
      db.prepare(
        "INSERT INTO dag_proposals (id, project_id, proposal, confidence, status, created_at) VALUES (?, ?, ?, ?, ?, ?)"
      ).run((0, import_crypto.randomUUID)(), null, legacy.value, 0.5, "pending", Date.now());
      db.prepare("DELETE FROM system_settings WHERE key = 'pending_proposal'").run();
    })();
  } catch (e) {
    console.error("Error migrating legacy pending_proposal blob:", e);
  }
}

// src/core/memory/cerebro/vector.ts
var import_crypto2 = __toESM(require("crypto"));
var DEFAULT_KEYWORD_BASE = 0.7;
var DEFAULT_KEYWORD_BOOST = 0.05;
var KEYWORD_SETTINGS_CACHE_TTL_MS = 2e3;
var cachedKeywordBase = DEFAULT_KEYWORD_BASE;
var cachedKeywordBoost = DEFAULT_KEYWORD_BOOST;
var cachedKeywordSettingsAt = 0;
function getKeywordScoringSettings() {
  const now = Date.now();
  if (now - cachedKeywordSettingsAt > KEYWORD_SETTINGS_CACHE_TTL_MS) {
    cachedKeywordSettingsAt = now;
    try {
      const rows = db.prepare(
        `SELECT key, value FROM system_settings WHERE key IN ('cerebro_keyword_base', 'cerebro_keyword_boost')`
      ).all();
      let baseScore = DEFAULT_KEYWORD_BASE;
      let matchBoost = DEFAULT_KEYWORD_BOOST;
      for (const row of rows) {
        const n = Number(row.value);
        if (!Number.isFinite(n)) continue;
        if (row.key === "cerebro_keyword_base") baseScore = n;
        if (row.key === "cerebro_keyword_boost") matchBoost = n;
      }
      cachedKeywordBase = baseScore;
      cachedKeywordBoost = matchBoost;
    } catch {
      cachedKeywordBase = DEFAULT_KEYWORD_BASE;
      cachedKeywordBoost = DEFAULT_KEYWORD_BOOST;
    }
  }
  return { baseScore: cachedKeywordBase, matchBoost: cachedKeywordBoost };
}
var CerebroVectorStore = class {
  /**
   * Inserts a memory into the vector store.
   * If embedding is null, it relies entirely on the Keyword Fallback Engine for retrieval.
   * projectId null/undefined = GLOBAL/USER-tier memory, visible to every project.
   */
  static insert(content, type, embedding, projectId, isAutoIngested = false, sourceTool) {
    const id = import_crypto2.default.randomUUID();
    const now = Date.now();
    if (isAutoIngested) {
      db.prepare(`
        INSERT INTO memory_quarantine (id, content, type, project_id, last_accessed_at, access_count, created_at, taint_flag, source_tool)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, content, type, projectId ?? null, now, 0, now, 1, sourceTool ?? null);
      if (embedding) {
        db.prepare(`
          INSERT INTO memory_quarantine_vec (id, embedding)
          VALUES (?, vec_quantize_binary(?))
        `).run(id, embedding);
      }
    } else {
      db.prepare(`
        INSERT INTO cerebro_memories_meta (id, content, type, project_id, last_accessed_at, access_count, created_at, source_tool)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, content, type, projectId ?? null, now, 0, now, sourceTool ?? null);
      if (embedding) {
        db.prepare(`
          INSERT INTO cerebro_memories_vec (id, embedding)
          VALUES (?, vec_quantize_binary(?))
        `).run(id, embedding);
      }
    }
    return id;
  }
  /**
   * Searches the memory.
   * If queryEmbedding is not provided (offline local mode), it seamlessly degrades to the Keyword Fallback Engine.
   * When projectId is provided, results are scoped to that project's PROJECT-tier
   * memories plus untagged (GLOBAL/USER-tier) memories — never another project's.
   */
  static search(query, typeFilter, queryEmbedding, limit = 5, projectId) {
    if (queryEmbedding) {
      return this._vectorSearch(queryEmbedding, typeFilter, limit, projectId);
    } else {
      return this._keywordFallbackSearch(query, typeFilter, limit, projectId);
    }
  }
  static _vectorSearch(embedding, typeFilter, limit = 5, projectId) {
    const filterSQL = typeFilter ? `AND m.type = '${typeFilter}'` : "";
    const scopeSQL = projectId ? `AND (m.project_id = ? OR m.project_id IS NULL)` : "";
    const knnQuery = db.prepare(`
      SELECT m.id, m.content, m.type, m.project_id, m.last_accessed_at, m.access_count, m.created_at, v.distance
      FROM cerebro_memories_vec v
      JOIN cerebro_memories_meta m ON v.id = m.id
      WHERE v.embedding MATCH vec_quantize_binary(?) AND k = ?
      ${filterSQL}
      ${scopeSQL}
      ORDER BY v.distance ASC
    `);
    const params = [embedding, limit];
    if (projectId) params.push(projectId);
    const rows = knnQuery.all(...params);
    return rows.map((r) => ({
      id: r.id,
      content: r.content,
      type: r.type,
      project_id: r.project_id,
      last_accessed_at: r.last_accessed_at,
      access_count: r.access_count,
      created_at: r.created_at,
      similarity: Math.max(0, 1 - r.distance)
      // Normalize distance into similarity score
    }));
  }
  static _keywordFallbackSearch(query, typeFilter, limit = 5, projectId) {
    const { baseScore, matchBoost } = getKeywordScoringSettings();
    const queryTokens = query.toLowerCase().split(/\W+/).filter((t) => t.length > 3);
    const conditions = [];
    const params = [];
    if (typeFilter) {
      conditions.push("type = ?");
      params.push(typeFilter);
    }
    if (projectId) {
      conditions.push("(project_id = ? OR project_id IS NULL)");
      params.push(projectId);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const sql = `SELECT * FROM cerebro_memories_meta ${where}`;
    const allRecords = params.length > 0 ? db.prepare(sql).all(...params) : db.prepare(sql).all();
    const scoredRecords = allRecords.map((record) => {
      const contentTokens = record.content.toLowerCase().split(/\W+/).filter((t) => t.length > 3);
      let matchCount = 0;
      for (const qt of queryTokens) {
        if (contentTokens.includes(qt)) {
          matchCount++;
        }
      }
      const similarity = matchCount > 0 ? baseScore + matchCount * matchBoost : 0;
      return {
        ...record,
        similarity
      };
    });
    return scoredRecords.filter((r) => r.similarity > 0).sort((a, b) => b.similarity - a.similarity).slice(0, limit);
  }
};

// src/core/memory/cerebro/habituation.ts
var DEFAULT_DECAY_RATE = 0.3;
var DEFAULT_ACCESS_BOOST = 1.5;
function computeDecayFactor(daysSinceAccess, decayRate = DEFAULT_DECAY_RATE) {
  return Math.exp(-(daysSinceAccess * decayRate));
}
var HabituationScorer = class {
  /**
   * Applies the biological decay formula to rank memories:
   * R_final = R_semantic * (f_access * boostMultiplier) * e^(-(Δt * decayRate))
   *
   * @param records The initial semantic records (from vector or fallback search)
   * @param currentTime Current timestamp in ms (defaults to Date.now())
   * @param decayRate Δt multiplier in the decay exponent (defaults to DEFAULT_DECAY_RATE)
   * @param boostMultiplier Access-count boost multiplier (defaults to DEFAULT_ACCESS_BOOST)
   * @returns Re-ranked records sorted by R_final descending
   */
  static rank(records, currentTime = Date.now(), decayRate = DEFAULT_DECAY_RATE, boostMultiplier = DEFAULT_ACCESS_BOOST) {
    return records.map((record) => {
      const daysSinceAccess = Math.max(0, (currentTime - record.last_accessed_at) / (1e3 * 60 * 60 * 24));
      const f_access = Math.max(1, record.access_count);
      const r_semantic = record.similarity || 0.1;
      const decayFactor = computeDecayFactor(daysSinceAccess, decayRate);
      const boostFactor = f_access * boostMultiplier;
      const r_final = r_semantic * boostFactor * decayFactor;
      return {
        ...record,
        r_final
      };
    }).sort((a, b) => b.r_final - a.r_final);
  }
};

// src/core/memory/cerebro/reflection-sweep.ts
var import_crypto3 = __toESM(require("crypto"));
async function runReflectionSweep(input) {
  initDB();
  if (input.extractedFacts) {
    for (const fact of input.extractedFacts) {
      const existing = CerebroVectorStore.search(fact, "preference", void 0, 1);
      let skip = false;
      if (existing.length > 0 && existing[0].similarity > 0.85) {
        const classificationMatch = input.classifications?.find((c) => c.fact === fact && c.existingContent === existing[0].content);
        const classification = classificationMatch ? classificationMatch.classification : fact.trim().toLowerCase() === existing[0].content.trim().toLowerCase() ? "duplicate" : "update";
        if (classification === "duplicate") {
          skip = true;
        } else if (classification === "update") {
          skip = true;
          const conflictId = existing[0].id;
          const conflictReasoning = `Possibly contradicts or updates an existing memory: "${existing[0].content}"`;
          db.prepare(`
            INSERT INTO cerebro_learning_approvals (id, fact, confidence, status, source_run_id, created_at, conflict_with_id, conflict_reasoning, source_tool)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(import_crypto3.default.randomUUID(), fact, 0.6, "pending", null, Date.now(), conflictId, conflictReasoning, input.source_tool || null);
        }
      }
      if (!skip) {
        CerebroVectorStore.insert(fact, "preference", void 0, null, false, input.source_tool);
      }
    }
  }
  const allMemoriesRaw = db.prepare("SELECT id, content, type, last_accessed_at, access_count FROM cerebro_memories_meta").all();
  const allMemories = allMemoriesRaw.map((m) => ({ ...m, similarity: 1, embedding: new Float32Array() }));
  if (allMemories.length > 0) {
    const ranked = HabituationScorer.rank(allMemories, Date.now());
    const PRUNE_THRESHOLD = 0.05;
    for (const mem of ranked) {
      if (mem.r_final < PRUNE_THRESHOLD) {
        db.prepare("DELETE FROM cerebro_memories_meta WHERE id = ?").run(mem.id);
        db.prepare("DELETE FROM cerebro_memories_vec WHERE id = ?").run(mem.id);
      }
    }
  }
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1e3;
  const staleThreshold = Date.now() - THIRTY_DAYS_MS;
  const pruneStmt = db.prepare(`
    DELETE FROM cerebro_memories_meta 
    WHERE last_accessed_at < ? AND access_count < 5
  `);
  const pruneInfo = pruneStmt.run(staleThreshold);
  if (pruneInfo.changes > 0) {
    const cleanupVecStmt = db.prepare(`
      DELETE FROM cerebro_memories_vec 
      WHERE id NOT IN (SELECT id FROM cerebro_memories_meta)
    `);
    cleanupVecStmt.run();
  }
}

// src/core/memory/cerebro/worker.ts
var CerebroWorker = class extends import_poolifier.ThreadWorker {
  constructor() {
    super({
      execute: async (input) => {
        if (!input) return { status: "error", error: "No input provided" };
        try {
          await runReflectionSweep(input);
          return { status: "success", message: "Reflection cycle and sweep completed successfully" };
        } catch (err) {
          console.error("[CerebroWorker] Failed during reflection cycle", err);
          return { status: "error", error: err.message };
        }
      }
    });
  }
};
var worker_default = new CerebroWorker();
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsid29ya2VyLnRzIiwgIi4uLy4uL2Jhc2V2YXVsdC9kYi50cyIsICJ2ZWN0b3IudHMiLCAiaGFiaXR1YXRpb24udHMiLCAicmVmbGVjdGlvbi1zd2VlcC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW1wb3J0IHsgVGhyZWFkV29ya2VyIH0gZnJvbSAncG9vbGlmaWVyJztcbmltcG9ydCB7IHJ1blJlZmxlY3Rpb25Td2VlcCwgQ2VyZWJyb1dvcmtlcklucHV0IH0gZnJvbSAnLi9yZWZsZWN0aW9uLXN3ZWVwJztcblxuZXhwb3J0IGludGVyZmFjZSBDZXJlYnJvV29ya2VyT3V0cHV0IHtcbiAgc3RhdHVzOiAnc3VjY2VzcycgfCAnZXJyb3InO1xuICBtZXNzYWdlPzogc3RyaW5nO1xuICBlcnJvcj86IHN0cmluZztcbn1cblxuY2xhc3MgQ2VyZWJyb1dvcmtlciBleHRlbmRzIFRocmVhZFdvcmtlcjxDZXJlYnJvV29ya2VySW5wdXQsIENlcmVicm9Xb3JrZXJPdXRwdXQ+IHtcbiAgcHVibGljIGNvbnN0cnVjdG9yKCkge1xuICAgIHN1cGVyKHtcbiAgICAgIGV4ZWN1dGU6IGFzeW5jIChpbnB1dCkgPT4ge1xuICAgICAgICBpZiAoIWlucHV0KSByZXR1cm4geyBzdGF0dXM6ICdlcnJvcicsIGVycm9yOiAnTm8gaW5wdXQgcHJvdmlkZWQnIH07XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgYXdhaXQgcnVuUmVmbGVjdGlvblN3ZWVwKGlucHV0KTtcbiAgICAgICAgICByZXR1cm4geyBzdGF0dXM6ICdzdWNjZXNzJywgbWVzc2FnZTogJ1JlZmxlY3Rpb24gY3ljbGUgYW5kIHN3ZWVwIGNvbXBsZXRlZCBzdWNjZXNzZnVsbHknIH07XG4gICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgY29uc29sZS5lcnJvcignW0NlcmVicm9Xb3JrZXJdIEZhaWxlZCBkdXJpbmcgcmVmbGVjdGlvbiBjeWNsZScsIGVycik7XG4gICAgICAgICAgcmV0dXJuIHsgc3RhdHVzOiAnZXJyb3InLCBlcnJvcjogZXJyLm1lc3NhZ2UgfTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pO1xuICB9XG59XG5cbmV4cG9ydCBkZWZhdWx0IG5ldyBDZXJlYnJvV29ya2VyKCk7XG4iLCAiaW1wb3J0IERhdGFiYXNlIGZyb20gJ2JldHRlci1zcWxpdGUzJztcbmltcG9ydCBwYXRoIGZyb20gJ3BhdGgnO1xuaW1wb3J0IGZzIGZyb20gJ2ZzJztcbmltcG9ydCB7IHJhbmRvbVVVSUQsIGNyZWF0ZUhhc2ggfSBmcm9tICdjcnlwdG8nO1xuaW1wb3J0IHsgaXNNYWluVGhyZWFkIH0gZnJvbSAnd29ya2VyX3RocmVhZHMnO1xuXG5pbXBvcnQgdHlwZSB7IERhdGFiYXNlIGFzIEJldHRlclNxbGl0ZTNEYXRhYmFzZSB9IGZyb20gJ2JldHRlci1zcWxpdGUzJztcbmltcG9ydCAqIGFzIHNxbGl0ZVZlYyBmcm9tICdzcWxpdGUtdmVjJztcblxuLy8gUmVzb2x2ZSBkYXRhYmFzZSBkaXJlY3RvcnkgaW4gbG9jYWwgd29ya3NwYWNlICguZGF0YSlcbi8vXG4vLyBUZXN0cyBtdXN0IE5FVkVSIHRvdWNoIHRoZSByZWFsIGRldi91c2VyIGRhdGFiYXNlIFx1MjAxNCBWaXRlc3Qgc2V0c1xuLy8gYHByb2Nlc3MuZW52LlZJVEVTVGAgYXV0b21hdGljYWxseSwgc28gdW5kZXIgdGVzdCB3ZSB1c2UgYSBwcml2YXRlXG4vLyBpbi1tZW1vcnkgZGF0YWJhc2UgaW5zdGVhZC4gV2l0aG91dCB0aGlzLCBydW5uaW5nIHRoZSB0ZXN0IHN1aXRlIHdoaWxlXG4vLyB0aGUgZGV2IHNlcnZlciBpcyBydW5uaW5nIHdvdWxkIGRlbGV0ZSByZWFsIHJlZ2lzdGVyZWQgcHJvdmlkZXJzLFxuLy8gcm91dGluZyBydWxlcywgYW5kIHByb2plY3RzIChzZXZlcmFsIHRlc3RzIGRvIHVuc2NvcGVkIGBERUxFVEUgRlJPTVxuLy8gcHJvamVjdHNgIC8gYHRhc2tzYCAvIGB3b3JrZmxvd19ydW5zYCBhcyBjbGVhbnVwKSBcdTIwMTQgbGl2ZS1vYnNlcnZlZFxuLy8gMjAyNi0wNy0wMywgd2lwZWQgYSB1c2VyJ3MgcHJvdmlkZXIgcmVnaXN0cnkgdHdpY2UgbWlkLXNlc3Npb24uXG5jb25zdCBpc1Rlc3RFbnYgPSAhIXByb2Nlc3MuZW52LlZJVEVTVDtcbmNvbnN0IGRhdGFEaXIgPSBwYXRoLmpvaW4ocHJvY2Vzcy5jd2QoKSwgJy5kYXRhJyk7XG5pZiAoIWlzVGVzdEVudiAmJiAhZnMuZXhpc3RzU3luYyhkYXRhRGlyKSkge1xuICBmcy5ta2RpclN5bmMoZGF0YURpciwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG59XG5cbmV4cG9ydCBjb25zdCBkYlBhdGggPSBpc1Rlc3RFbnYgPyAnOm1lbW9yeTonIDogcGF0aC5qb2luKGRhdGFEaXIsICduZXVyb3N5bmMuZGInKTtcblxuLy8gSW5zdGFudGlhdGUgYmV0dGVyLXNxbGl0ZTMgZGF0YWJhc2VcbmV4cG9ydCBjb25zdCBkYjogQmV0dGVyU3FsaXRlM0RhdGFiYXNlID0gbmV3IERhdGFiYXNlKGRiUGF0aCwgeyBcbiAgdmVyYm9zZTogaXNNYWluVGhyZWFkICYmIHByb2Nlc3MuZW52Lk5PREVfRU5WID09PSAnZGV2ZWxvcG1lbnQnID8gY29uc29sZS5sb2cgOiB1bmRlZmluZWQgXG59KTtcblxuLy8gTG9hZCBWZWN0b3IgU2VhcmNoIEV4dGVuc2lvblxuc3FsaXRlVmVjLmxvYWQoZGIpO1xuXG4vLyBFbmZvcmNlIFdyaXRlLUFoZWFkIExvZ2dpbmcgKFdBTCkgZm9yIGNvbmN1cnJlbnQgcmVhZHMvd3JpdGVzIGFuZCBwZXJmb3JtYW5jZVxuZGIucHJhZ21hKCdqb3VybmFsX21vZGUgPSBXQUwnKTtcbmRiLnByYWdtYSgnc3luY2hyb25vdXMgPSBOT1JNQUwnKTtcbmRiLnByYWdtYSgnZm9yZWlnbl9rZXlzID0gT04nKTtcbmRiLnByYWdtYSgnYnVzeV90aW1lb3V0ID0gNTAwMCcpO1xuXG5kYi5mdW5jdGlvbignc2hhMjU2JywgKHRleHQ6IHN0cmluZykgPT4gY3JlYXRlSGFzaCgnc2hhMjU2JykudXBkYXRlKHRleHQgfHwgJycpLmRpZ2VzdCgnaGV4JykpO1xuXG4vLyBTY2hlbWEgSW5pdGlhbGl6YXRpb24gRnVuY3Rpb25cbmV4cG9ydCBmdW5jdGlvbiBpbml0REIoKSB7XG4gIGlmICghaXNNYWluVGhyZWFkICYmIHByb2Nlc3MuZW52Lk5PREVfRU5WICE9PSAndGVzdCcpIHJldHVybjtcbiAgZGIuZXhlYyhgXG4gICAgQ1JFQVRFIFRBQkxFIElGIE5PVCBFWElTVFMgcHJvamVjdHMgKFxuICAgICAgaWQgVEVYVCBQUklNQVJZIEtFWSxcbiAgICAgIG5hbWUgVEVYVCBOT1QgTlVMTCxcbiAgICAgIHdvcmtzcGFjZV9wYXRoIFRFWFQsXG4gICAgICBwcm9qZWN0X3Jvb3RfcGF0aCBURVhULFxuICAgICAgY3JlYXRlZF9hdCBJTlRFR0VSIE5PVCBOVUxMXG4gICAgKTtcblxuICAgIENSRUFURSBUQUJMRSBJRiBOT1QgRVhJU1RTIHdvcmtmbG93cyAoXG4gICAgICBpZCBURVhUIFBSSU1BUlkgS0VZLFxuICAgICAgcHJvamVjdF9pZCBURVhUIE5PVCBOVUxMLFxuICAgICAgbmFtZSBURVhUIE5PVCBOVUxMLFxuICAgICAgZGFnX3RlbXBsYXRlIFRFWFQgTk9UIE5VTEwsXG4gICAgICBjcm9uX3NjaGVkdWxlIFRFWFQsXG4gICAgICBjcmVhdGVkX2F0IElOVEVHRVIgTk9UIE5VTEwsXG4gICAgICBGT1JFSUdOIEtFWShwcm9qZWN0X2lkKSBSRUZFUkVOQ0VTIHByb2plY3RzKGlkKSBPTiBERUxFVEUgQ0FTQ0FERVxuICAgICk7XG5cbiAgICBDUkVBVEUgVEFCTEUgSUYgTk9UIEVYSVNUUyB3b3JrZmxvd19ydW5zIChcbiAgICAgIGlkIFRFWFQgUFJJTUFSWSBLRVksXG4gICAgICBwcm9qZWN0X2lkIFRFWFQgTk9UIE5VTEwsXG4gICAgICBkYWdfbGF5b3V0IFRFWFQgTk9UIE5VTEwsXG4gICAgICBzdGF0dXMgVEVYVCBOT1QgTlVMTCxcbiAgICAgIHRyYWNrIFRFWFQgTk9UIE5VTEwgREVGQVVMVCAndHJhY2syJyxcbiAgICAgIGNyZWF0ZWRfYXQgSU5URUdFUiBOT1QgTlVMTCxcbiAgICAgIEZPUkVJR04gS0VZKHByb2plY3RfaWQpIFJFRkVSRU5DRVMgcHJvamVjdHMoaWQpIE9OIERFTEVURSBDQVNDQURFXG4gICAgKTtcblxuICAgIENSRUFURSBUQUJMRSBJRiBOT1QgRVhJU1RTIHRhc2tzIChcbiAgICAgIGlkIFRFWFQgUFJJTUFSWSBLRVksXG4gICAgICBydW5faWQgVEVYVCBOT1QgTlVMTCxcbiAgICAgIHN0YXR1cyBURVhUIE5PVCBOVUxMLFxuICAgICAgY2xhaW1fbGVhc2UgSU5URUdFUixcbiAgICAgIG91dHB1dF9kYXRhIFRFWFQsXG4gICAgICByZXRyeV9jb3VudCBJTlRFR0VSIE5PVCBOVUxMIERFRkFVTFQgMCxcbiAgICAgIHN0YXJ0ZWRfYXQgSU5URUdFUixcbiAgICAgIEZPUkVJR04gS0VZKHJ1bl9pZCkgUkVGRVJFTkNFUyB3b3JrZmxvd19ydW5zKGlkKSBPTiBERUxFVEUgQ0FTQ0FERVxuICAgICk7XG4gICAgXG4gICAgQ1JFQVRFIFRBQkxFIElGIE5PVCBFWElTVFMgb3NfdG9kb3MgKFxuICAgICAgaWQgVEVYVCBQUklNQVJZIEtFWSxcbiAgICAgIGRhZ19ub2RlX2lkIFRFWFQsXG4gICAgICBwcm9qZWN0X2lkIFRFWFQsXG4gICAgICBzb3VyY2VfbW9kdWxlIFRFWFQgTk9UIE5VTEwgREVGQVVMVCAnQ29yZUV4ZWMnLFxuICAgICAgY29udGV4dF9wYXlsb2FkIFRFWFQsXG4gICAgICBzZXZlcml0eSBURVhUIE5PVCBOVUxMLFxuICAgICAgZXNjYWxhdGlvbl9yZWFzb24gVEVYVCBOT1QgTlVMTCxcbiAgICAgIHJlcXVpcmVkX2FjdGlvbl90eXBlIFRFWFQgTk9UIE5VTEwsXG4gICAgICBzdGF0dXMgVEVYVCBOT1QgTlVMTCxcbiAgICAgIGNyZWF0ZWRfYXQgSU5URUdFUiBOT1QgTlVMTCxcbiAgICAgIHJlc29sdmVkX2F0IElOVEVHRVIsXG4gICAgICByZXNvbHZlZF9ieSBURVhUXG4gICAgKTtcblxuICAgIC0tIE9wdGltaXplIHRhc2sgcXVlcnlpbmcgYnkgc3RhdHVzIGFuZCBydW5faWRcbiAgICBDUkVBVEUgSU5ERVggSUYgTk9UIEVYSVNUUyBpZHhfdGFza3NfcnVuX2lkX3N0YXR1cyBPTiB0YXNrcyhydW5faWQsIHN0YXR1cyk7XG5cbiAgICAtLSBDZXJlYnJvIE1lbW9yeSBUYWJsZXNcbiAgICAtLSBwcm9qZWN0X2lkIE5VTEwgPSBHTE9CQUwvVVNFUi10aWVyIG1lbW9yeSAodmlzaWJsZSBldmVyeXdoZXJlKTsgc2V0ID0gUFJPSkVDVC10aWVyXG4gICAgLS0gKHZpc2libGUgb25seSB0byB0aGF0IHByb2plY3QpLCBtaXJyb3JpbmcgdGhlIHRpZXIgY29udmVudGlvbiBvbiBva2Zfbm9kZXMuXG4gICAgQ1JFQVRFIFRBQkxFIElGIE5PVCBFWElTVFMgY2VyZWJyb19tZW1vcmllc19tZXRhIChcbiAgICAgIGlkIFRFWFQgUFJJTUFSWSBLRVksXG4gICAgICBjb250ZW50IFRFWFQgTk9UIE5VTEwsXG4gICAgICB0eXBlIFRFWFQgTk9UIE5VTEwsXG4gICAgICBwcm9qZWN0X2lkIFRFWFQsXG4gICAgICBsYXN0X2FjY2Vzc2VkX2F0IElOVEVHRVIgTk9UIE5VTEwsXG4gICAgICBhY2Nlc3NfY291bnQgSU5URUdFUiBOT1QgTlVMTCBERUZBVUxUIDAsXG4gICAgICBjcmVhdGVkX2F0IElOVEVHRVIgTk9UIE5VTEwsXG4gICAgICBzb3VyY2VfdG9vbCBURVhUXG4gICAgKTtcblxuICAgIENSRUFURSBWSVJUVUFMIFRBQkxFIElGIE5PVCBFWElTVFMgY2VyZWJyb19tZW1vcmllc192ZWMgVVNJTkcgdmVjMChcbiAgICAgIGlkIFRFWFQgUFJJTUFSWSBLRVksXG4gICAgICBlbWJlZGRpbmcgYml0WzE1MzZdXG4gICAgKTtcblxuICAgIENSRUFURSBUQUJMRSBJRiBOT1QgRVhJU1RTIG1lbW9yeV9xdWFyYW50aW5lIChcbiAgICAgIGlkIFRFWFQgUFJJTUFSWSBLRVksXG4gICAgICBjb250ZW50IFRFWFQgTk9UIE5VTEwsXG4gICAgICB0eXBlIFRFWFQgTk9UIE5VTEwsXG4gICAgICBwcm9qZWN0X2lkIFRFWFQsXG4gICAgICBsYXN0X2FjY2Vzc2VkX2F0IElOVEVHRVIgTk9UIE5VTEwsXG4gICAgICBhY2Nlc3NfY291bnQgSU5URUdFUiBOT1QgTlVMTCBERUZBVUxUIDAsXG4gICAgICBjcmVhdGVkX2F0IElOVEVHRVIgTk9UIE5VTEwsXG4gICAgICB0YWludF9mbGFnIElOVEVHRVIgTk9UIE5VTEwgREVGQVVMVCAxLFxuICAgICAgc291cmNlX3Rvb2wgVEVYVFxuICAgICk7XG5cbiAgICBDUkVBVEUgVklSVFVBTCBUQUJMRSBJRiBOT1QgRVhJU1RTIG1lbW9yeV9xdWFyYW50aW5lX3ZlYyBVU0lORyB2ZWMwKFxuICAgICAgaWQgVEVYVCBQUklNQVJZIEtFWSxcbiAgICAgIGVtYmVkZGluZyBiaXRbMTUzNl1cbiAgICApO1xuXG4gICAgQ1JFQVRFIFRBQkxFIElGIE5PVCBFWElTVFMgbWVtb3J5X2F1ZGl0X2xvZyAoXG4gICAgICBpZCBURVhUIFBSSU1BUlkgS0VZLFxuICAgICAgbWVtb3J5X2lkIFRFWFQgTk9UIE5VTEwsXG4gICAgICBhY3Rpb24gVEVYVCBOT1QgTlVMTCxcbiAgICAgIHByZXZpb3VzX2NvbnRlbnQgVEVYVCxcbiAgICAgIG5ld19jb250ZW50IFRFWFQsXG4gICAgICBjaGFuZ2VkX2F0IElOVEVHRVIgTk9UIE5VTEwsXG4gICAgICBwcmV2aW91c19oYXNoIFRFWFRcbiAgICApO1xuXG4gICAgQ1JFQVRFIFRSSUdHRVIgSUYgTk9UIEVYSVNUUyBhdWRpdF9tZW1vcnlfdXBkYXRlIFxuICAgIEFGVEVSIFVQREFURSBPTiBjZXJlYnJvX21lbW9yaWVzX21ldGFcbiAgICBCRUdJTlxuICAgICAgSU5TRVJUIElOVE8gbWVtb3J5X2F1ZGl0X2xvZyAoaWQsIG1lbW9yeV9pZCwgYWN0aW9uLCBwcmV2aW91c19jb250ZW50LCBuZXdfY29udGVudCwgY2hhbmdlZF9hdCwgcHJldmlvdXNfaGFzaClcbiAgICAgIFZBTFVFUyAoXG4gICAgICAgIGxvd2VyKGhleChyYW5kb21ibG9iKDE2KSkpLFxuICAgICAgICBORVcuaWQsXG4gICAgICAgICdVUERBVEUnLFxuICAgICAgICBPTEQuY29udGVudCxcbiAgICAgICAgTkVXLmNvbnRlbnQsXG4gICAgICAgIENBU1QoKGp1bGlhbmRheSgnbm93JykgLSAyNDQwNTg3LjUpKjg2NDAwMDAwIEFTIElOVEVHRVIpLFxuICAgICAgICAoU0VMRUNUIHNoYTI1NihpZm51bGwocHJldmlvdXNfaGFzaCwgJycpIHx8IGlkIHx8IGFjdGlvbiB8fCBpZm51bGwocHJldmlvdXNfY29udGVudCwgJycpIHx8IGlmbnVsbChuZXdfY29udGVudCwgJycpIHx8IGNoYW5nZWRfYXQpIEZST00gbWVtb3J5X2F1ZGl0X2xvZyBPUkRFUiBCWSBjaGFuZ2VkX2F0IERFU0MgTElNSVQgMSlcbiAgICAgICk7XG4gICAgRU5EO1xuXG4gICAgQ1JFQVRFIFRSSUdHRVIgSUYgTk9UIEVYSVNUUyBhdWRpdF9tZW1vcnlfZGVsZXRlIFxuICAgIEFGVEVSIERFTEVURSBPTiBjZXJlYnJvX21lbW9yaWVzX21ldGFcbiAgICBCRUdJTlxuICAgICAgSU5TRVJUIElOVE8gbWVtb3J5X2F1ZGl0X2xvZyAoaWQsIG1lbW9yeV9pZCwgYWN0aW9uLCBwcmV2aW91c19jb250ZW50LCBuZXdfY29udGVudCwgY2hhbmdlZF9hdCwgcHJldmlvdXNfaGFzaClcbiAgICAgIFZBTFVFUyAoXG4gICAgICAgIGxvd2VyKGhleChyYW5kb21ibG9iKDE2KSkpLFxuICAgICAgICBPTEQuaWQsXG4gICAgICAgICdERUxFVEUnLFxuICAgICAgICBPTEQuY29udGVudCxcbiAgICAgICAgTlVMTCxcbiAgICAgICAgQ0FTVCgoanVsaWFuZGF5KCdub3cnKSAtIDI0NDA1ODcuNSkqODY0MDAwMDAgQVMgSU5URUdFUiksXG4gICAgICAgIChTRUxFQ1Qgc2hhMjU2KGlmbnVsbChwcmV2aW91c19oYXNoLCAnJykgfHwgaWQgfHwgYWN0aW9uIHx8IGlmbnVsbChwcmV2aW91c19jb250ZW50LCAnJykgfHwgaWZudWxsKG5ld19jb250ZW50LCAnJykgfHwgY2hhbmdlZF9hdCkgRlJPTSBtZW1vcnlfYXVkaXRfbG9nIE9SREVSIEJZIGNoYW5nZWRfYXQgREVTQyBMSU1JVCAxKVxuICAgICAgKTtcbiAgICBFTkQ7XG5cblxuICAgIENSRUFURSBUQUJMRSBJRiBOT1QgRVhJU1RTIGNlcmVicm9fbGVhcm5pbmdfYXBwcm92YWxzIChcbiAgICAgIGlkIFRFWFQgUFJJTUFSWSBLRVksXG4gICAgICBmYWN0IFRFWFQgTk9UIE5VTEwsXG4gICAgICBjb25maWRlbmNlIFJFQUwgTk9UIE5VTEwsXG4gICAgICBzdGF0dXMgVEVYVCBOT1QgTlVMTCxcbiAgICAgIHNvdXJjZV9ydW5faWQgVEVYVCxcbiAgICAgIGNyZWF0ZWRfYXQgSU5URUdFUiBOT1QgTlVMTCxcbiAgICAgIHNvdXJjZV90b29sIFRFWFRcbiAgICApO1xuXG4gICAgLS0gQ2VyZWJybyBwcnVuZSBoaXN0b3J5OiBvbmUgcm93IHBlciBtYW51YWwgcHJ1bmUgYWN0aW9uLiBQb3dlcnMgdGhlXG4gICAgLS0gXCJQcnVuZWQgKDMwZClcIiBjb3VudGVyIChTVU0oY291bnQpIG92ZXIgdGhlIGxhc3QgMzAgZGF5cykuIFBydW5pbmcgaXNcbiAgICAtLSBtYW51YWwtdHJpZ2dlciBvbmx5IChuZXZlciBhIHNpbGVudCBiYWNrZ3JvdW5kIGF1dG8tZGVsZXRlKSBzaW5jZSBpdFxuICAgIC0tIHBlcm1hbmVudGx5IHJlbW92ZXMgdXNlciBtZW1vcnkgcm93cyBmcm9tIGNlcmVicm9fbWVtb3JpZXNfbWV0YS9fdmVjLlxuICAgIENSRUFURSBUQUJMRSBJRiBOT1QgRVhJU1RTIGNlcmVicm9fcHJ1bmVfbG9nIChcbiAgICAgIGlkIFRFWFQgUFJJTUFSWSBLRVksXG4gICAgICBwcnVuZWRfYXQgSU5URUdFUiBOT1QgTlVMTCxcbiAgICAgIGNvdW50IElOVEVHRVIgTk9UIE5VTExcbiAgICApO1xuXG4gICAgLS0gQ291bmNpbCBNb2RlIChSb3V0ZVN3aXRjaCBoaWdoLXJpc2sgYXJiaXRyYXRpb24pIGNvbXB1dGVzIGEgcmVhbFxuICAgIC0tIGNvbmZpZGVuY2UvZGlzYWdyZWVtZW50IHNpZ25hbCBmcm9tIHBhcmFsbGVsIHByb3ZpZGVyIGNhbGxzLCBidXQgZXZlcnlcbiAgICAtLSBjYWxsZXIgb2YgUm91dGVTd2l0Y2hFbmdpbmUuZXhlY3V0ZSgpIHByZXZpb3VzbHkgZGlzY2FyZGVkIGl0IFx1MjAxNCBvbmx5XG4gICAgLS0gcmVzdWx0LmNvbnRlbnQgd2FzIGV2ZXIgcmVhZC4gVGhpcyB0YWJsZSBpcyB3aGF0IG1ha2VzIHRoYXQgc2lnbmFsXG4gICAgLS0gcXVlcnlhYmxlL3Zpc2libGUgKHBlcnNpc3RlZCArIGxvZ2dlZCArIHN1cmZhY2VkIGluIHRoZSBkYXNoYm9hcmQpXG4gICAgLS0gaW5zdGVhZCBvZiB2YW5pc2hpbmcgc2lsZW50bHkgYWZ0ZXIgYmVpbmcgY29tcHV0ZWQgYXQgcmVhbCBjb3N0LlxuICAgIENSRUFURSBUQUJMRSBJRiBOT1QgRVhJU1RTIGNvdW5jaWxfZGVjaXNpb25zIChcbiAgICAgIGlkIFRFWFQgUFJJTUFSWSBLRVksXG4gICAgICBzY29wZSBURVhULFxuICAgICAgc2NvcGVfaWQgVEVYVCxcbiAgICAgIHByb3ZpZGVyX2NvdW50IElOVEVHRVIgTk9UIE5VTEwsXG4gICAgICBjb25maWRlbmNlIFJFQUwgTk9UIE5VTEwsXG4gICAgICBkaXNhZ3JlZW1lbnRfc2NvcmUgUkVBTCBOT1QgTlVMTCxcbiAgICAgIGNob3Nlbl9yZXNwb25zZV9sZW5ndGggSU5URUdFUiBOT1QgTlVMTCxcbiAgICAgIGNyZWF0ZWRfYXQgSU5URUdFUiBOT1QgTlVMTFxuICAgICk7XG5cbiAgICBDUkVBVEUgVEFCTEUgSUYgTk9UIEVYSVNUUyBzeXN0ZW1fc2V0dGluZ3MgKFxuICAgICAga2V5IFRFWFQgUFJJTUFSWSBLRVksXG4gICAgICB2YWx1ZSBURVhUIE5PVCBOVUxMXG4gICAgKTtcblxuICAgIC0tIFNjb3BlTG9naWMgREFHIHByb3Bvc2FscyBhd2FpdGluZyBodW1hbiBhcHByb3ZhbCAoU3lzdGVtIEIpLlxuICAgIC0tIFByZXZpb3VzbHkgY3JhbW1lZCBhcyBhIHNpbmdsZSBKU09OIGJsb2IgaW50byBzeXN0ZW1fc2V0dGluZ3MgdW5kZXIgdGhlXG4gICAgLS0gZml4ZWQga2V5ICdwZW5kaW5nX3Byb3Bvc2FsJyB3aXRoIG5vIGNvbmZpZGVuY2UsIG5vIHByb2plY3Qgc2NvcGluZywgYW5kXG4gICAgLS0gbm8gYXVkaXQgdHJhaWwuIFRoaXMgcmVhbCB0YWJsZSBsZXRzIGEgc3RhZ2VkIHByb3Bvc2FsIGJlIGNvbmZpZGVuY2UtZ2F0ZWRcbiAgICAtLSAoRGVmZXJlbmNlIFVJLCAwLjcwIHRocmVzaG9sZCkgYW5kIHN1cmZhY2VkIGluIHRoZSBTQU1FIFBvcnRHcmlkIGFwcHJvdmFsXG4gICAgLS0gcXVldWUgYXMgb3NfdG9kb3MuIHByb2plY3RfaWQgaXMgbnVsbGFibGUgKHByb3Bvc2FscyBzdGFnZWQgdW5kZXIgYVxuICAgIC0tIFwiR2xvYmFsXCIvbm8tYWN0aXZlLXByb2plY3Qgc2NvcGUgYXJlIGxlZ2l0aW1hdGUpLiBObyBGSyBvbiBwcm9qZWN0X2lkOlxuICAgIC0tIHByb3Bvc2FsIGhpc3Rvcnkgc2hvdWxkIHN1cnZpdmUgcHJvamVjdCBkZWxldGlvbiBmb3IgYXVkaXQsIGFuZCBzdGFnaW5nXG4gICAgLS0gbXVzdCBub3QgZmFpbCBpZiB0aGUgaWQgZG9lc24ndCAoeWV0KSByZXNvbHZlIHRvIGEgcHJvamVjdHMgcm93LlxuICAgIENSRUFURSBUQUJMRSBJRiBOT1QgRVhJU1RTIGRhZ19wcm9wb3NhbHMgKFxuICAgICAgaWQgVEVYVCBQUklNQVJZIEtFWSxcbiAgICAgIHByb2plY3RfaWQgVEVYVCxcbiAgICAgIHByb3Bvc2FsIFRFWFQgTk9UIE5VTEwsXG4gICAgICBjb25maWRlbmNlIFJFQUwgTk9UIE5VTEwgREVGQVVMVCAwLjUsXG4gICAgICBzdGF0dXMgVEVYVCBOT1QgTlVMTCBERUZBVUxUICdwZW5kaW5nJyxcbiAgICAgIGNyZWF0ZWRfYXQgSU5URUdFUiBOT1QgTlVMTFxuICAgICk7XG5cbiAgICBDUkVBVEUgSU5ERVggSUYgTk9UIEVYSVNUUyBpZHhfZGFnX3Byb3Bvc2Fsc19zdGF0dXMgT04gZGFnX3Byb3Bvc2FscyhzdGF0dXMsIGNyZWF0ZWRfYXQpO1xuXG4gICAgQ1JFQVRFIFRBQkxFIElGIE5PVCBFWElTVFMgbW9kZWxfYmVuY2htYXJrcyAoXG4gICAgICBtb2RlbF9pZCBURVhUIFBSSU1BUlkgS0VZLFxuICAgICAgYXZnX2xhdGVuY3lfbXMgUkVBTCxcbiAgICAgIGF2Z190cHMgUkVBTCxcbiAgICAgIGZhaWx1cmVfcmF0ZSBSRUFMLFxuICAgICAgdG90YWxfcnVucyBJTlRFR0VSXG4gICAgKTtcblxuICAgIENSRUFURSBUQUJMRSBJRiBOT1QgRVhJU1RTIGRpc2NvdmVyZWRfbW9kZWxzIChcbiAgICAgIGlkIFRFWFQgUFJJTUFSWSBLRVksXG4gICAgICBuYW1lIFRFWFQgTk9UIE5VTEwsXG4gICAgICBjb250ZXh0X2xlbmd0aCBJTlRFR0VSLFxuICAgICAgcHJpY2luZ19wcm9tcHQgVEVYVCxcbiAgICAgIHByaWNpbmdfY29tcGxldGlvbiBURVhULFxuICAgICAgZmV0Y2hlZF9hdCBJTlRFR0VSIE5PVCBOVUxMXG4gICAgKTtcblxuICAgIC0tIExMTSBQcm92aWRlciBSZWdpc3RyeTogbmFtZWQgcHJvdmlkZXIgZW50cmllcyB3aXRoIGVuY3J5cHRlZCBBUEkga2V5c1xuICAgIENSRUFURSBUQUJMRSBJRiBOT1QgRVhJU1RTIGxsbV9wcm92aWRlcnMgKFxuICAgICAgaWQgVEVYVCBQUklNQVJZIEtFWSxcbiAgICAgIG5hbWUgVEVYVCBOT1QgTlVMTCxcbiAgICAgIHR5cGUgVEVYVCBOT1QgTlVMTCxcbiAgICAgIGNvbmZpZ19qc29uIFRFWFQgTk9UIE5VTEwsXG4gICAgICBhcGlfa2V5X2VuY3J5cHRlZCBURVhULFxuICAgICAgaXNfZW5hYmxlZCBJTlRFR0VSIE5PVCBOVUxMIERFRkFVTFQgMSxcbiAgICAgIGNyZWF0ZWRfYXQgSU5URUdFUiBOT1QgTlVMTCxcbiAgICAgIHVwZGF0ZWRfYXQgSU5URUdFUiBOT1QgTlVMTFxuICAgICk7XG5cbiAgICAtLSBMTE0gUm91dGluZyBSdWxlczogcGVyLXNjb3BlIGZhbGxiYWNrIGNoYWluc1xuICAgIENSRUFURSBUQUJMRSBJRiBOT1QgRVhJU1RTIGxsbV9yb3V0aW5nX3J1bGVzIChcbiAgICAgIGlkIFRFWFQgUFJJTUFSWSBLRVksXG4gICAgICBzY29wZSBURVhUIE5PVCBOVUxMLFxuICAgICAgc2NvcGVfaWQgVEVYVCxcbiAgICAgIHByb3ZpZGVyX2NoYWluIFRFWFQgTk9UIE5VTEwsXG4gICAgICBjcmVhdGVkX2F0IElOVEVHRVIgTk9UIE5VTEwsXG4gICAgICB1cGRhdGVkX2F0IElOVEVHRVIgTk9UIE5VTEwsXG4gICAgICBVTklRVUUoc2NvcGUsIHNjb3BlX2lkKVxuICAgICk7XG5cbiAgICAtLSBPS0YgS25vd2xlZGdlIEdyYXBoOiBpbmRpdmlkdWFsIE1hcmtkb3duIGNvbmNlcHQgZmlsZXMgaW5kZXhlZFxuICAgIENSRUFURSBUQUJMRSBJRiBOT1QgRVhJU1RTIG9rZl9ub2RlcyAoXG4gICAgICBpZCBURVhUIFBSSU1BUlkgS0VZLFxuICAgICAgdGllciBURVhUIE5PVCBOVUxMIENIRUNLKHRpZXIgSU4gKCdHTE9CQUwnLCAnVVNFUicsICdQUk9KRUNUJykpLFxuICAgICAgcHJvamVjdF9pZCBURVhULFxuICAgICAgdHlwZSBURVhUIE5PVCBOVUxMLFxuICAgICAgdGl0bGUgVEVYVCxcbiAgICAgIGNvbmZpZGVuY2UgUkVBTCBOT1QgTlVMTCBERUZBVUxUIDEuMCxcbiAgICAgIGNvbnRlbnRfaGFzaCBURVhULFxuICAgICAgZnJvbnRtYXR0ZXJfanNvbiBURVhULFxuICAgICAgZmlsZV9wYXRoIFRFWFQgVU5JUVVFIE5PVCBOVUxMLFxuICAgICAgbGFzdF9pbmRleGVkX2F0IElOVEVHRVIgTk9UIE5VTEwsXG4gICAgICBGT1JFSUdOIEtFWShwcm9qZWN0X2lkKSBSRUZFUkVOQ0VTIHByb2plY3RzKGlkKSBPTiBERUxFVEUgQ0FTQ0FERVxuICAgICk7XG5cbiAgICAtLSBPS0YgRWRnZXM6IHJlbGF0aW9uc2hpcHMgYmV0d2VlbiBjb25jZXB0IGZpbGVzIChmcm9tIE1hcmtkb3duIGxpbmtzKVxuICAgIENSRUFURSBUQUJMRSBJRiBOT1QgRVhJU1RTIG9rZl9lZGdlcyAoXG4gICAgICBzb3VyY2Vfbm9kZV9pZCBURVhUIE5PVCBOVUxMLFxuICAgICAgdGFyZ2V0X25vZGVfaWQgVEVYVCBOT1QgTlVMTCxcbiAgICAgIHJlbGF0aW9uc2hpcF90eXBlIFRFWFQgTk9UIE5VTEwgREVGQVVMVCAncmVmZXJlbmNlcycsXG4gICAgICBQUklNQVJZIEtFWSAoc291cmNlX25vZGVfaWQsIHRhcmdldF9ub2RlX2lkKSxcbiAgICAgIEZPUkVJR04gS0VZIChzb3VyY2Vfbm9kZV9pZCkgUkVGRVJFTkNFUyBva2Zfbm9kZXMoaWQpIE9OIERFTEVURSBDQVNDQURFLFxuICAgICAgRk9SRUlHTiBLRVkgKHRhcmdldF9ub2RlX2lkKSBSRUZFUkVOQ0VTIG9rZl9ub2RlcyhpZCkgT04gREVMRVRFIENBU0NBREVcbiAgICApO1xuXG4gICAgLS0gU2NvdXREYWVtb24gcXVhcmFudGluZWQgcmVzZWFyY2ggKGlzb2xhdGVkIGZyb20gYWN0aXZlIGtub3dsZWRnZSBncmFwaClcbiAgICBDUkVBVEUgVEFCTEUgSUYgTk9UIEVYSVNUUyBzY291dF9va2Zfbm9kZXMgKFxuICAgICAgaWQgVEVYVCBQUklNQVJZIEtFWSxcbiAgICAgIHByb2plY3RfaWQgVEVYVCxcbiAgICAgIHR5cGUgVEVYVCBOT1QgTlVMTCxcbiAgICAgIHRpdGxlIFRFWFQsXG4gICAgICBjb25maWRlbmNlIFJFQUwgTk9UIE5VTEwgREVGQVVMVCAwLjUsXG4gICAgICBjb250ZW50X2hhc2ggVEVYVCxcbiAgICAgIGZyb250bWF0dGVyX2pzb24gVEVYVCxcbiAgICAgIGZpbGVfcGF0aCBURVhUIFVOSVFVRSBOT1QgTlVMTCxcbiAgICAgIHN0YXR1cyBURVhUIE5PVCBOVUxMIERFRkFVTFQgJ2RyYWZ0JyBDSEVDSyhzdGF0dXMgSU4gKCdkcmFmdCcsICdwcm9tb3RlZCcsICdyZWplY3RlZCcpKSxcbiAgICAgIGNyZWF0ZWRfYXQgSU5URUdFUiBOT1QgTlVMTCxcbiAgICAgIEZPUkVJR04gS0VZKHByb2plY3RfaWQpIFJFRkVSRU5DRVMgcHJvamVjdHMoaWQpIE9OIERFTEVURSBTRVQgTlVMTFxuICAgICk7XG5cbiAgICBDUkVBVEUgVEFCTEUgSUYgTk9UIEVYSVNUUyBzY291dF9zeW1ib2xzIChcbiAgICAgIGlkIFRFWFQgUFJJTUFSWSBLRVksXG4gICAgICBwcm9qZWN0X2lkIFRFWFQsXG4gICAgICBmaWxlX3BhdGggVEVYVCBOT1QgTlVMTCxcbiAgICAgIHN5bWJvbF90eXBlIFRFWFQgTk9UIE5VTEwsXG4gICAgICBzeW1ib2xfbmFtZSBURVhUIE5PVCBOVUxMLFxuICAgICAgY3JlYXRlZF9hdCBJTlRFR0VSIE5PVCBOVUxMLFxuICAgICAgRk9SRUlHTiBLRVkocHJvamVjdF9pZCkgUkVGRVJFTkNFUyBwcm9qZWN0cyhpZCkgT04gREVMRVRFIENBU0NBREVcbiAgICApO1xuXG4gICAgLS0gXHUyNTAwXHUyNTAwIEF4aW9tIDY6IEdlbmVzaXMgSGFyZHdhcmUgUHJvZmlsZSAoSW1tdXRhYmxlIExlZGdlcikgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG4gICAgLS0gV3JpdHRlbiBPTkNFIGJ5IFNjb3V0RGFlbW9uJ3MgaGFyZHdhcmUtcHJvZmlsZXIgYXQgZmlyc3QtcnVuIHNldHVwLlxuICAgIC0tICd0aWVyJyBpcyB0aGUgc3ludGhlc2l6ZWQgY2xhc3NpZmljYXRpb246IGNvbnN0cmFpbmVkIHwgc3RhbmRhcmQgfCBoaWdoLXBlcmZvcm1hbmNlLlxuICAgIC0tIE5ldmVyIG1vZGlmaWVkIGFmdGVyIGluaXRpYWwgd3JpdGU7IHJlLXByb2ZpbGluZyBpbnNlcnRzIGEgbmV3IHJvdyB3aXRoIGFcbiAgICAtLSBuZXcgaWQgXHUyMDE0IGl0IG5ldmVyIG92ZXJ3cml0ZXMgdGhlIGhpc3RvcmljYWwgcmVjb3JkLlxuICAgIENSRUFURSBUQUJMRSBJRiBOT1QgRVhJU1RTIGhhcmR3YXJlX3Byb2ZpbGVzIChcbiAgICAgIGlkIFRFWFQgUFJJTUFSWSBLRVksXG4gICAgICBwcm9maWxlZF9hdCBJTlRFR0VSIE5PVCBOVUxMLFxuICAgICAgY3B1X2NvcmVzIElOVEVHRVIgTk9UIE5VTEwsXG4gICAgICBjcHVfcGh5c2ljYWxfY29yZXMgSU5URUdFUiBOT1QgTlVMTCxcbiAgICAgIGNwdV9oYXNfaHlwZXJ0aHJlYWRpbmcgSU5URUdFUiBOT1QgTlVMTCBERUZBVUxUIDAsXG4gICAgICBjcHVfYnJhbmQgVEVYVCxcbiAgICAgIHJhbV90b3RhbF9tYiBJTlRFR0VSIE5PVCBOVUxMLFxuICAgICAgc3RvcmFnZV90eXBlIFRFWFQgTk9UIE5VTEwgREVGQVVMVCAndW5rbm93bicsXG4gICAgICBvc19wbGF0Zm9ybSBURVhUIE5PVCBOVUxMLFxuICAgICAgb3NfZGlzdHJvIFRFWFQsXG4gICAgICB2aXJ0dWFsaXphdGlvbiBURVhUIE5PVCBOVUxMIERFRkFVTFQgJ25vbmUnLFxuICAgICAgZ3B1X3R5cGUgVEVYVCBOT1QgTlVMTCBERUZBVUxUICdub25lJyxcbiAgICAgIGdwdV92cmFtX21iIElOVEVHRVIgTk9UIE5VTEwgREVGQVVMVCAwLFxuICAgICAgdGllciBURVhUIE5PVCBOVUxMIENIRUNLKHRpZXIgSU4gKCdjb25zdHJhaW5lZCcsICdzdGFuZGFyZCcsICdoaWdoLXBlcmZvcm1hbmNlJykpXG4gICAgKTtcblxuICAgIC0tIFx1MjUwMFx1MjUwMCBBeGlvbSA2OiBEZXJpdmVkIEVudmlyb25tZW50IFJ1bGVzIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuICAgIC0tIEtleS92YWx1ZSBwYWlycyBzeW50aGVzaXplZCBmcm9tIGhhcmR3YXJlX3Byb2ZpbGVzIGJ5IHRoZSBwcm9maWxlci5cbiAgICAtLSBDb3JlRXhlYyByZWFkcyB0aGVzZSBhdCBib290IHRvIGluamVjdCB0YXNrc2V0LCB0aHJlYWQgY2FwcywgaGVhcCBsaW1pdHMuXG4gICAgLS0gUm91dGVTd2l0Y2ggcmVhZHMgJ2xvY2FsX2xsbV9lbmFibGVkJyBiZWZvcmUgYXR0ZW1wdGluZyBsb2NhbCBTTE0gY2FsbHMuXG4gICAgQ1JFQVRFIFRBQkxFIElGIE5PVCBFWElTVFMgZW52aXJvbm1lbnRfcnVsZXMgKFxuICAgICAgaWQgVEVYVCBQUklNQVJZIEtFWSxcbiAgICAgIHByb2ZpbGVfaWQgVEVYVCBOT1QgTlVMTCBSRUZFUkVOQ0VTIGhhcmR3YXJlX3Byb2ZpbGVzKGlkKSBPTiBERUxFVEUgQ0FTQ0FERSxcbiAgICAgIHJ1bGVfa2V5IFRFWFQgTk9UIE5VTEwsXG4gICAgICBydWxlX3ZhbHVlIFRFWFQgTk9UIE5VTEwsXG4gICAgICBjcmVhdGVkX2F0IElOVEVHRVIgTk9UIE5VTExcbiAgICApO1xuICAgIENSRUFURSBJTkRFWCBJRiBOT1QgRVhJU1RTIGlkeF9lbnZpcm9ubWVudF9ydWxlc19wcm9maWxlIE9OIGVudmlyb25tZW50X3J1bGVzKHByb2ZpbGVfaWQpO1xuXG4gICAgLS0gSW5kZXhlcyBmb3IgZ3JhcGggdHJhdmVyc2FsIHBlcmZvcm1hbmNlXG4gICAgQ1JFQVRFIElOREVYIElGIE5PVCBFWElTVFMgaWR4X29rZl9ub2Rlc190aWVyIE9OIG9rZl9ub2Rlcyh0aWVyLCBwcm9qZWN0X2lkKTtcbiAgICBDUkVBVEUgSU5ERVggSUYgTk9UIEVYSVNUUyBpZHhfb2tmX25vZGVzX3R5cGUgT04gb2tmX25vZGVzKHR5cGUpO1xuICAgIENSRUFURSBJTkRFWCBJRiBOT1QgRVhJU1RTIGlkeF9va2ZfZWRnZXNfc291cmNlIE9OIG9rZl9lZGdlcyhzb3VyY2Vfbm9kZV9pZCk7XG4gICAgQ1JFQVRFIElOREVYIElGIE5PVCBFWElTVFMgaWR4X29rZl9lZGdlc190YXJnZXQgT04gb2tmX2VkZ2VzKHRhcmdldF9ub2RlX2lkKTtcbiAgICBDUkVBVEUgSU5ERVggSUYgTk9UIEVYSVNUUyBpZHhfc2NvdXRfb2tmX3N0YXR1cyBPTiBzY291dF9va2Zfbm9kZXMoc3RhdHVzKTtcbiAgICBDUkVBVEUgSU5ERVggSUYgTk9UIEVYSVNUUyBpZHhfY2VyZWJyb19tZW1vcmllc19wcm9qZWN0IE9OIGNlcmVicm9fbWVtb3JpZXNfbWV0YShwcm9qZWN0X2lkKTtcbiAgYCk7XG5cbiAgdHJ5IHtcbiAgICBkYi5leGVjKGBBTFRFUiBUQUJMRSBwcm9qZWN0cyBBREQgQ09MVU1OIHdvcmtzcGFjZV9wYXRoIFRFWFQ7YCk7XG4gIH0gY2F0Y2ggKGU6IGFueSkge1xuICAgIC8vIElnbm9yZSBlcnJvciBpZiBjb2x1bW4gYWxyZWFkeSBleGlzdHNcbiAgICBpZiAoIWUubWVzc2FnZS5pbmNsdWRlcygnZHVwbGljYXRlIGNvbHVtbiBuYW1lJykpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIGFkZGluZyB3b3Jrc3BhY2VfcGF0aCBjb2x1bW46JywgZSk7XG4gICAgfVxuICB9XG5cbiAgdHJ5IHtcbiAgICBkYi5leGVjKGBBTFRFUiBUQUJMRSBwcm9qZWN0cyBBREQgQ09MVU1OIHByb2plY3Rfcm9vdF9wYXRoIFRFWFQ7YCk7XG4gIH0gY2F0Y2ggKGU6IGFueSkge1xuICAgIGlmICghZS5tZXNzYWdlLmluY2x1ZGVzKCdkdXBsaWNhdGUgY29sdW1uIG5hbWUnKSkge1xuICAgICAgY29uc29sZS5lcnJvcignRXJyb3IgYWRkaW5nIHByb2plY3Rfcm9vdF9wYXRoIGNvbHVtbjonLCBlKTtcbiAgICB9XG4gIH1cblxuICB0cnkge1xuICAgIC8vIERlZmVyZW5jZSBVSSAoMC43MCB0aHJlc2hvbGQpIFx1MjAxNCBudW1lcmljIGNvbmZpZGVuY2UgcGVyIHBlbmRpbmcgYXBwcm92YWwuXG4gICAgLy8gRGVmYXVsdCAwLjUgcHV0cyBsZWdhY3kvdW4tc2NvcmVkIHJvd3MgaW4gdGhlIFwibmVlZHMgYSBsb29rXCIgYnVja2V0XG4gICAgLy8gcmF0aGVyIHRoYW4gc2lsZW50bHkgcXVhbGlmeWluZyB0aGVtIGZvciBidWxrIGF1dG8tYXBwcm92YWwuXG4gICAgZGIuZXhlYyhgQUxURVIgVEFCTEUgb3NfdG9kb3MgQUREIENPTFVNTiBjb25maWRlbmNlIFJFQUwgTk9UIE5VTEwgREVGQVVMVCAwLjU7YCk7XG4gIH0gY2F0Y2ggKGU6IGFueSkge1xuICAgIGlmICghZS5tZXNzYWdlLmluY2x1ZGVzKCdkdXBsaWNhdGUgY29sdW1uIG5hbWUnKSkge1xuICAgICAgY29uc29sZS5lcnJvcignRXJyb3IgYWRkaW5nIGNvbmZpZGVuY2UgY29sdW1uIHRvIG9zX3RvZG9zOicsIGUpO1xuICAgIH1cbiAgfVxuXG4gIHRyeSB7XG4gICAgLy8gU29mdC1kZWxldGUgZm9yIHByb2plY3RzOiBhcmNoaXZlZF9hdCBpcyBOVUxMIGZvciBhY3RpdmUgcHJvamVjdHMuXG4gICAgLy8gVGhlcmUgd2FzIHByZXZpb3VzbHkgbm8gZGVsZXRlL2FyY2hpdmUgcGF0aCBhdCBhbGwsIHNvIG9ycGhhbmVkL3Rlc3RcbiAgICAvLyBwcm9qZWN0IHJvd3MgaGFkIG5vIHdheSB0byBiZSBjbGVhbmVkIHVwIHNob3J0IG9mIGEgcmF3IERCIGVkaXQuXG4gICAgZGIuZXhlYyhgQUxURVIgVEFCTEUgcHJvamVjdHMgQUREIENPTFVNTiBhcmNoaXZlZF9hdCBJTlRFR0VSO2ApO1xuICB9IGNhdGNoIChlOiBhbnkpIHtcbiAgICBpZiAoIWUubWVzc2FnZS5pbmNsdWRlcygnZHVwbGljYXRlIGNvbHVtbiBuYW1lJykpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIGFkZGluZyBhcmNoaXZlZF9hdCBjb2x1bW4gdG8gcHJvamVjdHM6JywgZSk7XG4gICAgfVxuICB9XG5cbiAgdHJ5IHtcbiAgICAvLyBSZWFsIFwiT3JjaGVzdHJhdGlvbiBNZXRyaWNzXCIgKENvcmVFeGVjRGFzaGJvYXJkKSBuZWVkcyBhIGNvbXBsZXRpb25cbiAgICAvLyB0aW1lc3RhbXAgdG8gY29tcHV0ZSBsYXRlbmN5IC0tIHByZXZpb3VzbHkgb25seSBjcmVhdGVkX2F0IGV4aXN0ZWQsXG4gICAgLy8gc28gcnVuIGR1cmF0aW9uIHdhcyB1bmNvbXB1dGFibGUgYW5kIHRoZSBkYXNoYm9hcmQgc2hvd2VkIGEgZmFicmljYXRlZFxuICAgIC8vIFwiNDJtc1wiIHN0cmluZyBpbnN0ZWFkLlxuICAgIGRiLmV4ZWMoYEFMVEVSIFRBQkxFIHdvcmtmbG93X3J1bnMgQUREIENPTFVNTiBjb21wbGV0ZWRfYXQgSU5URUdFUjtgKTtcbiAgfSBjYXRjaCAoZTogYW55KSB7XG4gICAgaWYgKCFlLm1lc3NhZ2UuaW5jbHVkZXMoJ2R1cGxpY2F0ZSBjb2x1bW4gbmFtZScpKSB7XG4gICAgICBjb25zb2xlLmVycm9yKCdFcnJvciBhZGRpbmcgY29tcGxldGVkX2F0IGNvbHVtbiB0byB3b3JrZmxvd19ydW5zOicsIGUpO1xuICAgIH1cbiAgfVxuXG4gIHRyeSB7XG4gICAgLy8gRnJlZSBNb2RlIEdvdmVybm9yIHBhaWQtcHJvdmlkZXIgbG9jazogb3B0LWluIHBlci1wcm92aWRlciBcInRoaXMgY29zdHNcbiAgICAvLyByZWFsIG1vbmV5XCIgZmxhZy4gREVGQVVMVCAwIChmcmVlKSBmb3IgZXZlcnkgcm93IFx1MjAxNCBpbmNsdWRpbmcgYWxsIGV4aXN0aW5nXG4gICAgLy8gcm93cyBcdTIwMTQgaXMgZGVsaWJlcmF0ZTogbm90aGluZyBpcyBzaWxlbnRseSByZWNsYXNzaWZpZWQgYnkgcHJvdmlkZXIgdHlwZS5cbiAgICBkYi5leGVjKGBBTFRFUiBUQUJMRSBsbG1fcHJvdmlkZXJzIEFERCBDT0xVTU4gcmVxdWlyZV9wYWlkX3RpZXIgSU5URUdFUiBOT1QgTlVMTCBERUZBVUxUIDA7YCk7XG4gIH0gY2F0Y2ggKGU6IGFueSkge1xuICAgIGlmICghZS5tZXNzYWdlLmluY2x1ZGVzKCdkdXBsaWNhdGUgY29sdW1uIG5hbWUnKSkge1xuICAgICAgY29uc29sZS5lcnJvcignRXJyb3IgYWRkaW5nIHJlcXVpcmVfcGFpZF90aWVyIGNvbHVtbiB0byBsbG1fcHJvdmlkZXJzOicsIGUpO1xuICAgIH1cbiAgfVxuXG4gIHRyeSB7XG4gICAgLy8gQWRkIHNvdXJjZV90b29sIGZvciBjcm9zcy1hZ2VudCBhdHRyaWJ1dGlvblxuICAgIGRiLmV4ZWMoYEFMVEVSIFRBQkxFIGNlcmVicm9fbWVtb3JpZXNfbWV0YSBBREQgQ09MVU1OIHNvdXJjZV90b29sIFRFWFQ7YCk7XG4gIH0gY2F0Y2ggKGU6IGFueSkge1xuICAgIGlmICghZS5tZXNzYWdlLmluY2x1ZGVzKCdkdXBsaWNhdGUgY29sdW1uIG5hbWUnKSkge1xuICAgICAgY29uc29sZS5lcnJvcignRXJyb3IgYWRkaW5nIHNvdXJjZV90b29sIGNvbHVtbiB0byBjZXJlYnJvX21lbW9yaWVzX21ldGE6JywgZSk7XG4gICAgfVxuICB9XG5cbiAgdHJ5IHtcbiAgICAvLyBBZGQgc291cmNlX3Rvb2wgZm9yIGNyb3NzLWFnZW50IGF0dHJpYnV0aW9uXG4gICAgZGIuZXhlYyhgQUxURVIgVEFCTEUgbWVtb3J5X3F1YXJhbnRpbmUgQUREIENPTFVNTiBzb3VyY2VfdG9vbCBURVhUO2ApO1xuICB9IGNhdGNoIChlOiBhbnkpIHtcbiAgICBpZiAoIWUubWVzc2FnZS5pbmNsdWRlcygnZHVwbGljYXRlIGNvbHVtbiBuYW1lJykpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIGFkZGluZyBzb3VyY2VfdG9vbCBjb2x1bW4gdG8gbWVtb3J5X3F1YXJhbnRpbmU6JywgZSk7XG4gICAgfVxuICB9XG4gIHRyeSB7XG4gICAgLy8gVGhlIGdsb2JhbCBsb2NrIChzeXN0ZW1fc2V0dGluZ3MuZnJlZV9tb2RlX3VubG9ja2VkKSBvbmx5IHNraXBzIGEgcHJvdmlkZXJcbiAgICAvLyBvbmNlIGEgdXNlciBleHBsaWNpdGx5IG1hcmtzIGl0IHBhaWQsIHNvIGEgY3VycmVudGx5LXdvcmtpbmcgZnJlZSBwcm94eVxuICAgIC8vIHNldHVwIGNhbiBuZXZlciBiZSBibG9ja2VkIGJ5IHNoaXBwaW5nIHRoaXMgbWlncmF0aW9uLlxuICAgIGRiLmV4ZWMoYEFMVEVSIFRBQkxFIGxsbV9wcm92aWRlcnMgQUREIENPTFVNTiBpc19wYWlkX3RpZXIgSU5URUdFUiBOT1QgTlVMTCBERUZBVUxUIDA7YCk7XG4gIH0gY2F0Y2ggKGU6IGFueSkge1xuICAgIGlmICghZS5tZXNzYWdlLmluY2x1ZGVzKCdkdXBsaWNhdGUgY29sdW1uIG5hbWUnKSkge1xuICAgICAgY29uc29sZS5lcnJvcignRXJyb3IgYWRkaW5nIGlzX3BhaWRfdGllciBjb2x1bW4gdG8gbGxtX3Byb3ZpZGVyczonLCBlKTtcbiAgICB9XG4gIH1cblxuICB0cnkge1xuICAgIGRiLmV4ZWMoYEFMVEVSIFRBQkxFIGNlcmVicm9fbWVtb3JpZXNfbWV0YSBBREQgQ09MVU1OIHByb2plY3RfaWQgVEVYVDtgKTtcbiAgfSBjYXRjaCAoZTogYW55KSB7XG4gICAgaWYgKCFlLm1lc3NhZ2UuaW5jbHVkZXMoJ2R1cGxpY2F0ZSBjb2x1bW4gbmFtZScpKSB7XG4gICAgICBjb25zb2xlLmVycm9yKCdFcnJvciBhZGRpbmcgcHJvamVjdF9pZCBjb2x1bW4gdG8gY2VyZWJyb19tZW1vcmllc19tZXRhOicsIGUpO1xuICAgIH1cbiAgfVxuXG4gIHRyeSB7XG4gICAgLy8gUmVmbGV4aW9uIGNvbnRyYWRpY3Rpb24tZGV0ZWN0aW9uOiB3aGVuIGEgbmV3bHktZXh0cmFjdGVkIGZhY3QgaXMgaGlnaGx5XG4gICAgLy8gc2ltaWxhciAoPjAuODUpIHRvIGFuIGV4aXN0aW5nIG1lbW9yeSBidXQgaXMgY2xhc3NpZmllZCBhcyBhIGdlbnVpbmVcbiAgICAvLyB1cGRhdGUvY29udHJhZGljdGlvbiAobm90IGEgcmV3b3JkZWQgZHVwbGljYXRlKSwgaXQgaXMgcXVldWVkIGhlcmUgZm9yXG4gICAgLy8gaHVtYW4gYXBwcm92YWwgaW5zdGVhZCBvZiBiZWluZyBzaWxlbnRseSBkaXNjYXJkZWQgb3IgaW5zZXJ0ZWQgYWxvbmdzaWRlXG4gICAgLy8gYSBwb3NzaWJseS1jb25mbGljdGluZyBtZW1vcnkuIE5VTEwgZm9yIG9yZGluYXJ5IChub24tY29uZmxpY3RpbmcpIGFwcHJvdmFscy5cbiAgICBkYi5leGVjKGBBTFRFUiBUQUJMRSBjZXJlYnJvX2xlYXJuaW5nX2FwcHJvdmFscyBBREQgQ09MVU1OIGNvbmZsaWN0X3dpdGhfaWQgVEVYVDtgKTtcbiAgfSBjYXRjaCAoZTogYW55KSB7XG4gICAgaWYgKCFlLm1lc3NhZ2UuaW5jbHVkZXMoJ2R1cGxpY2F0ZSBjb2x1bW4gbmFtZScpKSB7XG4gICAgICBjb25zb2xlLmVycm9yKCdFcnJvciBhZGRpbmcgY29uZmxpY3Rfd2l0aF9pZCBjb2x1bW4gdG8gY2VyZWJyb19sZWFybmluZ19hcHByb3ZhbHM6JywgZSk7XG4gICAgfVxuICB9XG5cbiAgdHJ5IHtcbiAgICBkYi5leGVjKGBBTFRFUiBUQUJMRSBjZXJlYnJvX2xlYXJuaW5nX2FwcHJvdmFscyBBREQgQ09MVU1OIGNvbmZsaWN0X3JlYXNvbmluZyBURVhUO2ApO1xuICB9IGNhdGNoIChlOiBhbnkpIHtcbiAgICBpZiAoIWUubWVzc2FnZS5pbmNsdWRlcygnZHVwbGljYXRlIGNvbHVtbiBuYW1lJykpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIGFkZGluZyBjb25mbGljdF9yZWFzb25pbmcgY29sdW1uIHRvIGNlcmVicm9fbGVhcm5pbmdfYXBwcm92YWxzOicsIGUpO1xuICAgIH1cbiAgfVxuXG4gIHRyeSB7XG4gICAgLy8gRXhwbGljaXQgcGVyLXByb2plY3QgcmVwbyBtYXBwaW5nIGZvciB0aGUgR2l0TmV4dXMgY29kZS1zdHJ1Y3R1cmUgbW9kYWxpdHkgXHUyMDE0XG4gICAgLy8gbGV0cyByZXNvbHZlUmVwb0ZvckNhbGwoKSBkaXNhbWJpZ3VhdGUgd2hlbiBtb3JlIHRoYW4gb25lIHJlcG8gaXMgaW5kZXhlZFxuICAgIC8vIG9uIHRoZSBtYWNoaW5lLCBpbnN0ZWFkIG9mIGdpdmluZyB1cCBvbiB0aGUgd2hvbGUgbW9kYWxpdHkgKGdpdG5leHVzLWNsaWVudC50cykuXG4gICAgZGIuZXhlYyhgQUxURVIgVEFCTEUgcHJvamVjdHMgQUREIENPTFVNTiBnaXRuZXh1c19yZXBvX25hbWUgVEVYVDtgKTtcbiAgfSBjYXRjaCAoZTogYW55KSB7XG4gICAgaWYgKCFlLm1lc3NhZ2UuaW5jbHVkZXMoJ2R1cGxpY2F0ZSBjb2x1bW4gbmFtZScpKSB7XG4gICAgICBjb25zb2xlLmVycm9yKCdFcnJvciBhZGRpbmcgZ2l0bmV4dXNfcmVwb19uYW1lIGNvbHVtbiB0byBwcm9qZWN0czonLCBlKTtcbiAgICB9XG4gIH1cblxuICAvLyBQZXItcHJvamVjdCBleGVjdXRpb24gcGVybWlzc2lvbiBhcmNoZXR5cGUgKHJlYWwgZW5mb3JjZW1lbnQsIGdhdGVkIGluXG4gIC8vIGNvcmUvY29yZWV4ZWMvd29ya2VyLnRzKS4gTnVsbGFibGUgd2l0aCBOTyBkZWZhdWx0OiBOVUxMIG1lYW5zIFwibm9cbiAgLy8gYXJjaGV0eXBlIGFzc2lnbmVkIFx1MjAxNCBiZWhhdmUgZXhhY3RseSBhcyB0b2RheSwgZnVsbHkgcGVybWlzc2l2ZVwiLiBBXG4gIC8vIG5vbi1OVUxMIHZhbHVlIChlLmcuICdjb2RlX2V4ZWN1dGUnIHwgJ3Jlc2VhcmNoX29ubHknIHwgJ2FkbWluX29wZXJhdG9yJylcbiAgLy8gb3B0cyB0aGUgcHJvamVjdCBpbnRvIGdhdGluZyBvZiB0aGUgc2hlbGwvc2NyYXBlIHRhc2sgYWN0aW9ucy5cbiAgdHJ5IHtcbiAgICBkYi5leGVjKGBBTFRFUiBUQUJMRSBwcm9qZWN0cyBBREQgQ09MVU1OIHBlcm1pc3Npb25fYXJjaGV0eXBlIFRFWFQ7YCk7XG4gIH0gY2F0Y2ggKGU6IGFueSkge1xuICAgIGlmICghZS5tZXNzYWdlLmluY2x1ZGVzKCdkdXBsaWNhdGUgY29sdW1uIG5hbWUnKSkge1xuICAgICAgY29uc29sZS5lcnJvcignRXJyb3IgYWRkaW5nIHBlcm1pc3Npb25fYXJjaGV0eXBlIGNvbHVtbiB0byBwcm9qZWN0czonLCBlKTtcbiAgICB9XG4gIH1cblxuICB0cnkge1xuICAgIGRiLmV4ZWMoYEFMVEVSIFRBQkxFIHByb2plY3RzIEFERCBDT0xVTU4gcHJvamVjdF9yb290X3BhdGggVEVYVDtgKTtcbiAgfSBjYXRjaCAoZTogYW55KSB7XG4gICAgaWYgKCFlLm1lc3NhZ2UuaW5jbHVkZXMoJ2R1cGxpY2F0ZSBjb2x1bW4gbmFtZScpKSB7XG4gICAgICBjb25zb2xlLmVycm9yKCdFcnJvciBhZGRpbmcgcHJvamVjdF9yb290X3BhdGggY29sdW1uIHRvIHByb2plY3RzOicsIGUpO1xuICAgIH1cbiAgfVxuXG4gIHRyeSB7XG4gICAgZGIuZXhlYyhgQUxURVIgVEFCTEUgd29ya2Zsb3dfcnVucyBBREQgQ09MVU1OIHRyYWNrIFRFWFQgTk9UIE5VTEwgREVGQVVMVCAndHJhY2syJztgKTtcbiAgfSBjYXRjaCAoZTogYW55KSB7XG4gICAgaWYgKCFlLm1lc3NhZ2UuaW5jbHVkZXMoJ2R1cGxpY2F0ZSBjb2x1bW4gbmFtZScpKSB7XG4gICAgICBjb25zb2xlLmVycm9yKCdFcnJvciBhZGRpbmcgdHJhY2sgY29sdW1uIHRvIHdvcmtmbG93X3J1bnM6JywgZSk7XG4gICAgfVxuICB9XG5cbiAgbWlncmF0ZVBlbmRpbmdQcm9wb3NhbEJsb2IoKTtcblxuICAvLyBcdTI1MDBcdTI1MDAgRklYLTQgKEF4aW9tIDEpOiBMb3ctSS9PIENvbnRleHQgRXZlbnQgTG9nIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuICAvLyBTZW1hbnRpYyBldmVudHMgKHJvdXRpbmcgZGVjaXNpb25zLCBVSSBpbnRlcmFjdGlvbnMsIHdvcmtmbG93IHN1bW1hcmllcylcbiAgLy8gYXJlIGNvYWxlc2NlZCBhbmQgd3JpdHRlbiBoZXJlIGluIGJhdGNoZXMgKG1heCAxIGZsdXNoIHBlciAzMHMgcGVyIHByb2plY3QpXG4gIC8vIHJhdGhlciB0aGFuIGFzIGEgcmVhbC10aW1lIGV2ZW50IGJ1cyB0aGF0IHdvdWxkIHNhdHVyYXRlIGVNTUMgNS4xIE5BTkQuXG4gIC8vIENlcmVicm8gcmVhZHMgcmVjZW50IGV2ZW50cyBwZXIgcHJvamVjdCBkdXJpbmcgaW50ZXJ2aWV3IHBoYXNlIHRvIGh5ZHJhdGVcbiAgLy8gcHJpb3IgY29udGV4dCB3aXRob3V0IHJlLXNjYW5uaW5nIHRoZSBmdWxsIE9LRiBrbm93bGVkZ2UgZ3JhcGguXG4gIHRyeSB7XG4gICAgZGIuZXhlYyhgXG4gICAgICBDUkVBVEUgVEFCTEUgSUYgTk9UIEVYSVNUUyBjb250ZXh0X2V2ZW50cyAoXG4gICAgICAgIGlkIFRFWFQgUFJJTUFSWSBLRVksXG4gICAgICAgIHByb2plY3RfaWQgVEVYVCxcbiAgICAgICAgdHlwZSBURVhUIE5PVCBOVUxMLFxuICAgICAgICBzdW1tYXJ5X3RleHQgVEVYVCBOT1QgTlVMTCxcbiAgICAgICAgY3JlYXRlZF9hdCBJTlRFR0VSIE5PVCBOVUxMLFxuICAgICAgICBGT1JFSUdOIEtFWShwcm9qZWN0X2lkKSBSRUZFUkVOQ0VTIHByb2plY3RzKGlkKSBPTiBERUxFVEUgQ0FTQ0FERVxuICAgICAgKTtcbiAgICAgIENSRUFURSBJTkRFWCBJRiBOT1QgRVhJU1RTIGlkeF9jb250ZXh0X2V2ZW50c19wcm9qZWN0IE9OIGNvbnRleHRfZXZlbnRzKHByb2plY3RfaWQsIGNyZWF0ZWRfYXQgREVTQyk7XG4gICAgYCk7XG4gIH0gY2F0Y2ggKGU6IGFueSkge1xuICAgIGlmICghZS5tZXNzYWdlPy5pbmNsdWRlcygnYWxyZWFkeSBleGlzdHMnKSkge1xuICAgICAgY29uc29sZS5lcnJvcignW0ZJWC00XSBFcnJvciBjcmVhdGluZyBjb250ZXh0X2V2ZW50cyB0YWJsZTonLCBlKTtcbiAgICB9XG4gIH1cblxuICAvLyBcdTI1MDBcdTI1MDAgRklYLTMgKEF4aW9tIDQpOiBWZXJpZnkgTm9kZSBUeXBlIFRyYWNraW5nIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuICAvLyBBZGRzIG5vZGVfdHlwZSB0byB0YXNrcyBzbyAndmVyaWZ5JyBzdGVwIG5vZGVzIGFyZSBkaXN0aW5ndWlzaGFibGUgZnJvbVxuICAvLyAnYWN0aW9uJyBub2RlcyBpbiB0aGUgZGlzcGF0Y2ggbG9vcCBhbmQgaW4gUG9ydEdyaWQgYXBwcm92YWwgVUkuXG4gIC8vIE5VTEwgPSBsZWdhY3kgYWN0aW9uIG5vZGUgKGZ1bGx5IGJhY2t3YXJkcy1jb21wYXRpYmxlKS5cbiAgdHJ5IHtcbiAgICBkYi5leGVjKGBBTFRFUiBUQUJMRSB0YXNrcyBBREQgQ09MVU1OIG5vZGVfdHlwZSBURVhUO2ApO1xuICB9IGNhdGNoIChlOiBhbnkpIHtcbiAgICBpZiAoIWUubWVzc2FnZT8uaW5jbHVkZXMoJ2R1cGxpY2F0ZSBjb2x1bW4gbmFtZScpKSB7XG4gICAgICBjb25zb2xlLmVycm9yKCdbRklYLTNdIEVycm9yIGFkZGluZyBub2RlX3R5cGUgY29sdW1uIHRvIHRhc2tzOicsIGUpO1xuICAgIH1cbiAgfVxuXG4gIHRyeSB7XG4gICAgZGIuZXhlYyhgQUxURVIgVEFCTEUgY2VyZWJyb19sZWFybmluZ19hcHByb3ZhbHMgQUREIENPTFVNTiBzb3VyY2VfdG9vbCBURVhUO2ApO1xuICB9IGNhdGNoIChlOiBhbnkpIHtcbiAgICBpZiAoIWUubWVzc2FnZS5pbmNsdWRlcygnZHVwbGljYXRlIGNvbHVtbiBuYW1lJykpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIGFkZGluZyBzb3VyY2VfdG9vbCBjb2x1bW4gdG8gY2VyZWJyb19sZWFybmluZ19hcHByb3ZhbHM6JywgZSk7XG4gICAgfVxuICB9XG5cbiAgLy8gRGVsdGEgU3luYyBFdmVudCBMb2dcbiAgdHJ5IHtcbiAgICBkYi5leGVjKGBcbiAgICAgIENSRUFURSBUQUJMRSBJRiBOT1QgRVhJU1RTIHN5bmNfZXZlbnRfbG9nIChcbiAgICAgICAgaWQgSU5URUdFUiBQUklNQVJZIEtFWSBBVVRPSU5DUkVNRU5ULFxuICAgICAgICB0YWJsZV9uYW1lIFRFWFQgTk9UIE5VTEwsXG4gICAgICAgIGFjdGlvbiBURVhUIE5PVCBOVUxMLFxuICAgICAgICB0aW1lc3RhbXAgSU5URUdFUiBOT1QgTlVMTCxcbiAgICAgICAgcGF5bG9hZCBURVhUIE5PVCBOVUxMXG4gICAgICApO1xuXG4gICAgICBDUkVBVEUgVEFCTEUgSUYgTk9UIEVYSVNUUyBzeW5jX2xvY2sgKGlzX3N5bmNpbmcgSU5URUdFUik7XG4gICAgICBJTlNFUlQgT1IgSUdOT1JFIElOVE8gc3luY19sb2NrIChyb3dpZCwgaXNfc3luY2luZykgVkFMVUVTICgxLCAwKTtcblxuICAgICAgRFJPUCBUUklHR0VSIElGIEVYSVNUUyBzeW5jX3Byb2plY3RzX2luc2VydDtcbiAgICAgIENSRUFURSBUUklHR0VSIHN5bmNfcHJvamVjdHNfaW5zZXJ0IEFGVEVSIElOU0VSVCBPTiBwcm9qZWN0c1xuICAgICAgV0hFTiAoU0VMRUNUIGlzX3N5bmNpbmcgRlJPTSBzeW5jX2xvY2sgV0hFUkUgcm93aWQgPSAxKSA9IDBcbiAgICAgIEJFR0lOXG4gICAgICAgIElOU0VSVCBJTlRPIHN5bmNfZXZlbnRfbG9nICh0YWJsZV9uYW1lLCBhY3Rpb24sIHRpbWVzdGFtcCwgcGF5bG9hZClcbiAgICAgICAgVkFMVUVTICgncHJvamVjdHMnLCAnSU5TRVJUJywgQ0FTVCgoanVsaWFuZGF5KCdub3cnKSAtIDI0NDA1ODcuNSkqODY0MDAwMDAgQVMgSU5URUdFUiksIGpzb25fb2JqZWN0KCdpZCcsIE5FVy5pZCwgJ25hbWUnLCBORVcubmFtZSwgJ2NyZWF0ZWRfYXQnLCBORVcuY3JlYXRlZF9hdCkpO1xuICAgICAgRU5EO1xuXG4gICAgICBEUk9QIFRSSUdHRVIgSUYgRVhJU1RTIHN5bmNfcHJvamVjdHNfdXBkYXRlO1xuICAgICAgQ1JFQVRFIFRSSUdHRVIgc3luY19wcm9qZWN0c191cGRhdGUgQUZURVIgVVBEQVRFIE9OIHByb2plY3RzXG4gICAgICBXSEVOIChTRUxFQ1QgaXNfc3luY2luZyBGUk9NIHN5bmNfbG9jayBXSEVSRSByb3dpZCA9IDEpID0gMFxuICAgICAgQkVHSU5cbiAgICAgICAgSU5TRVJUIElOVE8gc3luY19ldmVudF9sb2cgKHRhYmxlX25hbWUsIGFjdGlvbiwgdGltZXN0YW1wLCBwYXlsb2FkKVxuICAgICAgICBWQUxVRVMgKCdwcm9qZWN0cycsICdVUERBVEUnLCBDQVNUKChqdWxpYW5kYXkoJ25vdycpIC0gMjQ0MDU4Ny41KSo4NjQwMDAwMCBBUyBJTlRFR0VSKSwganNvbl9vYmplY3QoJ2lkJywgTkVXLmlkLCAnbmFtZScsIE5FVy5uYW1lLCAnY3JlYXRlZF9hdCcsIE5FVy5jcmVhdGVkX2F0KSk7XG4gICAgICBFTkQ7XG5cbiAgICAgIERST1AgVFJJR0dFUiBJRiBFWElTVFMgc3luY193b3JrZmxvd19ydW5zX2luc2VydDtcbiAgICAgIENSRUFURSBUUklHR0VSIHN5bmNfd29ya2Zsb3dfcnVuc19pbnNlcnQgQUZURVIgSU5TRVJUIE9OIHdvcmtmbG93X3J1bnNcbiAgICAgIFdIRU4gKFNFTEVDVCBpc19zeW5jaW5nIEZST00gc3luY19sb2NrIFdIRVJFIHJvd2lkID0gMSkgPSAwXG4gICAgICBCRUdJTlxuICAgICAgICBJTlNFUlQgSU5UTyBzeW5jX2V2ZW50X2xvZyAodGFibGVfbmFtZSwgYWN0aW9uLCB0aW1lc3RhbXAsIHBheWxvYWQpXG4gICAgICAgIFZBTFVFUyAoJ3dvcmtmbG93X3J1bnMnLCAnSU5TRVJUJywgQ0FTVCgoanVsaWFuZGF5KCdub3cnKSAtIDI0NDA1ODcuNSkqODY0MDAwMDAgQVMgSU5URUdFUiksIGpzb25fb2JqZWN0KCdpZCcsIE5FVy5pZCwgJ3Byb2plY3RfaWQnLCBORVcucHJvamVjdF9pZCwgJ3N0YXR1cycsIE5FVy5zdGF0dXMpKTtcbiAgICAgIEVORDtcblxuICAgICAgRFJPUCBUUklHR0VSIElGIEVYSVNUUyBzeW5jX3dvcmtmbG93X3J1bnNfdXBkYXRlO1xuICAgICAgQ1JFQVRFIFRSSUdHRVIgc3luY193b3JrZmxvd19ydW5zX3VwZGF0ZSBBRlRFUiBVUERBVEUgT04gd29ya2Zsb3dfcnVuc1xuICAgICAgV0hFTiAoU0VMRUNUIGlzX3N5bmNpbmcgRlJPTSBzeW5jX2xvY2sgV0hFUkUgcm93aWQgPSAxKSA9IDBcbiAgICAgIEJFR0lOXG4gICAgICAgIElOU0VSVCBJTlRPIHN5bmNfZXZlbnRfbG9nICh0YWJsZV9uYW1lLCBhY3Rpb24sIHRpbWVzdGFtcCwgcGF5bG9hZClcbiAgICAgICAgVkFMVUVTICgnd29ya2Zsb3dfcnVucycsICdVUERBVEUnLCBDQVNUKChqdWxpYW5kYXkoJ25vdycpIC0gMjQ0MDU4Ny41KSo4NjQwMDAwMCBBUyBJTlRFR0VSKSwganNvbl9vYmplY3QoJ2lkJywgTkVXLmlkLCAncHJvamVjdF9pZCcsIE5FVy5wcm9qZWN0X2lkLCAnc3RhdHVzJywgTkVXLnN0YXR1cykpO1xuICAgICAgRU5EO1xuXG4gICAgICBEUk9QIFRSSUdHRVIgSUYgRVhJU1RTIHN5bmNfdGFza3NfaW5zZXJ0O1xuICAgICAgQ1JFQVRFIFRSSUdHRVIgc3luY190YXNrc19pbnNlcnQgQUZURVIgSU5TRVJUIE9OIHRhc2tzXG4gICAgICBXSEVOIChTRUxFQ1QgaXNfc3luY2luZyBGUk9NIHN5bmNfbG9jayBXSEVSRSByb3dpZCA9IDEpID0gMFxuICAgICAgQkVHSU5cbiAgICAgICAgSU5TRVJUIElOVE8gc3luY19ldmVudF9sb2cgKHRhYmxlX25hbWUsIGFjdGlvbiwgdGltZXN0YW1wLCBwYXlsb2FkKVxuICAgICAgICBWQUxVRVMgKCd0YXNrcycsICdJTlNFUlQnLCBDQVNUKChqdWxpYW5kYXkoJ25vdycpIC0gMjQ0MDU4Ny41KSo4NjQwMDAwMCBBUyBJTlRFR0VSKSwganNvbl9vYmplY3QoJ2lkJywgTkVXLmlkLCAncnVuX2lkJywgTkVXLnJ1bl9pZCwgJ3N0YXR1cycsIE5FVy5zdGF0dXMpKTtcbiAgICAgIEVORDtcblxuICAgICAgRFJPUCBUUklHR0VSIElGIEVYSVNUUyBzeW5jX3Rhc2tzX3VwZGF0ZTtcbiAgICAgIENSRUFURSBUUklHR0VSIHN5bmNfdGFza3NfdXBkYXRlIEFGVEVSIFVQREFURSBPTiB0YXNrc1xuICAgICAgV0hFTiAoU0VMRUNUIGlzX3N5bmNpbmcgRlJPTSBzeW5jX2xvY2sgV0hFUkUgcm93aWQgPSAxKSA9IDBcbiAgICAgIEJFR0lOXG4gICAgICAgIElOU0VSVCBJTlRPIHN5bmNfZXZlbnRfbG9nICh0YWJsZV9uYW1lLCBhY3Rpb24sIHRpbWVzdGFtcCwgcGF5bG9hZClcbiAgICAgICAgVkFMVUVTICgndGFza3MnLCAnVVBEQVRFJywgQ0FTVCgoanVsaWFuZGF5KCdub3cnKSAtIDI0NDA1ODcuNSkqODY0MDAwMDAgQVMgSU5URUdFUiksIGpzb25fb2JqZWN0KCdpZCcsIE5FVy5pZCwgJ3J1bl9pZCcsIE5FVy5ydW5faWQsICdzdGF0dXMnLCBORVcuc3RhdHVzKSk7XG4gICAgICBFTkQ7XG4gICAgYCk7XG4gIH0gY2F0Y2ggKGU6IGFueSkge1xuICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIGNyZWF0aW5nIHN5bmNfZXZlbnRfbG9nIHRhYmxlOicsIGUpO1xuICB9XG5cbiAgdHJ5IHtcbiAgICBkYi5leGVjKGBBTFRFUiBUQUJMRSB0YXNrcyBBREQgQ09MVU1OIHN0YXJ0ZWRfYXQgSU5URUdFUjtgKTtcbiAgfSBjYXRjaCAoZTogYW55KSB7XG4gICAgaWYgKCFlLm1lc3NhZ2UuaW5jbHVkZXMoJ2R1cGxpY2F0ZSBjb2x1bW4gbmFtZScpKSB7XG4gICAgICBjb25zb2xlLmVycm9yKCdFcnJvciBhZGRpbmcgc3RhcnRlZF9hdCBjb2x1bW4gdG8gdGFza3M6JywgZSk7XG4gICAgfVxuICB9XG59XG5cbi8qKlxuICogT25lLXRpbWUgbWlncmF0aW9uOiBhbiBleGlzdGluZyBzdGFnZWQgcHJvcG9zYWwgdXNlZCB0byBsaXZlIGFzIGEgc2luZ2xlIEpTT05cbiAqIGJsb2IgaW4gc3lzdGVtX3NldHRpbmdzIHVuZGVyIHRoZSBrZXkgJ3BlbmRpbmdfcHJvcG9zYWwnLiBNb3ZlIGFueSBzdWNoIGJsb2JcbiAqIGludG8gdGhlIG5ldyBkYWdfcHJvcG9zYWxzIHRhYmxlIChkZWZhdWx0IGNvbmZpZGVuY2UgMC41LCBubyBwcm9qZWN0IHNjb3BlLFxuICogc3RhdHVzICdwZW5kaW5nJykgc28gaXQgZG9lcyBOT1Qgc2lsZW50bHkgdmFuaXNoIGZvciBhIHVzZXIgd2hvIGhhcyBvbmVcbiAqIHN0YWdlZCByaWdodCBub3csIHRoZW4gZGVsZXRlIHRoZSBvbGQga2V5LiBJZGVtcG90ZW50OiBhZnRlciB0aGUga2V5IGlzXG4gKiBjbGVhcmVkIHRoaXMgaXMgYSBuby1vcC4gT25seSBoYW5kbGVzIHRoZSBzaW5nbGUta2V5IGNhc2UgdGhhdCBleGlzdHMgdG9kYXkuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBtaWdyYXRlUGVuZGluZ1Byb3Bvc2FsQmxvYigpIHtcbiAgdHJ5IHtcbiAgICBjb25zdCBsZWdhY3kgPSBkYlxuICAgICAgLnByZXBhcmUoXCJTRUxFQ1QgdmFsdWUgRlJPTSBzeXN0ZW1fc2V0dGluZ3MgV0hFUkUga2V5ID0gJ3BlbmRpbmdfcHJvcG9zYWwnXCIpXG4gICAgICAuZ2V0KCkgYXMgeyB2YWx1ZTogc3RyaW5nIH0gfCB1bmRlZmluZWQ7XG4gICAgaWYgKCFsZWdhY3kpIHJldHVybjtcblxuICAgIGRiLnRyYW5zYWN0aW9uKCgpID0+IHtcbiAgICAgIGRiLnByZXBhcmUoXG4gICAgICAgICdJTlNFUlQgSU5UTyBkYWdfcHJvcG9zYWxzIChpZCwgcHJvamVjdF9pZCwgcHJvcG9zYWwsIGNvbmZpZGVuY2UsIHN0YXR1cywgY3JlYXRlZF9hdCkgVkFMVUVTICg/LCA/LCA/LCA/LCA/LCA/KScsXG4gICAgICApLnJ1bihyYW5kb21VVUlEKCksIG51bGwsIGxlZ2FjeS52YWx1ZSwgMC41LCAncGVuZGluZycsIERhdGUubm93KCkpO1xuICAgICAgZGIucHJlcGFyZShcIkRFTEVURSBGUk9NIHN5c3RlbV9zZXR0aW5ncyBXSEVSRSBrZXkgPSAncGVuZGluZ19wcm9wb3NhbCdcIikucnVuKCk7XG4gICAgfSkoKTtcbiAgfSBjYXRjaCAoZTogYW55KSB7XG4gICAgY29uc29sZS5lcnJvcignRXJyb3IgbWlncmF0aW5nIGxlZ2FjeSBwZW5kaW5nX3Byb3Bvc2FsIGJsb2I6JywgZSk7XG4gIH1cbn1cbiIsICJpbXBvcnQgeyBkYiB9IGZyb20gJy4uLy4uL2Jhc2V2YXVsdC9kYic7XG5pbXBvcnQgY3J5cHRvIGZyb20gJ2NyeXB0byc7XG5cbi8qKlxuICogQ2VyZWJyb0Rhc2hib2FyZCdzIFwiQmFzZSBTY29yZVwiIC8gXCJNYXRjaCBCb29zdFwiIHNsaWRlcnMgKE1lbW9yeSBTZWFyY2hcbiAqIFNldHRpbmdzLCBrZXl3b3JkLWZhbGxiYWNrIHNlY3Rpb24pIHBlcnNpc3RlZCBgY2VyZWJyb19rZXl3b3JkX2Jhc2VgIC9cbiAqIGBjZXJlYnJvX2tleXdvcmRfYm9vc3RgIHRvIHN5c3RlbV9zZXR0aW5ncyBzaW5jZSB0aGVpciBpbnRyb2R1Y3Rpb24sIGJ1dFxuICogbm90aGluZyBldmVyIHJlYWQgZWl0aGVyIGtleSBiYWNrIFx1MjAxNCBgX2tleXdvcmRGYWxsYmFja1NlYXJjaGAgYWx3YXlzIHVzZWRcbiAqIHRoZSBoYXJkY29kZWQgZm9ybXVsYSBgMC43ICsgKG1hdGNoQ291bnQgKiAwLjA1KWAuIFRoZXNlIGFyZSB0aGUgZGVmYXVsdHMsXG4gKiBtYXRjaGluZyB0aGF0IGZvcm11bGEgZXhhY3RseSBzbyBhIGZyZXNoIGluc3RhbGwgKG5vIHNldHRpbmdzIHJvdyB5ZXQsIG9yXG4gKiBhbnkgdGVzdCB0aGF0IG5ldmVyIHRvdWNoZXMgc3lzdGVtX3NldHRpbmdzKSBiZWhhdmVzIGlkZW50aWNhbGx5IHRvXG4gKiBiZWZvcmUgdGhpcyBjaGFuZ2UuXG4gKi9cbmV4cG9ydCBjb25zdCBERUZBVUxUX0tFWVdPUkRfQkFTRSA9IDAuNztcbmV4cG9ydCBjb25zdCBERUZBVUxUX0tFWVdPUkRfQk9PU1QgPSAwLjA1O1xuXG5jb25zdCBLRVlXT1JEX1NFVFRJTkdTX0NBQ0hFX1RUTF9NUyA9IDIwMDA7XG5sZXQgY2FjaGVkS2V5d29yZEJhc2UgPSBERUZBVUxUX0tFWVdPUkRfQkFTRTtcbmxldCBjYWNoZWRLZXl3b3JkQm9vc3QgPSBERUZBVUxUX0tFWVdPUkRfQk9PU1Q7XG5sZXQgY2FjaGVkS2V5d29yZFNldHRpbmdzQXQgPSAwO1xuXG4vKipcbiAqIFNob3J0LVRUTCBjYWNoZWQgcmVhZCBvZiB0aGUgdHdvIGtleXdvcmQtZmFsbGJhY2sgc2V0dGluZ3MsIHNhbWUgcGF0dGVyblxuICogYXMgYGlzRnJlZU1vZGVVbmxvY2tlZGAgaW4gYHNyYy9jb3JlL3JvdXRlc3dpdGNoL2dvdmVybm9yLnRzYCBcdTIwMTQgYSBVSVxuICogY2hhbmdlIHRha2VzIGVmZmVjdCB3aXRoaW4gYSBjb3VwbGUgc2Vjb25kcyB3aXRob3V0IGEgREIgaGl0IG9uIGV2ZXJ5XG4gKiBzZWFyY2ggY2FsbC4gRXhwb3J0ZWQgc28gYHNlYXJjaGAvYF9rZXl3b3JkRmFsbGJhY2tTZWFyY2hgIGNhbGxlcnMgb3V0c2lkZVxuICogdGhpcyBtb2R1bGUgKGUuZy4gdGVzdHMpIGNhbiBhbHNvIHJlYWQgdGhlIGN1cnJlbnRseS1lZmZlY3RpdmUgdmFsdWVzLlxuICovXG5leHBvcnQgZnVuY3Rpb24gZ2V0S2V5d29yZFNjb3JpbmdTZXR0aW5ncygpOiB7IGJhc2VTY29yZTogbnVtYmVyOyBtYXRjaEJvb3N0OiBudW1iZXIgfSB7XG4gIGNvbnN0IG5vdyA9IERhdGUubm93KCk7XG4gIGlmIChub3cgLSBjYWNoZWRLZXl3b3JkU2V0dGluZ3NBdCA+IEtFWVdPUkRfU0VUVElOR1NfQ0FDSEVfVFRMX01TKSB7XG4gICAgY2FjaGVkS2V5d29yZFNldHRpbmdzQXQgPSBub3c7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHJvd3MgPSBkYlxuICAgICAgICAucHJlcGFyZShcbiAgICAgICAgICBgU0VMRUNUIGtleSwgdmFsdWUgRlJPTSBzeXN0ZW1fc2V0dGluZ3MgV0hFUkUga2V5IElOICgnY2VyZWJyb19rZXl3b3JkX2Jhc2UnLCAnY2VyZWJyb19rZXl3b3JkX2Jvb3N0JylgLFxuICAgICAgICApXG4gICAgICAgIC5hbGwoKSBhcyB7IGtleTogc3RyaW5nOyB2YWx1ZTogc3RyaW5nIH1bXTtcblxuICAgICAgbGV0IGJhc2VTY29yZSA9IERFRkFVTFRfS0VZV09SRF9CQVNFO1xuICAgICAgbGV0IG1hdGNoQm9vc3QgPSBERUZBVUxUX0tFWVdPUkRfQk9PU1Q7XG4gICAgICBmb3IgKGNvbnN0IHJvdyBvZiByb3dzKSB7XG4gICAgICAgIGNvbnN0IG4gPSBOdW1iZXIocm93LnZhbHVlKTtcbiAgICAgICAgaWYgKCFOdW1iZXIuaXNGaW5pdGUobikpIGNvbnRpbnVlO1xuICAgICAgICBpZiAocm93LmtleSA9PT0gJ2NlcmVicm9fa2V5d29yZF9iYXNlJykgYmFzZVNjb3JlID0gbjtcbiAgICAgICAgaWYgKHJvdy5rZXkgPT09ICdjZXJlYnJvX2tleXdvcmRfYm9vc3QnKSBtYXRjaEJvb3N0ID0gbjtcbiAgICAgIH1cbiAgICAgIGNhY2hlZEtleXdvcmRCYXNlID0gYmFzZVNjb3JlO1xuICAgICAgY2FjaGVkS2V5d29yZEJvb3N0ID0gbWF0Y2hCb29zdDtcbiAgICB9IGNhdGNoIHtcbiAgICAgIC8vIERCIG5vdCBpbml0aWFsaXplZCB5ZXQsIG9yIHRhYmxlIG1pc3NpbmcgXHUyMDE0IHNhZmUgZGVmYXVsdHMuXG4gICAgICBjYWNoZWRLZXl3b3JkQmFzZSA9IERFRkFVTFRfS0VZV09SRF9CQVNFO1xuICAgICAgY2FjaGVkS2V5d29yZEJvb3N0ID0gREVGQVVMVF9LRVlXT1JEX0JPT1NUO1xuICAgIH1cbiAgfVxuICByZXR1cm4geyBiYXNlU2NvcmU6IGNhY2hlZEtleXdvcmRCYXNlLCBtYXRjaEJvb3N0OiBjYWNoZWRLZXl3b3JkQm9vc3QgfTtcbn1cblxuLyoqIFRlc3Qtb25seTogZm9yY2UgdGhlIGtleXdvcmQtc2NvcmluZyBzZXR0aW5ncyBjYWNoZSB0byByZS1yZWFkLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIF9yZXNldEtleXdvcmRTY29yaW5nQ2FjaGUoKTogdm9pZCB7XG4gIGNhY2hlZEtleXdvcmRTZXR0aW5nc0F0ID0gMDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBNZW1vcnlSZWNvcmQge1xuICBpZDogc3RyaW5nO1xuICBjb250ZW50OiBzdHJpbmc7XG4gIHR5cGU6IHN0cmluZztcbiAgcHJvamVjdF9pZD86IHN0cmluZyB8IG51bGw7XG4gIGxhc3RfYWNjZXNzZWRfYXQ6IG51bWJlcjtcbiAgYWNjZXNzX2NvdW50OiBudW1iZXI7XG4gIGNyZWF0ZWRfYXQ6IG51bWJlcjtcbiAgc2ltaWxhcml0eT86IG51bWJlcjtcbn1cblxuZXhwb3J0IGNsYXNzIENlcmVicm9WZWN0b3JTdG9yZSB7XG4gIC8qKlxuICAgKiBJbnNlcnRzIGEgbWVtb3J5IGludG8gdGhlIHZlY3RvciBzdG9yZS5cbiAgICogSWYgZW1iZWRkaW5nIGlzIG51bGwsIGl0IHJlbGllcyBlbnRpcmVseSBvbiB0aGUgS2V5d29yZCBGYWxsYmFjayBFbmdpbmUgZm9yIHJldHJpZXZhbC5cbiAgICogcHJvamVjdElkIG51bGwvdW5kZWZpbmVkID0gR0xPQkFML1VTRVItdGllciBtZW1vcnksIHZpc2libGUgdG8gZXZlcnkgcHJvamVjdC5cbiAgICovXG4gIHB1YmxpYyBzdGF0aWMgaW5zZXJ0KGNvbnRlbnQ6IHN0cmluZywgdHlwZTogc3RyaW5nLCBlbWJlZGRpbmc/OiBGbG9hdDMyQXJyYXksIHByb2plY3RJZD86IHN0cmluZyB8IG51bGwsIGlzQXV0b0luZ2VzdGVkOiBib29sZWFuID0gZmFsc2UsIHNvdXJjZVRvb2w/OiBzdHJpbmcpOiBzdHJpbmcge1xuICAgIGNvbnN0IGlkID0gY3J5cHRvLnJhbmRvbVVVSUQoKTtcbiAgICBjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuXG4gICAgaWYgKGlzQXV0b0luZ2VzdGVkKSB7XG4gICAgICBkYi5wcmVwYXJlKGBcbiAgICAgICAgSU5TRVJUIElOVE8gbWVtb3J5X3F1YXJhbnRpbmUgKGlkLCBjb250ZW50LCB0eXBlLCBwcm9qZWN0X2lkLCBsYXN0X2FjY2Vzc2VkX2F0LCBhY2Nlc3NfY291bnQsIGNyZWF0ZWRfYXQsIHRhaW50X2ZsYWcsIHNvdXJjZV90b29sKVxuICAgICAgICBWQUxVRVMgKD8sID8sID8sID8sID8sID8sID8sID8sID8pXG4gICAgICBgKS5ydW4oaWQsIGNvbnRlbnQsIHR5cGUsIHByb2plY3RJZCA/PyBudWxsLCBub3csIDAsIG5vdywgMSwgc291cmNlVG9vbCA/PyBudWxsKTtcblxuICAgICAgaWYgKGVtYmVkZGluZykge1xuICAgICAgICBkYi5wcmVwYXJlKGBcbiAgICAgICAgICBJTlNFUlQgSU5UTyBtZW1vcnlfcXVhcmFudGluZV92ZWMgKGlkLCBlbWJlZGRpbmcpXG4gICAgICAgICAgVkFMVUVTICg/LCB2ZWNfcXVhbnRpemVfYmluYXJ5KD8pKVxuICAgICAgICBgKS5ydW4oaWQsIGVtYmVkZGluZyk7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIDEuIEluc2VydCBNZXRhXG4gICAgICBkYi5wcmVwYXJlKGBcbiAgICAgICAgSU5TRVJUIElOVE8gY2VyZWJyb19tZW1vcmllc19tZXRhIChpZCwgY29udGVudCwgdHlwZSwgcHJvamVjdF9pZCwgbGFzdF9hY2Nlc3NlZF9hdCwgYWNjZXNzX2NvdW50LCBjcmVhdGVkX2F0LCBzb3VyY2VfdG9vbClcbiAgICAgICAgVkFMVUVTICg/LCA/LCA/LCA/LCA/LCA/LCA/LCA/KVxuICAgICAgYCkucnVuKGlkLCBjb250ZW50LCB0eXBlLCBwcm9qZWN0SWQgPz8gbnVsbCwgbm93LCAwLCBub3csIHNvdXJjZVRvb2wgPz8gbnVsbCk7XG5cbiAgICAgIC8vIDIuIEluc2VydCBWZWN0b3IgaWYgcHJvdmlkZWRcbiAgICAgIGlmIChlbWJlZGRpbmcpIHtcbiAgICAgICAgZGIucHJlcGFyZShgXG4gICAgICAgICAgSU5TRVJUIElOVE8gY2VyZWJyb19tZW1vcmllc192ZWMgKGlkLCBlbWJlZGRpbmcpXG4gICAgICAgICAgVkFMVUVTICg/LCB2ZWNfcXVhbnRpemVfYmluYXJ5KD8pKVxuICAgICAgICBgKS5ydW4oaWQsIGVtYmVkZGluZyk7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiBpZDtcbiAgfVxuXG4gIC8qKlxuICAgKiBTZWFyY2hlcyB0aGUgbWVtb3J5LlxuICAgKiBJZiBxdWVyeUVtYmVkZGluZyBpcyBub3QgcHJvdmlkZWQgKG9mZmxpbmUgbG9jYWwgbW9kZSksIGl0IHNlYW1sZXNzbHkgZGVncmFkZXMgdG8gdGhlIEtleXdvcmQgRmFsbGJhY2sgRW5naW5lLlxuICAgKiBXaGVuIHByb2plY3RJZCBpcyBwcm92aWRlZCwgcmVzdWx0cyBhcmUgc2NvcGVkIHRvIHRoYXQgcHJvamVjdCdzIFBST0pFQ1QtdGllclxuICAgKiBtZW1vcmllcyBwbHVzIHVudGFnZ2VkIChHTE9CQUwvVVNFUi10aWVyKSBtZW1vcmllcyBcdTIwMTQgbmV2ZXIgYW5vdGhlciBwcm9qZWN0J3MuXG4gICAqL1xuICBwdWJsaWMgc3RhdGljIHNlYXJjaChxdWVyeTogc3RyaW5nLCB0eXBlRmlsdGVyPzogc3RyaW5nLCBxdWVyeUVtYmVkZGluZz86IEZsb2F0MzJBcnJheSwgbGltaXQ6IG51bWJlciA9IDUsIHByb2plY3RJZD86IHN0cmluZyk6IE1lbW9yeVJlY29yZFtdIHtcbiAgICBpZiAocXVlcnlFbWJlZGRpbmcpIHtcbiAgICAgIHJldHVybiB0aGlzLl92ZWN0b3JTZWFyY2gocXVlcnlFbWJlZGRpbmcsIHR5cGVGaWx0ZXIsIGxpbWl0LCBwcm9qZWN0SWQpO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gdGhpcy5fa2V5d29yZEZhbGxiYWNrU2VhcmNoKHF1ZXJ5LCB0eXBlRmlsdGVyLCBsaW1pdCwgcHJvamVjdElkKTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIHN0YXRpYyBfdmVjdG9yU2VhcmNoKGVtYmVkZGluZzogRmxvYXQzMkFycmF5LCB0eXBlRmlsdGVyPzogc3RyaW5nLCBsaW1pdDogbnVtYmVyID0gNSwgcHJvamVjdElkPzogc3RyaW5nKTogTWVtb3J5UmVjb3JkW10ge1xuICAgIGNvbnN0IGZpbHRlclNRTCA9IHR5cGVGaWx0ZXIgPyBgQU5EIG0udHlwZSA9ICcke3R5cGVGaWx0ZXJ9J2AgOiAnJztcbiAgICBjb25zdCBzY29wZVNRTCA9IHByb2plY3RJZCA/IGBBTkQgKG0ucHJvamVjdF9pZCA9ID8gT1IgbS5wcm9qZWN0X2lkIElTIE5VTEwpYCA6ICcnO1xuXG4gICAgY29uc3Qga25uUXVlcnkgPSBkYi5wcmVwYXJlKGBcbiAgICAgIFNFTEVDVCBtLmlkLCBtLmNvbnRlbnQsIG0udHlwZSwgbS5wcm9qZWN0X2lkLCBtLmxhc3RfYWNjZXNzZWRfYXQsIG0uYWNjZXNzX2NvdW50LCBtLmNyZWF0ZWRfYXQsIHYuZGlzdGFuY2VcbiAgICAgIEZST00gY2VyZWJyb19tZW1vcmllc192ZWMgdlxuICAgICAgSk9JTiBjZXJlYnJvX21lbW9yaWVzX21ldGEgbSBPTiB2LmlkID0gbS5pZFxuICAgICAgV0hFUkUgdi5lbWJlZGRpbmcgTUFUQ0ggdmVjX3F1YW50aXplX2JpbmFyeSg/KSBBTkQgayA9ID9cbiAgICAgICR7ZmlsdGVyU1FMfVxuICAgICAgJHtzY29wZVNRTH1cbiAgICAgIE9SREVSIEJZIHYuZGlzdGFuY2UgQVNDXG4gICAgYCk7XG5cbiAgICBjb25zdCBwYXJhbXM6IHVua25vd25bXSA9IFtlbWJlZGRpbmcsIGxpbWl0XTtcbiAgICBpZiAocHJvamVjdElkKSBwYXJhbXMucHVzaChwcm9qZWN0SWQpO1xuICAgIGNvbnN0IHJvd3MgPSBrbm5RdWVyeS5hbGwoLi4ucGFyYW1zKSBhcyBhbnlbXTtcblxuICAgIHJldHVybiByb3dzLm1hcChyID0+ICh7XG4gICAgICBpZDogci5pZCxcbiAgICAgIGNvbnRlbnQ6IHIuY29udGVudCxcbiAgICAgIHR5cGU6IHIudHlwZSxcbiAgICAgIHByb2plY3RfaWQ6IHIucHJvamVjdF9pZCxcbiAgICAgIGxhc3RfYWNjZXNzZWRfYXQ6IHIubGFzdF9hY2Nlc3NlZF9hdCxcbiAgICAgIGFjY2Vzc19jb3VudDogci5hY2Nlc3NfY291bnQsXG4gICAgICBjcmVhdGVkX2F0OiByLmNyZWF0ZWRfYXQsXG4gICAgICBzaW1pbGFyaXR5OiBNYXRoLm1heCgwLCAxLjAgLSByLmRpc3RhbmNlKSAvLyBOb3JtYWxpemUgZGlzdGFuY2UgaW50byBzaW1pbGFyaXR5IHNjb3JlXG4gICAgfSkpO1xuICB9XG5cbiAgcHJpdmF0ZSBzdGF0aWMgX2tleXdvcmRGYWxsYmFja1NlYXJjaChxdWVyeTogc3RyaW5nLCB0eXBlRmlsdGVyPzogc3RyaW5nLCBsaW1pdDogbnVtYmVyID0gNSwgcHJvamVjdElkPzogc3RyaW5nKTogTWVtb3J5UmVjb3JkW10ge1xuICAgIC8vIERldGVybWluaXN0aWMgZmFsbGJhY2s6IFRva2VuIGZpbHRlciBsZW5ndGggPiAzXG4gICAgLy8gRm9ybXVsYTogU2ltaWxhcml0eSA9IGJhc2VTY29yZSArIChtYXRjaENvdW50ICogbWF0Y2hCb29zdCksIHJlYWQgZnJvbVxuICAgIC8vIENlcmVicm9EYXNoYm9hcmQncyBcIkJhc2UgU2NvcmVcIiAvIFwiTWF0Y2ggQm9vc3RcIiBzZXR0aW5ncyAoZGVmYXVsdHNcbiAgICAvLyAwLjcgLyAwLjA1LCBtYXRjaGluZyB0aGUgcHJlLWV4aXN0aW5nIGhhcmRjb2RlZCBmb3JtdWxhKS5cbiAgICBjb25zdCB7IGJhc2VTY29yZSwgbWF0Y2hCb29zdCB9ID0gZ2V0S2V5d29yZFNjb3JpbmdTZXR0aW5ncygpO1xuXG4gICAgY29uc3QgcXVlcnlUb2tlbnMgPSBxdWVyeS50b0xvd2VyQ2FzZSgpLnNwbGl0KC9cXFcrLykuZmlsdGVyKHQgPT4gdC5sZW5ndGggPiAzKTtcblxuICAgIGNvbnN0IGNvbmRpdGlvbnM6IHN0cmluZ1tdID0gW107XG4gICAgY29uc3QgcGFyYW1zOiB1bmtub3duW10gPSBbXTtcbiAgICBpZiAodHlwZUZpbHRlcikge1xuICAgICAgY29uZGl0aW9ucy5wdXNoKCd0eXBlID0gPycpO1xuICAgICAgcGFyYW1zLnB1c2godHlwZUZpbHRlcik7XG4gICAgfVxuICAgIGlmIChwcm9qZWN0SWQpIHtcbiAgICAgIGNvbmRpdGlvbnMucHVzaCgnKHByb2plY3RfaWQgPSA/IE9SIHByb2plY3RfaWQgSVMgTlVMTCknKTtcbiAgICAgIHBhcmFtcy5wdXNoKHByb2plY3RJZCk7XG4gICAgfVxuICAgIGNvbnN0IHdoZXJlID0gY29uZGl0aW9ucy5sZW5ndGggPiAwID8gYFdIRVJFICR7Y29uZGl0aW9ucy5qb2luKCcgQU5EICcpfWAgOiAnJztcbiAgICBjb25zdCBzcWwgPSBgU0VMRUNUICogRlJPTSBjZXJlYnJvX21lbW9yaWVzX21ldGEgJHt3aGVyZX1gO1xuXG4gICAgY29uc3QgYWxsUmVjb3JkcyA9IHBhcmFtcy5sZW5ndGggPiAwID8gZGIucHJlcGFyZShzcWwpLmFsbCguLi5wYXJhbXMpIDogZGIucHJlcGFyZShzcWwpLmFsbCgpO1xuXG4gICAgY29uc3Qgc2NvcmVkUmVjb3JkcyA9IChhbGxSZWNvcmRzIGFzIGFueVtdKS5tYXAocmVjb3JkID0+IHtcbiAgICAgIGNvbnN0IGNvbnRlbnRUb2tlbnMgPSByZWNvcmQuY29udGVudC50b0xvd2VyQ2FzZSgpLnNwbGl0KC9cXFcrLykuZmlsdGVyKCh0OiBzdHJpbmcpID0+IHQubGVuZ3RoID4gMyk7XG4gICAgICBcbiAgICAgIGxldCBtYXRjaENvdW50ID0gMDtcbiAgICAgIGZvciAoY29uc3QgcXQgb2YgcXVlcnlUb2tlbnMpIHtcbiAgICAgICAgaWYgKGNvbnRlbnRUb2tlbnMuaW5jbHVkZXMocXQpKSB7XG4gICAgICAgICAgbWF0Y2hDb3VudCsrO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHNpbWlsYXJpdHkgPSBtYXRjaENvdW50ID4gMCA/IGJhc2VTY29yZSArIChtYXRjaENvdW50ICogbWF0Y2hCb29zdCkgOiAwO1xuICAgICAgXG4gICAgICByZXR1cm4ge1xuICAgICAgICAuLi5yZWNvcmQsXG4gICAgICAgIHNpbWlsYXJpdHlcbiAgICAgIH07XG4gICAgfSk7XG5cbiAgICByZXR1cm4gc2NvcmVkUmVjb3Jkc1xuICAgICAgLmZpbHRlcihyID0+IHIuc2ltaWxhcml0eSA+IDApXG4gICAgICAuc29ydCgoYSwgYikgPT4gYi5zaW1pbGFyaXR5IC0gYS5zaW1pbGFyaXR5KVxuICAgICAgLnNsaWNlKDAsIGxpbWl0KTtcbiAgfVxufVxuIiwgImltcG9ydCB7IE1lbW9yeVJlY29yZCB9IGZyb20gJy4vdmVjdG9yJztcblxuLyoqIERlZmF1bHQgZGVjYXktcmF0ZSBjb2VmZmljaWVudCAoXHUwMzk0dCBtdWx0aXBsaWVyKSBpbiB0aGUgYmlvbG9naWNhbCBkZWNheSBmb3JtdWxhLiAqL1xuZXhwb3J0IGNvbnN0IERFRkFVTFRfREVDQVlfUkFURSA9IDAuMztcbi8qKiBEZWZhdWx0IGFjY2Vzcy1jb3VudCBib29zdCBtdWx0aXBsaWVyIGluIHRoZSBiaW9sb2dpY2FsIGRlY2F5IGZvcm11bGEuICovXG5leHBvcnQgY29uc3QgREVGQVVMVF9BQ0NFU1NfQk9PU1QgPSAxLjU7XG5cbi8qKlxuICogUHVyZSBkZWNheS1mYWN0b3IgZnVuY3Rpb246IGVeKC0oZGF5c1NpbmNlQWNjZXNzICogZGVjYXlSYXRlKSkuXG4gKiBTaGFyZWQgYnkgSGFiaXR1YXRpb25TY29yZXIucmFuayBhbmQgdGhlIHNlcnZlci1zaWRlIGRlY2F5LXN0YXRzL3BydW5lXG4gKiByb3V0ZXMgc28gdGhlcmUgaXMgYSBzaW5nbGUgc291cmNlIG9mIHRydXRoIGZvciB0aGUgZm9ybXVsYS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNvbXB1dGVEZWNheUZhY3RvcihkYXlzU2luY2VBY2Nlc3M6IG51bWJlciwgZGVjYXlSYXRlOiBudW1iZXIgPSBERUZBVUxUX0RFQ0FZX1JBVEUpOiBudW1iZXIge1xuICByZXR1cm4gTWF0aC5leHAoLShkYXlzU2luY2VBY2Nlc3MgKiBkZWNheVJhdGUpKTtcbn1cblxuZXhwb3J0IGNsYXNzIEhhYml0dWF0aW9uU2NvcmVyIHtcbiAgLyoqXG4gICAqIEFwcGxpZXMgdGhlIGJpb2xvZ2ljYWwgZGVjYXkgZm9ybXVsYSB0byByYW5rIG1lbW9yaWVzOlxuICAgKiBSX2ZpbmFsID0gUl9zZW1hbnRpYyAqIChmX2FjY2VzcyAqIGJvb3N0TXVsdGlwbGllcikgKiBlXigtKFx1MDM5NHQgKiBkZWNheVJhdGUpKVxuICAgKlxuICAgKiBAcGFyYW0gcmVjb3JkcyBUaGUgaW5pdGlhbCBzZW1hbnRpYyByZWNvcmRzIChmcm9tIHZlY3RvciBvciBmYWxsYmFjayBzZWFyY2gpXG4gICAqIEBwYXJhbSBjdXJyZW50VGltZSBDdXJyZW50IHRpbWVzdGFtcCBpbiBtcyAoZGVmYXVsdHMgdG8gRGF0ZS5ub3coKSlcbiAgICogQHBhcmFtIGRlY2F5UmF0ZSBcdTAzOTR0IG11bHRpcGxpZXIgaW4gdGhlIGRlY2F5IGV4cG9uZW50IChkZWZhdWx0cyB0byBERUZBVUxUX0RFQ0FZX1JBVEUpXG4gICAqIEBwYXJhbSBib29zdE11bHRpcGxpZXIgQWNjZXNzLWNvdW50IGJvb3N0IG11bHRpcGxpZXIgKGRlZmF1bHRzIHRvIERFRkFVTFRfQUNDRVNTX0JPT1NUKVxuICAgKiBAcmV0dXJucyBSZS1yYW5rZWQgcmVjb3JkcyBzb3J0ZWQgYnkgUl9maW5hbCBkZXNjZW5kaW5nXG4gICAqL1xuICBwdWJsaWMgc3RhdGljIHJhbmsoXG4gICAgcmVjb3JkczogTWVtb3J5UmVjb3JkW10sXG4gICAgY3VycmVudFRpbWU6IG51bWJlciA9IERhdGUubm93KCksXG4gICAgZGVjYXlSYXRlOiBudW1iZXIgPSBERUZBVUxUX0RFQ0FZX1JBVEUsXG4gICAgYm9vc3RNdWx0aXBsaWVyOiBudW1iZXIgPSBERUZBVUxUX0FDQ0VTU19CT09TVFxuICApOiBNZW1vcnlSZWNvcmRbXSB7XG4gICAgcmV0dXJuIHJlY29yZHMubWFwKHJlY29yZCA9PiB7XG4gICAgICAvLyBEZWx0YSBUIGluIGRheXNcbiAgICAgIGNvbnN0IGRheXNTaW5jZUFjY2VzcyA9IE1hdGgubWF4KDAsIChjdXJyZW50VGltZSAtIHJlY29yZC5sYXN0X2FjY2Vzc2VkX2F0KSAvICgxMDAwICogNjAgKiA2MCAqIDI0KSk7XG5cbiAgICAgIC8vIGZfYWNjZXNzOiBUcmVhdCAwIGFjY2Vzc2VzIGFzIDEgZm9yIGJhc2UgbXVsdGlwbGllclxuICAgICAgY29uc3QgZl9hY2Nlc3MgPSBNYXRoLm1heCgxLCByZWNvcmQuYWNjZXNzX2NvdW50KTtcblxuICAgICAgY29uc3Qgcl9zZW1hbnRpYyA9IHJlY29yZC5zaW1pbGFyaXR5IHx8IDAuMTsgLy8gQmFzZWxpbmUgaWYgbWlzc2luZ1xuXG4gICAgICAvLyBGb3JtdWxhXG4gICAgICBjb25zdCBkZWNheUZhY3RvciA9IGNvbXB1dGVEZWNheUZhY3RvcihkYXlzU2luY2VBY2Nlc3MsIGRlY2F5UmF0ZSk7XG4gICAgICBjb25zdCBib29zdEZhY3RvciA9IGZfYWNjZXNzICogYm9vc3RNdWx0aXBsaWVyO1xuXG4gICAgICBjb25zdCByX2ZpbmFsID0gcl9zZW1hbnRpYyAqIGJvb3N0RmFjdG9yICogZGVjYXlGYWN0b3I7XG5cbiAgICAgIHJldHVybiB7XG4gICAgICAgIC4uLnJlY29yZCxcbiAgICAgICAgcl9maW5hbFxuICAgICAgfTtcbiAgICB9KS5zb3J0KChhLCBiKSA9PiBiLnJfZmluYWwgLSBhLnJfZmluYWwpO1xuICB9XG59XG4iLCAiaW1wb3J0IHsgZGIsIGluaXREQiB9IGZyb20gJy4uLy4uL2Jhc2V2YXVsdC9kYic7XG5pbXBvcnQgeyBDZXJlYnJvVmVjdG9yU3RvcmUgfSBmcm9tICcuL3ZlY3Rvcic7XG5pbXBvcnQgeyBIYWJpdHVhdGlvblNjb3JlciB9IGZyb20gJy4vaGFiaXR1YXRpb24nO1xuaW1wb3J0IGNyeXB0byBmcm9tICdjcnlwdG8nO1xuXG5leHBvcnQgaW50ZXJmYWNlIENlcmVicm9Xb3JrZXJJbnB1dCB7XG4gIGhpc3RvcnlUb1Byb2Nlc3M/OiBzdHJpbmdbXTtcbiAgZXh0cmFjdGVkRmFjdHM/OiBzdHJpbmdbXTtcbiAgY2xhc3NpZmljYXRpb25zPzogeyBmYWN0OiBzdHJpbmcsIGV4aXN0aW5nQ29udGVudDogc3RyaW5nLCBjbGFzc2lmaWNhdGlvbjogJ2R1cGxpY2F0ZScgfCAndXBkYXRlJyB8ICd1bnJlbGF0ZWQnIH1bXTtcbiAgc291cmNlX3Rvb2w/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBydW5SZWZsZWN0aW9uU3dlZXAoaW5wdXQ6IENlcmVicm9Xb3JrZXJJbnB1dCkge1xuICBpbml0REIoKTtcbiAgXG4gIGlmIChpbnB1dC5leHRyYWN0ZWRGYWN0cykge1xuICAgIGZvciAoY29uc3QgZmFjdCBvZiBpbnB1dC5leHRyYWN0ZWRGYWN0cykge1xuICAgICAgY29uc3QgZXhpc3RpbmcgPSBDZXJlYnJvVmVjdG9yU3RvcmUuc2VhcmNoKGZhY3QsICdwcmVmZXJlbmNlJywgdW5kZWZpbmVkLCAxKTtcbiAgICAgIGxldCBza2lwID0gZmFsc2U7XG4gICAgICBcbiAgICAgIGlmIChleGlzdGluZy5sZW5ndGggPiAwICYmIGV4aXN0aW5nWzBdIS5zaW1pbGFyaXR5ISA+IDAuODUpIHtcbiAgICAgICAgY29uc3QgY2xhc3NpZmljYXRpb25NYXRjaCA9IGlucHV0LmNsYXNzaWZpY2F0aW9ucz8uZmluZChjID0+IGMuZmFjdCA9PT0gZmFjdCAmJiBjLmV4aXN0aW5nQ29udGVudCA9PT0gZXhpc3RpbmdbMF0hLmNvbnRlbnQpO1xuICAgICAgICBjb25zdCBjbGFzc2lmaWNhdGlvbiA9IGNsYXNzaWZpY2F0aW9uTWF0Y2ggPyBjbGFzc2lmaWNhdGlvbk1hdGNoLmNsYXNzaWZpY2F0aW9uIDogKGZhY3QudHJpbSgpLnRvTG93ZXJDYXNlKCkgPT09IGV4aXN0aW5nWzBdIS5jb250ZW50LnRyaW0oKS50b0xvd2VyQ2FzZSgpID8gJ2R1cGxpY2F0ZScgOiAndXBkYXRlJyk7XG4gICAgICAgIFxuICAgICAgICBpZiAoY2xhc3NpZmljYXRpb24gPT09ICdkdXBsaWNhdGUnKSB7XG4gICAgICAgICAgc2tpcCA9IHRydWU7XG4gICAgICAgIH0gZWxzZSBpZiAoY2xhc3NpZmljYXRpb24gPT09ICd1cGRhdGUnKSB7XG4gICAgICAgICAgc2tpcCA9IHRydWU7XG4gICAgICAgICAgY29uc3QgY29uZmxpY3RJZCA9IGV4aXN0aW5nWzBdIS5pZDtcbiAgICAgICAgICBjb25zdCBjb25mbGljdFJlYXNvbmluZyA9IGBQb3NzaWJseSBjb250cmFkaWN0cyBvciB1cGRhdGVzIGFuIGV4aXN0aW5nIG1lbW9yeTogXCIke2V4aXN0aW5nWzBdIS5jb250ZW50fVwiYDtcbiAgICAgICAgICBkYi5wcmVwYXJlKGBcbiAgICAgICAgICAgIElOU0VSVCBJTlRPIGNlcmVicm9fbGVhcm5pbmdfYXBwcm92YWxzIChpZCwgZmFjdCwgY29uZmlkZW5jZSwgc3RhdHVzLCBzb3VyY2VfcnVuX2lkLCBjcmVhdGVkX2F0LCBjb25mbGljdF93aXRoX2lkLCBjb25mbGljdF9yZWFzb25pbmcsIHNvdXJjZV90b29sKVxuICAgICAgICAgICAgVkFMVUVTICg/LCA/LCA/LCA/LCA/LCA/LCA/LCA/LCA/KVxuICAgICAgICAgIGApLnJ1bihjcnlwdG8ucmFuZG9tVVVJRCgpLCBmYWN0LCAwLjYsICdwZW5kaW5nJywgbnVsbCwgRGF0ZS5ub3coKSwgY29uZmxpY3RJZCwgY29uZmxpY3RSZWFzb25pbmcsIGlucHV0LnNvdXJjZV90b29sIHx8IG51bGwpO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGlmICghc2tpcCkge1xuICAgICAgICBDZXJlYnJvVmVjdG9yU3RvcmUuaW5zZXJ0KGZhY3QsICdwcmVmZXJlbmNlJywgdW5kZWZpbmVkLCBudWxsLCBmYWxzZSwgaW5wdXQuc291cmNlX3Rvb2wpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8vIEhhYml0dWF0aW9uIHNjb3Jpbmcgc3dlZXBcbiAgY29uc3QgYWxsTWVtb3JpZXNSYXcgPSBkYi5wcmVwYXJlKCdTRUxFQ1QgaWQsIGNvbnRlbnQsIHR5cGUsIGxhc3RfYWNjZXNzZWRfYXQsIGFjY2Vzc19jb3VudCBGUk9NIGNlcmVicm9fbWVtb3JpZXNfbWV0YScpLmFsbCgpIGFzIGFueVtdO1xuICAvLyBBdHRhY2ggZHVtbXkgc2ltaWxhcml0eSB0byB1c2UgSGFiaXR1YXRpb25TY29yZXIgKHNpbWlsYXJpdHkgaXNuJ3QgdXNlZCBmb3IgcHJ1bmluZyB0eXBpY2FsbHksIGp1c3QgcmFua2luZylcbiAgY29uc3QgYWxsTWVtb3JpZXMgPSBhbGxNZW1vcmllc1Jhdy5tYXAobSA9PiAoeyAuLi5tLCBzaW1pbGFyaXR5OiAxLjAsIGVtYmVkZGluZzogbmV3IEZsb2F0MzJBcnJheSgpIH0pKTtcbiAgXG4gIGlmIChhbGxNZW1vcmllcy5sZW5ndGggPiAwKSB7XG4gICAgY29uc3QgcmFua2VkID0gSGFiaXR1YXRpb25TY29yZXIucmFuayhhbGxNZW1vcmllcywgRGF0ZS5ub3coKSkgYXMgKHR5cGVvZiBhbGxNZW1vcmllc1swXSAmIHsgcl9maW5hbDogbnVtYmVyIH0pW107XG4gICAgLy8gUHJ1bmUgbWVtb3JpZXMgd2l0aCB2ZXJ5IGxvdyBSX2ZpbmFsIChlLmcuIGJlbG93IDAuMDUpXG4gICAgY29uc3QgUFJVTkVfVEhSRVNIT0xEID0gMC4wNTtcbiAgICBmb3IgKGNvbnN0IG1lbSBvZiByYW5rZWQpIHtcbiAgICAgIGlmIChtZW0ucl9maW5hbCA8IFBSVU5FX1RIUkVTSE9MRCkge1xuICAgICAgICBkYi5wcmVwYXJlKCdERUxFVEUgRlJPTSBjZXJlYnJvX21lbW9yaWVzX21ldGEgV0hFUkUgaWQgPSA/JykucnVuKG1lbS5pZCk7XG4gICAgICAgIGRiLnByZXBhcmUoJ0RFTEVURSBGUk9NIGNlcmVicm9fbWVtb3JpZXNfdmVjIFdIRVJFIGlkID0gPycpLnJ1bihtZW0uaWQpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8vIFBydW5pbmcgc3RhbGUgZmFjdHMgKGUuZy4gb2xkZXIgdGhhbiAzMCBkYXlzIGFuZCByYXJlbHkgYWNjZXNzZWQpXG4gIGNvbnN0IFRISVJUWV9EQVlTX01TID0gMzAgKiAyNCAqIDYwICogNjAgKiAxMDAwO1xuICBjb25zdCBzdGFsZVRocmVzaG9sZCA9IERhdGUubm93KCkgLSBUSElSVFlfREFZU19NUztcblxuICBjb25zdCBwcnVuZVN0bXQgPSBkYi5wcmVwYXJlKGBcbiAgICBERUxFVEUgRlJPTSBjZXJlYnJvX21lbW9yaWVzX21ldGEgXG4gICAgV0hFUkUgbGFzdF9hY2Nlc3NlZF9hdCA8ID8gQU5EIGFjY2Vzc19jb3VudCA8IDVcbiAgYCk7XG4gIGNvbnN0IHBydW5lSW5mbyA9IHBydW5lU3RtdC5ydW4oc3RhbGVUaHJlc2hvbGQpO1xuICBcbiAgaWYgKHBydW5lSW5mby5jaGFuZ2VzID4gMCkge1xuICAgIC8vIEFsc28gY2xlYW4gdXAgdmVjdG9ycyBmb3IgcHJ1bmVkIG1ldGFkYXRhXG4gICAgY29uc3QgY2xlYW51cFZlY1N0bXQgPSBkYi5wcmVwYXJlKGBcbiAgICAgIERFTEVURSBGUk9NIGNlcmVicm9fbWVtb3JpZXNfdmVjIFxuICAgICAgV0hFUkUgaWQgTk9UIElOIChTRUxFQ1QgaWQgRlJPTSBjZXJlYnJvX21lbW9yaWVzX21ldGEpXG4gICAgYCk7XG4gICAgY2xlYW51cFZlY1N0bXQucnVuKCk7XG4gIH1cblxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLHVCQUE2Qjs7O0FDQTdCLDRCQUFxQjtBQUNyQixrQkFBaUI7QUFDakIsZ0JBQWU7QUFDZixvQkFBdUM7QUFDdkMsNEJBQTZCO0FBRzdCLGdCQUEyQjtBQVczQixJQUFNLFlBQVksQ0FBQyxDQUFDLFFBQVEsSUFBSTtBQUNoQyxJQUFNLFVBQVUsWUFBQUEsUUFBSyxLQUFLLFFBQVEsSUFBSSxHQUFHLE9BQU87QUFDaEQsSUFBSSxDQUFDLGFBQWEsQ0FBQyxVQUFBQyxRQUFHLFdBQVcsT0FBTyxHQUFHO0FBQ3pDLFlBQUFBLFFBQUcsVUFBVSxTQUFTLEVBQUUsV0FBVyxLQUFLLENBQUM7QUFDM0M7QUFFTyxJQUFNLFNBQVMsWUFBWSxhQUFhLFlBQUFELFFBQUssS0FBSyxTQUFTLGNBQWM7QUFHekUsSUFBTSxLQUE0QixJQUFJLHNCQUFBRSxRQUFTLFFBQVE7QUFBQSxFQUM1RCxTQUFTLHNDQUFnQixRQUFRLElBQUksYUFBYSxnQkFBZ0IsUUFBUSxNQUFNO0FBQ2xGLENBQUM7QUFHUyxlQUFLLEVBQUU7QUFHakIsR0FBRyxPQUFPLG9CQUFvQjtBQUM5QixHQUFHLE9BQU8sc0JBQXNCO0FBQ2hDLEdBQUcsT0FBTyxtQkFBbUI7QUFDN0IsR0FBRyxPQUFPLHFCQUFxQjtBQUUvQixHQUFHLFNBQVMsVUFBVSxDQUFDLGFBQWlCLDBCQUFXLFFBQVEsRUFBRSxPQUFPLFFBQVEsRUFBRSxFQUFFLE9BQU8sS0FBSyxDQUFDO0FBR3RGLFNBQVMsU0FBUztBQUN2QixNQUFJLENBQUMsc0NBQWdCLFFBQVEsSUFBSSxhQUFhLE9BQVE7QUFDdEQsS0FBRyxLQUFLO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFB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QUFRLGdEQUFnRCxFQUFFLElBQUksSUFBSSxFQUFFO0FBQ3ZFLFdBQUcsUUFBUSwrQ0FBK0MsRUFBRSxJQUFJLElBQUksRUFBRTtBQUFBLE1BQ3hFO0FBQUEsSUFDRjtBQUFBLEVBQ0Y7QUFHQSxRQUFNLGlCQUFpQixLQUFLLEtBQUssS0FBSyxLQUFLO0FBQzNDLFFBQU0saUJBQWlCLEtBQUssSUFBSSxJQUFJO0FBRXBDLFFBQU0sWUFBWSxHQUFHLFFBQVE7QUFBQTtBQUFBO0FBQUEsR0FHNUI7QUFDRCxRQUFNLFlBQVksVUFBVSxJQUFJLGNBQWM7QUFFOUMsTUFBSSxVQUFVLFVBQVUsR0FBRztBQUV6QixVQUFNLGlCQUFpQixHQUFHLFFBQVE7QUFBQTtBQUFBO0FBQUEsS0FHakM7QUFDRCxtQkFBZSxJQUFJO0FBQUEsRUFDckI7QUFFRjs7O0FKdEVBLElBQU0sZ0JBQU4sY0FBNEIsOEJBQXNEO0FBQUEsRUFDekUsY0FBYztBQUNuQixVQUFNO0FBQUEsTUFDSixTQUFTLE9BQU8sVUFBVTtBQUN4QixZQUFJLENBQUMsTUFBTyxRQUFPLEVBQUUsUUFBUSxTQUFTLE9BQU8sb0JBQW9CO0FBQ2pFLFlBQUk7QUFDRixnQkFBTSxtQkFBbUIsS0FBSztBQUM5QixpQkFBTyxFQUFFLFFBQVEsV0FBVyxTQUFTLG9EQUFvRDtBQUFBLFFBQzNGLFNBQVMsS0FBVTtBQUNqQixrQkFBUSxNQUFNLGtEQUFrRCxHQUFHO0FBQ25FLGlCQUFPLEVBQUUsUUFBUSxTQUFTLE9BQU8sSUFBSSxRQUFRO0FBQUEsUUFDL0M7QUFBQSxNQUNGO0FBQUEsSUFDRixDQUFDO0FBQUEsRUFDSDtBQUNGO0FBRUEsSUFBTyxpQkFBUSxJQUFJLGNBQWM7IiwKICAibmFtZXMiOiBbInBhdGgiLCAiZnMiLCAiRGF0YWJhc2UiLCAiaW1wb3J0X2NyeXB0byIsICJjcnlwdG8iLCAiaW1wb3J0X2NyeXB0byIsICJjcnlwdG8iXQp9Cg==
