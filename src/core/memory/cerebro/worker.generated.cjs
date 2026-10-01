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
  migratePendingProposalBlob();
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
  static insert(content, type, embedding, projectId) {
    const id = import_crypto2.default.randomUUID();
    const now = Date.now();
    db.prepare(`
      INSERT INTO cerebro_memories_meta (id, content, type, project_id, last_accessed_at, access_count, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, content, type, projectId ?? null, now, 0, now);
    if (embedding) {
      db.prepare(`
        INSERT INTO cerebro_memories_vec (id, embedding)
        VALUES (?, ?)
      `).run(id, embedding);
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
      WHERE v.embedding MATCH ? AND k = ?
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
            INSERT INTO cerebro_learning_approvals (id, fact, confidence, status, source_run_id, created_at, conflict_with_id, conflict_reasoning)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `).run(import_crypto3.default.randomUUID(), fact, 0.6, "pending", null, Date.now(), conflictId, conflictReasoning);
        }
      }
      if (!skip) {
        CerebroVectorStore.insert(fact, "preference");
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
        db.prepare("DELETE FROM cerebro_memories_vec WHERE rowid = ?").run(mem.id);
      }
    }
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsid29ya2VyLnRzIiwgIi4uLy4uL2Jhc2V2YXVsdC9kYi50cyIsICJ2ZWN0b3IudHMiLCAiaGFiaXR1YXRpb24udHMiLCAicmVmbGVjdGlvbi1zd2VlcC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW1wb3J0IHsgVGhyZWFkV29ya2VyIH0gZnJvbSAncG9vbGlmaWVyJztcbmltcG9ydCB7IHJ1blJlZmxlY3Rpb25Td2VlcCwgQ2VyZWJyb1dvcmtlcklucHV0IH0gZnJvbSAnLi9yZWZsZWN0aW9uLXN3ZWVwJztcblxuZXhwb3J0IGludGVyZmFjZSBDZXJlYnJvV29ya2VyT3V0cHV0IHtcbiAgc3RhdHVzOiAnc3VjY2VzcycgfCAnZXJyb3InO1xuICBtZXNzYWdlPzogc3RyaW5nO1xuICBlcnJvcj86IHN0cmluZztcbn1cblxuY2xhc3MgQ2VyZWJyb1dvcmtlciBleHRlbmRzIFRocmVhZFdvcmtlcjxDZXJlYnJvV29ya2VySW5wdXQsIENlcmVicm9Xb3JrZXJPdXRwdXQ+IHtcbiAgcHVibGljIGNvbnN0cnVjdG9yKCkge1xuICAgIHN1cGVyKHtcbiAgICAgIGV4ZWN1dGU6IGFzeW5jIChpbnB1dCkgPT4ge1xuICAgICAgICBpZiAoIWlucHV0KSByZXR1cm4geyBzdGF0dXM6ICdlcnJvcicsIGVycm9yOiAnTm8gaW5wdXQgcHJvdmlkZWQnIH07XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgYXdhaXQgcnVuUmVmbGVjdGlvblN3ZWVwKGlucHV0KTtcbiAgICAgICAgICByZXR1cm4geyBzdGF0dXM6ICdzdWNjZXNzJywgbWVzc2FnZTogJ1JlZmxlY3Rpb24gY3ljbGUgYW5kIHN3ZWVwIGNvbXBsZXRlZCBzdWNjZXNzZnVsbHknIH07XG4gICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgY29uc29sZS5lcnJvcignW0NlcmVicm9Xb3JrZXJdIEZhaWxlZCBkdXJpbmcgcmVmbGVjdGlvbiBjeWNsZScsIGVycik7XG4gICAgICAgICAgcmV0dXJuIHsgc3RhdHVzOiAnZXJyb3InLCBlcnJvcjogZXJyLm1lc3NhZ2UgfTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pO1xuICB9XG59XG5cbmV4cG9ydCBkZWZhdWx0IG5ldyBDZXJlYnJvV29ya2VyKCk7XG4iLCAiaW1wb3J0IERhdGFiYXNlIGZyb20gJ2JldHRlci1zcWxpdGUzJztcbmltcG9ydCBwYXRoIGZyb20gJ3BhdGgnO1xuaW1wb3J0IGZzIGZyb20gJ2ZzJztcbmltcG9ydCB7IHJhbmRvbVVVSUQgfSBmcm9tICdjcnlwdG8nO1xuaW1wb3J0IHsgaXNNYWluVGhyZWFkIH0gZnJvbSAnd29ya2VyX3RocmVhZHMnO1xuXG5pbXBvcnQgdHlwZSB7IERhdGFiYXNlIGFzIEJldHRlclNxbGl0ZTNEYXRhYmFzZSB9IGZyb20gJ2JldHRlci1zcWxpdGUzJztcbmltcG9ydCAqIGFzIHNxbGl0ZVZlYyBmcm9tICdzcWxpdGUtdmVjJztcblxuLy8gUmVzb2x2ZSBkYXRhYmFzZSBkaXJlY3RvcnkgaW4gbG9jYWwgd29ya3NwYWNlICguZGF0YSlcbi8vXG4vLyBUZXN0cyBtdXN0IE5FVkVSIHRvdWNoIHRoZSByZWFsIGRldi91c2VyIGRhdGFiYXNlIFx1MjAxNCBWaXRlc3Qgc2V0c1xuLy8gYHByb2Nlc3MuZW52LlZJVEVTVGAgYXV0b21hdGljYWxseSwgc28gdW5kZXIgdGVzdCB3ZSB1c2UgYSBwcml2YXRlXG4vLyBpbi1tZW1vcnkgZGF0YWJhc2UgaW5zdGVhZC4gV2l0aG91dCB0aGlzLCBydW5uaW5nIHRoZSB0ZXN0IHN1aXRlIHdoaWxlXG4vLyB0aGUgZGV2IHNlcnZlciBpcyBydW5uaW5nIHdvdWxkIGRlbGV0ZSByZWFsIHJlZ2lzdGVyZWQgcHJvdmlkZXJzLFxuLy8gcm91dGluZyBydWxlcywgYW5kIHByb2plY3RzIChzZXZlcmFsIHRlc3RzIGRvIHVuc2NvcGVkIGBERUxFVEUgRlJPTVxuLy8gcHJvamVjdHNgIC8gYHRhc2tzYCAvIGB3b3JrZmxvd19ydW5zYCBhcyBjbGVhbnVwKSBcdTIwMTQgbGl2ZS1vYnNlcnZlZFxuLy8gMjAyNi0wNy0wMywgd2lwZWQgYSB1c2VyJ3MgcHJvdmlkZXIgcmVnaXN0cnkgdHdpY2UgbWlkLXNlc3Npb24uXG5jb25zdCBpc1Rlc3RFbnYgPSAhIXByb2Nlc3MuZW52LlZJVEVTVDtcbmNvbnN0IGRhdGFEaXIgPSBwYXRoLmpvaW4ocHJvY2Vzcy5jd2QoKSwgJy5kYXRhJyk7XG5pZiAoIWlzVGVzdEVudiAmJiAhZnMuZXhpc3RzU3luYyhkYXRhRGlyKSkge1xuICBmcy5ta2RpclN5bmMoZGF0YURpciwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG59XG5cbmV4cG9ydCBjb25zdCBkYlBhdGggPSBpc1Rlc3RFbnYgPyAnOm1lbW9yeTonIDogcGF0aC5qb2luKGRhdGFEaXIsICduZXVyb3N5bmMuZGInKTtcblxuLy8gSW5zdGFudGlhdGUgYmV0dGVyLXNxbGl0ZTMgZGF0YWJhc2VcbmV4cG9ydCBjb25zdCBkYjogQmV0dGVyU3FsaXRlM0RhdGFiYXNlID0gbmV3IERhdGFiYXNlKGRiUGF0aCwgeyBcbiAgdmVyYm9zZTogaXNNYWluVGhyZWFkICYmIHByb2Nlc3MuZW52Lk5PREVfRU5WID09PSAnZGV2ZWxvcG1lbnQnID8gY29uc29sZS5sb2cgOiB1bmRlZmluZWQgXG59KTtcblxuLy8gTG9hZCBWZWN0b3IgU2VhcmNoIEV4dGVuc2lvblxuc3FsaXRlVmVjLmxvYWQoZGIpO1xuXG4vLyBFbmZvcmNlIFdyaXRlLUFoZWFkIExvZ2dpbmcgKFdBTCkgZm9yIGNvbmN1cnJlbnQgcmVhZHMvd3JpdGVzIGFuZCBwZXJmb3JtYW5jZVxuZGIucHJhZ21hKCdqb3VybmFsX21vZGUgPSBXQUwnKTtcbmRiLnByYWdtYSgnc3luY2hyb25vdXMgPSBOT1JNQUwnKTtcbmRiLnByYWdtYSgnZm9yZWlnbl9rZXlzID0gT04nKTtcbmRiLnByYWdtYSgnYnVzeV90aW1lb3V0ID0gNTAwMCcpO1xuXG4vLyBTY2hlbWEgSW5pdGlhbGl6YXRpb24gRnVuY3Rpb25cbmV4cG9ydCBmdW5jdGlvbiBpbml0REIoKSB7XG4gIGlmICghaXNNYWluVGhyZWFkICYmIHByb2Nlc3MuZW52Lk5PREVfRU5WICE9PSAndGVzdCcpIHJldHVybjtcbiAgZGIuZXhlYyhgXG4gICAgQ1JFQVRFIFRBQkxFIElGIE5PVCBFWElTVFMgcHJvamVjdHMgKFxuICAgICAgaWQgVEVYVCBQUklNQVJZIEtFWSxcbiAgICAgIG5hbWUgVEVYVCBOT1QgTlVMTCxcbiAgICAgIHdvcmtzcGFjZV9wYXRoIFRFWFQsXG4gICAgICBwcm9qZWN0X3Jvb3RfcGF0aCBURVhULFxuICAgICAgY3JlYXRlZF9hdCBJTlRFR0VSIE5PVCBOVUxMXG4gICAgKTtcblxuICAgIENSRUFURSBUQUJMRSBJRiBOT1QgRVhJU1RTIHdvcmtmbG93cyAoXG4gICAgICBpZCBURVhUIFBSSU1BUlkgS0VZLFxuICAgICAgcHJvamVjdF9pZCBURVhUIE5PVCBOVUxMLFxuICAgICAgbmFtZSBURVhUIE5PVCBOVUxMLFxuICAgICAgZGFnX3RlbXBsYXRlIFRFWFQgTk9UIE5VTEwsXG4gICAgICBjcm9uX3NjaGVkdWxlIFRFWFQsXG4gICAgICBjcmVhdGVkX2F0IElOVEVHRVIgTk9UIE5VTEwsXG4gICAgICBGT1JFSUdOIEtFWShwcm9qZWN0X2lkKSBSRUZFUkVOQ0VTIHByb2plY3RzKGlkKSBPTiBERUxFVEUgQ0FTQ0FERVxuICAgICk7XG5cbiAgICBDUkVBVEUgVEFCTEUgSUYgTk9UIEVYSVNUUyB3b3JrZmxvd19ydW5zIChcbiAgICAgIGlkIFRFWFQgUFJJTUFSWSBLRVksXG4gICAgICBwcm9qZWN0X2lkIFRFWFQgTk9UIE5VTEwsXG4gICAgICBkYWdfbGF5b3V0IFRFWFQgTk9UIE5VTEwsXG4gICAgICBzdGF0dXMgVEVYVCBOT1QgTlVMTCxcbiAgICAgIGNyZWF0ZWRfYXQgSU5URUdFUiBOT1QgTlVMTCxcbiAgICAgIEZPUkVJR04gS0VZKHByb2plY3RfaWQpIFJFRkVSRU5DRVMgcHJvamVjdHMoaWQpIE9OIERFTEVURSBDQVNDQURFXG4gICAgKTtcblxuICAgIENSRUFURSBUQUJMRSBJRiBOT1QgRVhJU1RTIHRhc2tzIChcbiAgICAgIGlkIFRFWFQgUFJJTUFSWSBLRVksXG4gICAgICBydW5faWQgVEVYVCBOT1QgTlVMTCxcbiAgICAgIHN0YXR1cyBURVhUIE5PVCBOVUxMLFxuICAgICAgY2xhaW1fbGVhc2UgSU5URUdFUixcbiAgICAgIG91dHB1dF9kYXRhIFRFWFQsXG4gICAgICBGT1JFSUdOIEtFWShydW5faWQpIFJFRkVSRU5DRVMgd29ya2Zsb3dfcnVucyhpZCkgT04gREVMRVRFIENBU0NBREVcbiAgICApO1xuICAgIFxuICAgIENSRUFURSBUQUJMRSBJRiBOT1QgRVhJU1RTIG9zX3RvZG9zIChcbiAgICAgIGlkIFRFWFQgUFJJTUFSWSBLRVksXG4gICAgICBkYWdfbm9kZV9pZCBURVhUIE5PVCBOVUxMLFxuICAgICAgc2V2ZXJpdHkgVEVYVCBOT1QgTlVMTCxcbiAgICAgIGVzY2FsYXRpb25fcmVhc29uIFRFWFQgTk9UIE5VTEwsXG4gICAgICByZXF1aXJlZF9hY3Rpb25fdHlwZSBURVhUIE5PVCBOVUxMLFxuICAgICAgc3RhdHVzIFRFWFQgTk9UIE5VTEwsXG4gICAgICBjcmVhdGVkX2F0IElOVEVHRVIgTk9UIE5VTEwsXG4gICAgICBGT1JFSUdOIEtFWShkYWdfbm9kZV9pZCkgUkVGRVJFTkNFUyB0YXNrcyhpZCkgT04gREVMRVRFIENBU0NBREVcbiAgICApO1xuXG4gICAgLS0gT3B0aW1pemUgdGFzayBxdWVyeWluZyBieSBzdGF0dXMgYW5kIHJ1bl9pZFxuICAgIENSRUFURSBJTkRFWCBJRiBOT1QgRVhJU1RTIGlkeF90YXNrc19ydW5faWRfc3RhdHVzIE9OIHRhc2tzKHJ1bl9pZCwgc3RhdHVzKTtcblxuICAgIC0tIENlcmVicm8gTWVtb3J5IFRhYmxlc1xuICAgIC0tIHByb2plY3RfaWQgTlVMTCA9IEdMT0JBTC9VU0VSLXRpZXIgbWVtb3J5ICh2aXNpYmxlIGV2ZXJ5d2hlcmUpOyBzZXQgPSBQUk9KRUNULXRpZXJcbiAgICAtLSAodmlzaWJsZSBvbmx5IHRvIHRoYXQgcHJvamVjdCksIG1pcnJvcmluZyB0aGUgdGllciBjb252ZW50aW9uIG9uIG9rZl9ub2Rlcy5cbiAgICBDUkVBVEUgVEFCTEUgSUYgTk9UIEVYSVNUUyBjZXJlYnJvX21lbW9yaWVzX21ldGEgKFxuICAgICAgaWQgVEVYVCBQUklNQVJZIEtFWSxcbiAgICAgIGNvbnRlbnQgVEVYVCBOT1QgTlVMTCxcbiAgICAgIHR5cGUgVEVYVCBOT1QgTlVMTCxcbiAgICAgIHByb2plY3RfaWQgVEVYVCxcbiAgICAgIGxhc3RfYWNjZXNzZWRfYXQgSU5URUdFUiBOT1QgTlVMTCxcbiAgICAgIGFjY2Vzc19jb3VudCBJTlRFR0VSIE5PVCBOVUxMIERFRkFVTFQgMCxcbiAgICAgIGNyZWF0ZWRfYXQgSU5URUdFUiBOT1QgTlVMTFxuICAgICk7XG5cbiAgICBDUkVBVEUgVklSVFVBTCBUQUJMRSBJRiBOT1QgRVhJU1RTIGNlcmVicm9fbWVtb3JpZXNfdmVjIFVTSU5HIHZlYzAoXG4gICAgICBpZCBURVhUIFBSSU1BUlkgS0VZLFxuICAgICAgZW1iZWRkaW5nIGZsb2F0WzE1MzZdXG4gICAgKTtcblxuICAgIENSRUFURSBUQUJMRSBJRiBOT1QgRVhJU1RTIGNlcmVicm9fbGVhcm5pbmdfYXBwcm92YWxzIChcbiAgICAgIGlkIFRFWFQgUFJJTUFSWSBLRVksXG4gICAgICBmYWN0IFRFWFQgTk9UIE5VTEwsXG4gICAgICBjb25maWRlbmNlIFJFQUwgTk9UIE5VTEwsXG4gICAgICBzdGF0dXMgVEVYVCBOT1QgTlVMTCxcbiAgICAgIHNvdXJjZV9ydW5faWQgVEVYVCxcbiAgICAgIGNyZWF0ZWRfYXQgSU5URUdFUiBOT1QgTlVMTFxuICAgICk7XG5cbiAgICAtLSBDZXJlYnJvIHBydW5lIGhpc3Rvcnk6IG9uZSByb3cgcGVyIG1hbnVhbCBwcnVuZSBhY3Rpb24uIFBvd2VycyB0aGVcbiAgICAtLSBcIlBydW5lZCAoMzBkKVwiIGNvdW50ZXIgKFNVTShjb3VudCkgb3ZlciB0aGUgbGFzdCAzMCBkYXlzKS4gUHJ1bmluZyBpc1xuICAgIC0tIG1hbnVhbC10cmlnZ2VyIG9ubHkgKG5ldmVyIGEgc2lsZW50IGJhY2tncm91bmQgYXV0by1kZWxldGUpIHNpbmNlIGl0XG4gICAgLS0gcGVybWFuZW50bHkgcmVtb3ZlcyB1c2VyIG1lbW9yeSByb3dzIGZyb20gY2VyZWJyb19tZW1vcmllc19tZXRhL192ZWMuXG4gICAgQ1JFQVRFIFRBQkxFIElGIE5PVCBFWElTVFMgY2VyZWJyb19wcnVuZV9sb2cgKFxuICAgICAgaWQgVEVYVCBQUklNQVJZIEtFWSxcbiAgICAgIHBydW5lZF9hdCBJTlRFR0VSIE5PVCBOVUxMLFxuICAgICAgY291bnQgSU5URUdFUiBOT1QgTlVMTFxuICAgICk7XG5cbiAgICAtLSBDb3VuY2lsIE1vZGUgKFJvdXRlU3dpdGNoIGhpZ2gtcmlzayBhcmJpdHJhdGlvbikgY29tcHV0ZXMgYSByZWFsXG4gICAgLS0gY29uZmlkZW5jZS9kaXNhZ3JlZW1lbnQgc2lnbmFsIGZyb20gcGFyYWxsZWwgcHJvdmlkZXIgY2FsbHMsIGJ1dCBldmVyeVxuICAgIC0tIGNhbGxlciBvZiBSb3V0ZVN3aXRjaEVuZ2luZS5leGVjdXRlKCkgcHJldmlvdXNseSBkaXNjYXJkZWQgaXQgXHUyMDE0IG9ubHlcbiAgICAtLSByZXN1bHQuY29udGVudCB3YXMgZXZlciByZWFkLiBUaGlzIHRhYmxlIGlzIHdoYXQgbWFrZXMgdGhhdCBzaWduYWxcbiAgICAtLSBxdWVyeWFibGUvdmlzaWJsZSAocGVyc2lzdGVkICsgbG9nZ2VkICsgc3VyZmFjZWQgaW4gdGhlIGRhc2hib2FyZClcbiAgICAtLSBpbnN0ZWFkIG9mIHZhbmlzaGluZyBzaWxlbnRseSBhZnRlciBiZWluZyBjb21wdXRlZCBhdCByZWFsIGNvc3QuXG4gICAgQ1JFQVRFIFRBQkxFIElGIE5PVCBFWElTVFMgY291bmNpbF9kZWNpc2lvbnMgKFxuICAgICAgaWQgVEVYVCBQUklNQVJZIEtFWSxcbiAgICAgIHNjb3BlIFRFWFQsXG4gICAgICBzY29wZV9pZCBURVhULFxuICAgICAgcHJvdmlkZXJfY291bnQgSU5URUdFUiBOT1QgTlVMTCxcbiAgICAgIGNvbmZpZGVuY2UgUkVBTCBOT1QgTlVMTCxcbiAgICAgIGRpc2FncmVlbWVudF9zY29yZSBSRUFMIE5PVCBOVUxMLFxuICAgICAgY2hvc2VuX3Jlc3BvbnNlX2xlbmd0aCBJTlRFR0VSIE5PVCBOVUxMLFxuICAgICAgY3JlYXRlZF9hdCBJTlRFR0VSIE5PVCBOVUxMXG4gICAgKTtcblxuICAgIENSRUFURSBUQUJMRSBJRiBOT1QgRVhJU1RTIHN5c3RlbV9zZXR0aW5ncyAoXG4gICAgICBrZXkgVEVYVCBQUklNQVJZIEtFWSxcbiAgICAgIHZhbHVlIFRFWFQgTk9UIE5VTExcbiAgICApO1xuXG4gICAgLS0gU2NvcGVMb2dpYyBEQUcgcHJvcG9zYWxzIGF3YWl0aW5nIGh1bWFuIGFwcHJvdmFsIChTeXN0ZW0gQikuXG4gICAgLS0gUHJldmlvdXNseSBjcmFtbWVkIGFzIGEgc2luZ2xlIEpTT04gYmxvYiBpbnRvIHN5c3RlbV9zZXR0aW5ncyB1bmRlciB0aGVcbiAgICAtLSBmaXhlZCBrZXkgJ3BlbmRpbmdfcHJvcG9zYWwnIHdpdGggbm8gY29uZmlkZW5jZSwgbm8gcHJvamVjdCBzY29waW5nLCBhbmRcbiAgICAtLSBubyBhdWRpdCB0cmFpbC4gVGhpcyByZWFsIHRhYmxlIGxldHMgYSBzdGFnZWQgcHJvcG9zYWwgYmUgY29uZmlkZW5jZS1nYXRlZFxuICAgIC0tIChEZWZlcmVuY2UgVUksIDAuNzAgdGhyZXNob2xkKSBhbmQgc3VyZmFjZWQgaW4gdGhlIFNBTUUgUG9ydEdyaWQgYXBwcm92YWxcbiAgICAtLSBxdWV1ZSBhcyBvc190b2Rvcy4gcHJvamVjdF9pZCBpcyBudWxsYWJsZSAocHJvcG9zYWxzIHN0YWdlZCB1bmRlciBhXG4gICAgLS0gXCJHbG9iYWxcIi9uby1hY3RpdmUtcHJvamVjdCBzY29wZSBhcmUgbGVnaXRpbWF0ZSkuIE5vIEZLIG9uIHByb2plY3RfaWQ6XG4gICAgLS0gcHJvcG9zYWwgaGlzdG9yeSBzaG91bGQgc3Vydml2ZSBwcm9qZWN0IGRlbGV0aW9uIGZvciBhdWRpdCwgYW5kIHN0YWdpbmdcbiAgICAtLSBtdXN0IG5vdCBmYWlsIGlmIHRoZSBpZCBkb2Vzbid0ICh5ZXQpIHJlc29sdmUgdG8gYSBwcm9qZWN0cyByb3cuXG4gICAgQ1JFQVRFIFRBQkxFIElGIE5PVCBFWElTVFMgZGFnX3Byb3Bvc2FscyAoXG4gICAgICBpZCBURVhUIFBSSU1BUlkgS0VZLFxuICAgICAgcHJvamVjdF9pZCBURVhULFxuICAgICAgcHJvcG9zYWwgVEVYVCBOT1QgTlVMTCxcbiAgICAgIGNvbmZpZGVuY2UgUkVBTCBOT1QgTlVMTCBERUZBVUxUIDAuNSxcbiAgICAgIHN0YXR1cyBURVhUIE5PVCBOVUxMIERFRkFVTFQgJ3BlbmRpbmcnLFxuICAgICAgY3JlYXRlZF9hdCBJTlRFR0VSIE5PVCBOVUxMXG4gICAgKTtcblxuICAgIENSRUFURSBJTkRFWCBJRiBOT1QgRVhJU1RTIGlkeF9kYWdfcHJvcG9zYWxzX3N0YXR1cyBPTiBkYWdfcHJvcG9zYWxzKHN0YXR1cywgY3JlYXRlZF9hdCk7XG5cbiAgICBDUkVBVEUgVEFCTEUgSUYgTk9UIEVYSVNUUyBtb2RlbF9iZW5jaG1hcmtzIChcbiAgICAgIG1vZGVsX2lkIFRFWFQgUFJJTUFSWSBLRVksXG4gICAgICBhdmdfbGF0ZW5jeV9tcyBSRUFMLFxuICAgICAgYXZnX3RwcyBSRUFMLFxuICAgICAgZmFpbHVyZV9yYXRlIFJFQUwsXG4gICAgICB0b3RhbF9ydW5zIElOVEVHRVJcbiAgICApO1xuXG4gICAgQ1JFQVRFIFRBQkxFIElGIE5PVCBFWElTVFMgZGlzY292ZXJlZF9tb2RlbHMgKFxuICAgICAgaWQgVEVYVCBQUklNQVJZIEtFWSxcbiAgICAgIG5hbWUgVEVYVCBOT1QgTlVMTCxcbiAgICAgIGNvbnRleHRfbGVuZ3RoIElOVEVHRVIsXG4gICAgICBwcmljaW5nX3Byb21wdCBURVhULFxuICAgICAgcHJpY2luZ19jb21wbGV0aW9uIFRFWFQsXG4gICAgICBmZXRjaGVkX2F0IElOVEVHRVIgTk9UIE5VTExcbiAgICApO1xuXG4gICAgLS0gTExNIFByb3ZpZGVyIFJlZ2lzdHJ5OiBuYW1lZCBwcm92aWRlciBlbnRyaWVzIHdpdGggZW5jcnlwdGVkIEFQSSBrZXlzXG4gICAgQ1JFQVRFIFRBQkxFIElGIE5PVCBFWElTVFMgbGxtX3Byb3ZpZGVycyAoXG4gICAgICBpZCBURVhUIFBSSU1BUlkgS0VZLFxuICAgICAgbmFtZSBURVhUIE5PVCBOVUxMLFxuICAgICAgdHlwZSBURVhUIE5PVCBOVUxMLFxuICAgICAgY29uZmlnX2pzb24gVEVYVCBOT1QgTlVMTCxcbiAgICAgIGFwaV9rZXlfZW5jcnlwdGVkIFRFWFQsXG4gICAgICBpc19lbmFibGVkIElOVEVHRVIgTk9UIE5VTEwgREVGQVVMVCAxLFxuICAgICAgY3JlYXRlZF9hdCBJTlRFR0VSIE5PVCBOVUxMLFxuICAgICAgdXBkYXRlZF9hdCBJTlRFR0VSIE5PVCBOVUxMXG4gICAgKTtcblxuICAgIC0tIExMTSBSb3V0aW5nIFJ1bGVzOiBwZXItc2NvcGUgZmFsbGJhY2sgY2hhaW5zXG4gICAgQ1JFQVRFIFRBQkxFIElGIE5PVCBFWElTVFMgbGxtX3JvdXRpbmdfcnVsZXMgKFxuICAgICAgaWQgVEVYVCBQUklNQVJZIEtFWSxcbiAgICAgIHNjb3BlIFRFWFQgTk9UIE5VTEwsXG4gICAgICBzY29wZV9pZCBURVhULFxuICAgICAgcHJvdmlkZXJfY2hhaW4gVEVYVCBOT1QgTlVMTCxcbiAgICAgIGNyZWF0ZWRfYXQgSU5URUdFUiBOT1QgTlVMTCxcbiAgICAgIHVwZGF0ZWRfYXQgSU5URUdFUiBOT1QgTlVMTCxcbiAgICAgIFVOSVFVRShzY29wZSwgc2NvcGVfaWQpXG4gICAgKTtcblxuICAgIC0tIE9LRiBLbm93bGVkZ2UgR3JhcGg6IGluZGl2aWR1YWwgTWFya2Rvd24gY29uY2VwdCBmaWxlcyBpbmRleGVkXG4gICAgQ1JFQVRFIFRBQkxFIElGIE5PVCBFWElTVFMgb2tmX25vZGVzIChcbiAgICAgIGlkIFRFWFQgUFJJTUFSWSBLRVksXG4gICAgICB0aWVyIFRFWFQgTk9UIE5VTEwgQ0hFQ0sodGllciBJTiAoJ0dMT0JBTCcsICdVU0VSJywgJ1BST0pFQ1QnKSksXG4gICAgICBwcm9qZWN0X2lkIFRFWFQsXG4gICAgICB0eXBlIFRFWFQgTk9UIE5VTEwsXG4gICAgICB0aXRsZSBURVhULFxuICAgICAgY29uZmlkZW5jZSBSRUFMIE5PVCBOVUxMIERFRkFVTFQgMS4wLFxuICAgICAgY29udGVudF9oYXNoIFRFWFQsXG4gICAgICBmcm9udG1hdHRlcl9qc29uIFRFWFQsXG4gICAgICBmaWxlX3BhdGggVEVYVCBVTklRVUUgTk9UIE5VTEwsXG4gICAgICBsYXN0X2luZGV4ZWRfYXQgSU5URUdFUiBOT1QgTlVMTCxcbiAgICAgIEZPUkVJR04gS0VZKHByb2plY3RfaWQpIFJFRkVSRU5DRVMgcHJvamVjdHMoaWQpIE9OIERFTEVURSBDQVNDQURFXG4gICAgKTtcblxuICAgIC0tIE9LRiBFZGdlczogcmVsYXRpb25zaGlwcyBiZXR3ZWVuIGNvbmNlcHQgZmlsZXMgKGZyb20gTWFya2Rvd24gbGlua3MpXG4gICAgQ1JFQVRFIFRBQkxFIElGIE5PVCBFWElTVFMgb2tmX2VkZ2VzIChcbiAgICAgIHNvdXJjZV9ub2RlX2lkIFRFWFQgTk9UIE5VTEwsXG4gICAgICB0YXJnZXRfbm9kZV9pZCBURVhUIE5PVCBOVUxMLFxuICAgICAgcmVsYXRpb25zaGlwX3R5cGUgVEVYVCBOT1QgTlVMTCBERUZBVUxUICdyZWZlcmVuY2VzJyxcbiAgICAgIFBSSU1BUlkgS0VZIChzb3VyY2Vfbm9kZV9pZCwgdGFyZ2V0X25vZGVfaWQpLFxuICAgICAgRk9SRUlHTiBLRVkgKHNvdXJjZV9ub2RlX2lkKSBSRUZFUkVOQ0VTIG9rZl9ub2RlcyhpZCkgT04gREVMRVRFIENBU0NBREUsXG4gICAgICBGT1JFSUdOIEtFWSAodGFyZ2V0X25vZGVfaWQpIFJFRkVSRU5DRVMgb2tmX25vZGVzKGlkKSBPTiBERUxFVEUgQ0FTQ0FERVxuICAgICk7XG5cbiAgICAtLSBTY291dERhZW1vbiBxdWFyYW50aW5lZCByZXNlYXJjaCAoaXNvbGF0ZWQgZnJvbSBhY3RpdmUga25vd2xlZGdlIGdyYXBoKVxuICAgIENSRUFURSBUQUJMRSBJRiBOT1QgRVhJU1RTIHNjb3V0X29rZl9ub2RlcyAoXG4gICAgICBpZCBURVhUIFBSSU1BUlkgS0VZLFxuICAgICAgcHJvamVjdF9pZCBURVhULFxuICAgICAgdHlwZSBURVhUIE5PVCBOVUxMLFxuICAgICAgdGl0bGUgVEVYVCxcbiAgICAgIGNvbmZpZGVuY2UgUkVBTCBOT1QgTlVMTCBERUZBVUxUIDAuNSxcbiAgICAgIGNvbnRlbnRfaGFzaCBURVhULFxuICAgICAgZnJvbnRtYXR0ZXJfanNvbiBURVhULFxuICAgICAgZmlsZV9wYXRoIFRFWFQgVU5JUVVFIE5PVCBOVUxMLFxuICAgICAgc3RhdHVzIFRFWFQgTk9UIE5VTEwgREVGQVVMVCAnZHJhZnQnIENIRUNLKHN0YXR1cyBJTiAoJ2RyYWZ0JywgJ3Byb21vdGVkJywgJ3JlamVjdGVkJykpLFxuICAgICAgY3JlYXRlZF9hdCBJTlRFR0VSIE5PVCBOVUxMLFxuICAgICAgRk9SRUlHTiBLRVkocHJvamVjdF9pZCkgUkVGRVJFTkNFUyBwcm9qZWN0cyhpZCkgT04gREVMRVRFIFNFVCBOVUxMXG4gICAgKTtcblxuICAgIC0tIEluZGV4ZXMgZm9yIGdyYXBoIHRyYXZlcnNhbCBwZXJmb3JtYW5jZVxuICAgIENSRUFURSBJTkRFWCBJRiBOT1QgRVhJU1RTIGlkeF9va2Zfbm9kZXNfdGllciBPTiBva2Zfbm9kZXModGllciwgcHJvamVjdF9pZCk7XG4gICAgQ1JFQVRFIElOREVYIElGIE5PVCBFWElTVFMgaWR4X29rZl9ub2Rlc190eXBlIE9OIG9rZl9ub2Rlcyh0eXBlKTtcbiAgICBDUkVBVEUgSU5ERVggSUYgTk9UIEVYSVNUUyBpZHhfb2tmX2VkZ2VzX3NvdXJjZSBPTiBva2ZfZWRnZXMoc291cmNlX25vZGVfaWQpO1xuICAgIENSRUFURSBJTkRFWCBJRiBOT1QgRVhJU1RTIGlkeF9va2ZfZWRnZXNfdGFyZ2V0IE9OIG9rZl9lZGdlcyh0YXJnZXRfbm9kZV9pZCk7XG4gICAgQ1JFQVRFIElOREVYIElGIE5PVCBFWElTVFMgaWR4X3Njb3V0X29rZl9zdGF0dXMgT04gc2NvdXRfb2tmX25vZGVzKHN0YXR1cyk7XG4gICAgQ1JFQVRFIElOREVYIElGIE5PVCBFWElTVFMgaWR4X2NlcmVicm9fbWVtb3JpZXNfcHJvamVjdCBPTiBjZXJlYnJvX21lbW9yaWVzX21ldGEocHJvamVjdF9pZCk7XG4gIGApO1xuXG4gIHRyeSB7XG4gICAgZGIuZXhlYyhgQUxURVIgVEFCTEUgcHJvamVjdHMgQUREIENPTFVNTiB3b3Jrc3BhY2VfcGF0aCBURVhUO2ApO1xuICB9IGNhdGNoIChlOiBhbnkpIHtcbiAgICAvLyBJZ25vcmUgZXJyb3IgaWYgY29sdW1uIGFscmVhZHkgZXhpc3RzXG4gICAgaWYgKCFlLm1lc3NhZ2UuaW5jbHVkZXMoJ2R1cGxpY2F0ZSBjb2x1bW4gbmFtZScpKSB7XG4gICAgICBjb25zb2xlLmVycm9yKCdFcnJvciBhZGRpbmcgd29ya3NwYWNlX3BhdGggY29sdW1uOicsIGUpO1xuICAgIH1cbiAgfVxuXG4gIHRyeSB7XG4gICAgZGIuZXhlYyhgQUxURVIgVEFCTEUgcHJvamVjdHMgQUREIENPTFVNTiBwcm9qZWN0X3Jvb3RfcGF0aCBURVhUO2ApO1xuICB9IGNhdGNoIChlOiBhbnkpIHtcbiAgICBpZiAoIWUubWVzc2FnZS5pbmNsdWRlcygnZHVwbGljYXRlIGNvbHVtbiBuYW1lJykpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIGFkZGluZyBwcm9qZWN0X3Jvb3RfcGF0aCBjb2x1bW46JywgZSk7XG4gICAgfVxuICB9XG5cbiAgdHJ5IHtcbiAgICAvLyBEZWZlcmVuY2UgVUkgKDAuNzAgdGhyZXNob2xkKSBcdTIwMTQgbnVtZXJpYyBjb25maWRlbmNlIHBlciBwZW5kaW5nIGFwcHJvdmFsLlxuICAgIC8vIERlZmF1bHQgMC41IHB1dHMgbGVnYWN5L3VuLXNjb3JlZCByb3dzIGluIHRoZSBcIm5lZWRzIGEgbG9va1wiIGJ1Y2tldFxuICAgIC8vIHJhdGhlciB0aGFuIHNpbGVudGx5IHF1YWxpZnlpbmcgdGhlbSBmb3IgYnVsayBhdXRvLWFwcHJvdmFsLlxuICAgIGRiLmV4ZWMoYEFMVEVSIFRBQkxFIG9zX3RvZG9zIEFERCBDT0xVTU4gY29uZmlkZW5jZSBSRUFMIE5PVCBOVUxMIERFRkFVTFQgMC41O2ApO1xuICB9IGNhdGNoIChlOiBhbnkpIHtcbiAgICBpZiAoIWUubWVzc2FnZS5pbmNsdWRlcygnZHVwbGljYXRlIGNvbHVtbiBuYW1lJykpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIGFkZGluZyBjb25maWRlbmNlIGNvbHVtbiB0byBvc190b2RvczonLCBlKTtcbiAgICB9XG4gIH1cblxuICB0cnkge1xuICAgIC8vIFNvZnQtZGVsZXRlIGZvciBwcm9qZWN0czogYXJjaGl2ZWRfYXQgaXMgTlVMTCBmb3IgYWN0aXZlIHByb2plY3RzLlxuICAgIC8vIFRoZXJlIHdhcyBwcmV2aW91c2x5IG5vIGRlbGV0ZS9hcmNoaXZlIHBhdGggYXQgYWxsLCBzbyBvcnBoYW5lZC90ZXN0XG4gICAgLy8gcHJvamVjdCByb3dzIGhhZCBubyB3YXkgdG8gYmUgY2xlYW5lZCB1cCBzaG9ydCBvZiBhIHJhdyBEQiBlZGl0LlxuICAgIGRiLmV4ZWMoYEFMVEVSIFRBQkxFIHByb2plY3RzIEFERCBDT0xVTU4gYXJjaGl2ZWRfYXQgSU5URUdFUjtgKTtcbiAgfSBjYXRjaCAoZTogYW55KSB7XG4gICAgaWYgKCFlLm1lc3NhZ2UuaW5jbHVkZXMoJ2R1cGxpY2F0ZSBjb2x1bW4gbmFtZScpKSB7XG4gICAgICBjb25zb2xlLmVycm9yKCdFcnJvciBhZGRpbmcgYXJjaGl2ZWRfYXQgY29sdW1uIHRvIHByb2plY3RzOicsIGUpO1xuICAgIH1cbiAgfVxuXG4gIHRyeSB7XG4gICAgLy8gUmVhbCBcIk9yY2hlc3RyYXRpb24gTWV0cmljc1wiIChDb3JlRXhlY0Rhc2hib2FyZCkgbmVlZHMgYSBjb21wbGV0aW9uXG4gICAgLy8gdGltZXN0YW1wIHRvIGNvbXB1dGUgbGF0ZW5jeSAtLSBwcmV2aW91c2x5IG9ubHkgY3JlYXRlZF9hdCBleGlzdGVkLFxuICAgIC8vIHNvIHJ1biBkdXJhdGlvbiB3YXMgdW5jb21wdXRhYmxlIGFuZCB0aGUgZGFzaGJvYXJkIHNob3dlZCBhIGZhYnJpY2F0ZWRcbiAgICAvLyBcIjQybXNcIiBzdHJpbmcgaW5zdGVhZC5cbiAgICBkYi5leGVjKGBBTFRFUiBUQUJMRSB3b3JrZmxvd19ydW5zIEFERCBDT0xVTU4gY29tcGxldGVkX2F0IElOVEVHRVI7YCk7XG4gIH0gY2F0Y2ggKGU6IGFueSkge1xuICAgIGlmICghZS5tZXNzYWdlLmluY2x1ZGVzKCdkdXBsaWNhdGUgY29sdW1uIG5hbWUnKSkge1xuICAgICAgY29uc29sZS5lcnJvcignRXJyb3IgYWRkaW5nIGNvbXBsZXRlZF9hdCBjb2x1bW4gdG8gd29ya2Zsb3dfcnVuczonLCBlKTtcbiAgICB9XG4gIH1cblxuICB0cnkge1xuICAgIC8vIEZyZWUgTW9kZSBHb3Zlcm5vciBwYWlkLXByb3ZpZGVyIGxvY2s6IG9wdC1pbiBwZXItcHJvdmlkZXIgXCJ0aGlzIGNvc3RzXG4gICAgLy8gcmVhbCBtb25leVwiIGZsYWcuIERFRkFVTFQgMCAoZnJlZSkgZm9yIGV2ZXJ5IHJvdyBcdTIwMTQgaW5jbHVkaW5nIGFsbCBleGlzdGluZ1xuICAgIC8vIHJvd3MgXHUyMDE0IGlzIGRlbGliZXJhdGU6IG5vdGhpbmcgaXMgc2lsZW50bHkgcmVjbGFzc2lmaWVkIGJ5IHByb3ZpZGVyIHR5cGUuXG4gICAgLy8gVGhlIGdsb2JhbCBsb2NrIChzeXN0ZW1fc2V0dGluZ3MuZnJlZV9tb2RlX3VubG9ja2VkKSBvbmx5IHNraXBzIGEgcHJvdmlkZXJcbiAgICAvLyBvbmNlIGEgdXNlciBleHBsaWNpdGx5IG1hcmtzIGl0IHBhaWQsIHNvIGEgY3VycmVudGx5LXdvcmtpbmcgZnJlZSBwcm94eVxuICAgIC8vIHNldHVwIGNhbiBuZXZlciBiZSBibG9ja2VkIGJ5IHNoaXBwaW5nIHRoaXMgbWlncmF0aW9uLlxuICAgIGRiLmV4ZWMoYEFMVEVSIFRBQkxFIGxsbV9wcm92aWRlcnMgQUREIENPTFVNTiBpc19wYWlkX3RpZXIgSU5URUdFUiBOT1QgTlVMTCBERUZBVUxUIDA7YCk7XG4gIH0gY2F0Y2ggKGU6IGFueSkge1xuICAgIGlmICghZS5tZXNzYWdlLmluY2x1ZGVzKCdkdXBsaWNhdGUgY29sdW1uIG5hbWUnKSkge1xuICAgICAgY29uc29sZS5lcnJvcignRXJyb3IgYWRkaW5nIGlzX3BhaWRfdGllciBjb2x1bW4gdG8gbGxtX3Byb3ZpZGVyczonLCBlKTtcbiAgICB9XG4gIH1cblxuICB0cnkge1xuICAgIGRiLmV4ZWMoYEFMVEVSIFRBQkxFIGNlcmVicm9fbWVtb3JpZXNfbWV0YSBBREQgQ09MVU1OIHByb2plY3RfaWQgVEVYVDtgKTtcbiAgfSBjYXRjaCAoZTogYW55KSB7XG4gICAgaWYgKCFlLm1lc3NhZ2UuaW5jbHVkZXMoJ2R1cGxpY2F0ZSBjb2x1bW4gbmFtZScpKSB7XG4gICAgICBjb25zb2xlLmVycm9yKCdFcnJvciBhZGRpbmcgcHJvamVjdF9pZCBjb2x1bW4gdG8gY2VyZWJyb19tZW1vcmllc19tZXRhOicsIGUpO1xuICAgIH1cbiAgfVxuXG4gIHRyeSB7XG4gICAgLy8gUmVmbGV4aW9uIGNvbnRyYWRpY3Rpb24tZGV0ZWN0aW9uOiB3aGVuIGEgbmV3bHktZXh0cmFjdGVkIGZhY3QgaXMgaGlnaGx5XG4gICAgLy8gc2ltaWxhciAoPjAuODUpIHRvIGFuIGV4aXN0aW5nIG1lbW9yeSBidXQgaXMgY2xhc3NpZmllZCBhcyBhIGdlbnVpbmVcbiAgICAvLyB1cGRhdGUvY29udHJhZGljdGlvbiAobm90IGEgcmV3b3JkZWQgZHVwbGljYXRlKSwgaXQgaXMgcXVldWVkIGhlcmUgZm9yXG4gICAgLy8gaHVtYW4gYXBwcm92YWwgaW5zdGVhZCBvZiBiZWluZyBzaWxlbnRseSBkaXNjYXJkZWQgb3IgaW5zZXJ0ZWQgYWxvbmdzaWRlXG4gICAgLy8gYSBwb3NzaWJseS1jb25mbGljdGluZyBtZW1vcnkuIE5VTEwgZm9yIG9yZGluYXJ5IChub24tY29uZmxpY3RpbmcpIGFwcHJvdmFscy5cbiAgICBkYi5leGVjKGBBTFRFUiBUQUJMRSBjZXJlYnJvX2xlYXJuaW5nX2FwcHJvdmFscyBBREQgQ09MVU1OIGNvbmZsaWN0X3dpdGhfaWQgVEVYVDtgKTtcbiAgfSBjYXRjaCAoZTogYW55KSB7XG4gICAgaWYgKCFlLm1lc3NhZ2UuaW5jbHVkZXMoJ2R1cGxpY2F0ZSBjb2x1bW4gbmFtZScpKSB7XG4gICAgICBjb25zb2xlLmVycm9yKCdFcnJvciBhZGRpbmcgY29uZmxpY3Rfd2l0aF9pZCBjb2x1bW4gdG8gY2VyZWJyb19sZWFybmluZ19hcHByb3ZhbHM6JywgZSk7XG4gICAgfVxuICB9XG5cbiAgdHJ5IHtcbiAgICBkYi5leGVjKGBBTFRFUiBUQUJMRSBjZXJlYnJvX2xlYXJuaW5nX2FwcHJvdmFscyBBREQgQ09MVU1OIGNvbmZsaWN0X3JlYXNvbmluZyBURVhUO2ApO1xuICB9IGNhdGNoIChlOiBhbnkpIHtcbiAgICBpZiAoIWUubWVzc2FnZS5pbmNsdWRlcygnZHVwbGljYXRlIGNvbHVtbiBuYW1lJykpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIGFkZGluZyBjb25mbGljdF9yZWFzb25pbmcgY29sdW1uIHRvIGNlcmVicm9fbGVhcm5pbmdfYXBwcm92YWxzOicsIGUpO1xuICAgIH1cbiAgfVxuXG4gIHRyeSB7XG4gICAgLy8gRXhwbGljaXQgcGVyLXByb2plY3QgcmVwbyBtYXBwaW5nIGZvciB0aGUgR2l0TmV4dXMgY29kZS1zdHJ1Y3R1cmUgbW9kYWxpdHkgXHUyMDE0XG4gICAgLy8gbGV0cyByZXNvbHZlUmVwb0ZvckNhbGwoKSBkaXNhbWJpZ3VhdGUgd2hlbiBtb3JlIHRoYW4gb25lIHJlcG8gaXMgaW5kZXhlZFxuICAgIC8vIG9uIHRoZSBtYWNoaW5lLCBpbnN0ZWFkIG9mIGdpdmluZyB1cCBvbiB0aGUgd2hvbGUgbW9kYWxpdHkgKGdpdG5leHVzLWNsaWVudC50cykuXG4gICAgZGIuZXhlYyhgQUxURVIgVEFCTEUgcHJvamVjdHMgQUREIENPTFVNTiBnaXRuZXh1c19yZXBvX25hbWUgVEVYVDtgKTtcbiAgfSBjYXRjaCAoZTogYW55KSB7XG4gICAgaWYgKCFlLm1lc3NhZ2UuaW5jbHVkZXMoJ2R1cGxpY2F0ZSBjb2x1bW4gbmFtZScpKSB7XG4gICAgICBjb25zb2xlLmVycm9yKCdFcnJvciBhZGRpbmcgZ2l0bmV4dXNfcmVwb19uYW1lIGNvbHVtbiB0byBwcm9qZWN0czonLCBlKTtcbiAgICB9XG4gIH1cblxuICAvLyBQZXItcHJvamVjdCBleGVjdXRpb24gcGVybWlzc2lvbiBhcmNoZXR5cGUgKHJlYWwgZW5mb3JjZW1lbnQsIGdhdGVkIGluXG4gIC8vIGNvcmUvY29yZWV4ZWMvd29ya2VyLnRzKS4gTnVsbGFibGUgd2l0aCBOTyBkZWZhdWx0OiBOVUxMIG1lYW5zIFwibm9cbiAgLy8gYXJjaGV0eXBlIGFzc2lnbmVkIFx1MjAxNCBiZWhhdmUgZXhhY3RseSBhcyB0b2RheSwgZnVsbHkgcGVybWlzc2l2ZVwiLiBBXG4gIC8vIG5vbi1OVUxMIHZhbHVlIChlLmcuICdjb2RlX2V4ZWN1dGUnIHwgJ3Jlc2VhcmNoX29ubHknIHwgJ2FkbWluX29wZXJhdG9yJylcbiAgLy8gb3B0cyB0aGUgcHJvamVjdCBpbnRvIGdhdGluZyBvZiB0aGUgc2hlbGwvc2NyYXBlIHRhc2sgYWN0aW9ucy5cbiAgdHJ5IHtcbiAgICBkYi5leGVjKGBBTFRFUiBUQUJMRSBwcm9qZWN0cyBBREQgQ09MVU1OIHBlcm1pc3Npb25fYXJjaGV0eXBlIFRFWFQ7YCk7XG4gIH0gY2F0Y2ggKGU6IGFueSkge1xuICAgIGlmICghZS5tZXNzYWdlLmluY2x1ZGVzKCdkdXBsaWNhdGUgY29sdW1uIG5hbWUnKSkge1xuICAgICAgY29uc29sZS5lcnJvcignRXJyb3IgYWRkaW5nIHBlcm1pc3Npb25fYXJjaGV0eXBlIGNvbHVtbiB0byBwcm9qZWN0czonLCBlKTtcbiAgICB9XG4gIH1cblxuICB0cnkge1xuICAgIGRiLmV4ZWMoYEFMVEVSIFRBQkxFIHByb2plY3RzIEFERCBDT0xVTU4gcHJvamVjdF9yb290X3BhdGggVEVYVDtgKTtcbiAgfSBjYXRjaCAoZTogYW55KSB7XG4gICAgaWYgKCFlLm1lc3NhZ2UuaW5jbHVkZXMoJ2R1cGxpY2F0ZSBjb2x1bW4gbmFtZScpKSB7XG4gICAgICBjb25zb2xlLmVycm9yKCdFcnJvciBhZGRpbmcgcHJvamVjdF9yb290X3BhdGggY29sdW1uIHRvIHByb2plY3RzOicsIGUpO1xuICAgIH1cbiAgfVxuXG4gIG1pZ3JhdGVQZW5kaW5nUHJvcG9zYWxCbG9iKCk7XG59XG5cbi8qKlxuICogT25lLXRpbWUgbWlncmF0aW9uOiBhbiBleGlzdGluZyBzdGFnZWQgcHJvcG9zYWwgdXNlZCB0byBsaXZlIGFzIGEgc2luZ2xlIEpTT05cbiAqIGJsb2IgaW4gc3lzdGVtX3NldHRpbmdzIHVuZGVyIHRoZSBrZXkgJ3BlbmRpbmdfcHJvcG9zYWwnLiBNb3ZlIGFueSBzdWNoIGJsb2JcbiAqIGludG8gdGhlIG5ldyBkYWdfcHJvcG9zYWxzIHRhYmxlIChkZWZhdWx0IGNvbmZpZGVuY2UgMC41LCBubyBwcm9qZWN0IHNjb3BlLFxuICogc3RhdHVzICdwZW5kaW5nJykgc28gaXQgZG9lcyBOT1Qgc2lsZW50bHkgdmFuaXNoIGZvciBhIHVzZXIgd2hvIGhhcyBvbmVcbiAqIHN0YWdlZCByaWdodCBub3csIHRoZW4gZGVsZXRlIHRoZSBvbGQga2V5LiBJZGVtcG90ZW50OiBhZnRlciB0aGUga2V5IGlzXG4gKiBjbGVhcmVkIHRoaXMgaXMgYSBuby1vcC4gT25seSBoYW5kbGVzIHRoZSBzaW5nbGUta2V5IGNhc2UgdGhhdCBleGlzdHMgdG9kYXkuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBtaWdyYXRlUGVuZGluZ1Byb3Bvc2FsQmxvYigpIHtcbiAgdHJ5IHtcbiAgICBjb25zdCBsZWdhY3kgPSBkYlxuICAgICAgLnByZXBhcmUoXCJTRUxFQ1QgdmFsdWUgRlJPTSBzeXN0ZW1fc2V0dGluZ3MgV0hFUkUga2V5ID0gJ3BlbmRpbmdfcHJvcG9zYWwnXCIpXG4gICAgICAuZ2V0KCkgYXMgeyB2YWx1ZTogc3RyaW5nIH0gfCB1bmRlZmluZWQ7XG4gICAgaWYgKCFsZWdhY3kpIHJldHVybjtcblxuICAgIGRiLnRyYW5zYWN0aW9uKCgpID0+IHtcbiAgICAgIGRiLnByZXBhcmUoXG4gICAgICAgICdJTlNFUlQgSU5UTyBkYWdfcHJvcG9zYWxzIChpZCwgcHJvamVjdF9pZCwgcHJvcG9zYWwsIGNvbmZpZGVuY2UsIHN0YXR1cywgY3JlYXRlZF9hdCkgVkFMVUVTICg/LCA/LCA/LCA/LCA/LCA/KScsXG4gICAgICApLnJ1bihyYW5kb21VVUlEKCksIG51bGwsIGxlZ2FjeS52YWx1ZSwgMC41LCAncGVuZGluZycsIERhdGUubm93KCkpO1xuICAgICAgZGIucHJlcGFyZShcIkRFTEVURSBGUk9NIHN5c3RlbV9zZXR0aW5ncyBXSEVSRSBrZXkgPSAncGVuZGluZ19wcm9wb3NhbCdcIikucnVuKCk7XG4gICAgfSkoKTtcbiAgfSBjYXRjaCAoZTogYW55KSB7XG4gICAgY29uc29sZS5lcnJvcignRXJyb3IgbWlncmF0aW5nIGxlZ2FjeSBwZW5kaW5nX3Byb3Bvc2FsIGJsb2I6JywgZSk7XG4gIH1cbn1cbiIsICJpbXBvcnQgeyBkYiB9IGZyb20gJy4uLy4uL2Jhc2V2YXVsdC9kYic7XG5pbXBvcnQgY3J5cHRvIGZyb20gJ2NyeXB0byc7XG5cbi8qKlxuICogQ2VyZWJyb0Rhc2hib2FyZCdzIFwiQmFzZSBTY29yZVwiIC8gXCJNYXRjaCBCb29zdFwiIHNsaWRlcnMgKE1lbW9yeSBTZWFyY2hcbiAqIFNldHRpbmdzLCBrZXl3b3JkLWZhbGxiYWNrIHNlY3Rpb24pIHBlcnNpc3RlZCBgY2VyZWJyb19rZXl3b3JkX2Jhc2VgIC9cbiAqIGBjZXJlYnJvX2tleXdvcmRfYm9vc3RgIHRvIHN5c3RlbV9zZXR0aW5ncyBzaW5jZSB0aGVpciBpbnRyb2R1Y3Rpb24sIGJ1dFxuICogbm90aGluZyBldmVyIHJlYWQgZWl0aGVyIGtleSBiYWNrIFx1MjAxNCBgX2tleXdvcmRGYWxsYmFja1NlYXJjaGAgYWx3YXlzIHVzZWRcbiAqIHRoZSBoYXJkY29kZWQgZm9ybXVsYSBgMC43ICsgKG1hdGNoQ291bnQgKiAwLjA1KWAuIFRoZXNlIGFyZSB0aGUgZGVmYXVsdHMsXG4gKiBtYXRjaGluZyB0aGF0IGZvcm11bGEgZXhhY3RseSBzbyBhIGZyZXNoIGluc3RhbGwgKG5vIHNldHRpbmdzIHJvdyB5ZXQsIG9yXG4gKiBhbnkgdGVzdCB0aGF0IG5ldmVyIHRvdWNoZXMgc3lzdGVtX3NldHRpbmdzKSBiZWhhdmVzIGlkZW50aWNhbGx5IHRvXG4gKiBiZWZvcmUgdGhpcyBjaGFuZ2UuXG4gKi9cbmV4cG9ydCBjb25zdCBERUZBVUxUX0tFWVdPUkRfQkFTRSA9IDAuNztcbmV4cG9ydCBjb25zdCBERUZBVUxUX0tFWVdPUkRfQk9PU1QgPSAwLjA1O1xuXG5jb25zdCBLRVlXT1JEX1NFVFRJTkdTX0NBQ0hFX1RUTF9NUyA9IDIwMDA7XG5sZXQgY2FjaGVkS2V5d29yZEJhc2UgPSBERUZBVUxUX0tFWVdPUkRfQkFTRTtcbmxldCBjYWNoZWRLZXl3b3JkQm9vc3QgPSBERUZBVUxUX0tFWVdPUkRfQk9PU1Q7XG5sZXQgY2FjaGVkS2V5d29yZFNldHRpbmdzQXQgPSAwO1xuXG4vKipcbiAqIFNob3J0LVRUTCBjYWNoZWQgcmVhZCBvZiB0aGUgdHdvIGtleXdvcmQtZmFsbGJhY2sgc2V0dGluZ3MsIHNhbWUgcGF0dGVyblxuICogYXMgYGlzRnJlZU1vZGVVbmxvY2tlZGAgaW4gYHNyYy9jb3JlL3JvdXRlc3dpdGNoL2dvdmVybm9yLnRzYCBcdTIwMTQgYSBVSVxuICogY2hhbmdlIHRha2VzIGVmZmVjdCB3aXRoaW4gYSBjb3VwbGUgc2Vjb25kcyB3aXRob3V0IGEgREIgaGl0IG9uIGV2ZXJ5XG4gKiBzZWFyY2ggY2FsbC4gRXhwb3J0ZWQgc28gYHNlYXJjaGAvYF9rZXl3b3JkRmFsbGJhY2tTZWFyY2hgIGNhbGxlcnMgb3V0c2lkZVxuICogdGhpcyBtb2R1bGUgKGUuZy4gdGVzdHMpIGNhbiBhbHNvIHJlYWQgdGhlIGN1cnJlbnRseS1lZmZlY3RpdmUgdmFsdWVzLlxuICovXG5leHBvcnQgZnVuY3Rpb24gZ2V0S2V5d29yZFNjb3JpbmdTZXR0aW5ncygpOiB7IGJhc2VTY29yZTogbnVtYmVyOyBtYXRjaEJvb3N0OiBudW1iZXIgfSB7XG4gIGNvbnN0IG5vdyA9IERhdGUubm93KCk7XG4gIGlmIChub3cgLSBjYWNoZWRLZXl3b3JkU2V0dGluZ3NBdCA+IEtFWVdPUkRfU0VUVElOR1NfQ0FDSEVfVFRMX01TKSB7XG4gICAgY2FjaGVkS2V5d29yZFNldHRpbmdzQXQgPSBub3c7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHJvd3MgPSBkYlxuICAgICAgICAucHJlcGFyZShcbiAgICAgICAgICBgU0VMRUNUIGtleSwgdmFsdWUgRlJPTSBzeXN0ZW1fc2V0dGluZ3MgV0hFUkUga2V5IElOICgnY2VyZWJyb19rZXl3b3JkX2Jhc2UnLCAnY2VyZWJyb19rZXl3b3JkX2Jvb3N0JylgLFxuICAgICAgICApXG4gICAgICAgIC5hbGwoKSBhcyB7IGtleTogc3RyaW5nOyB2YWx1ZTogc3RyaW5nIH1bXTtcblxuICAgICAgbGV0IGJhc2VTY29yZSA9IERFRkFVTFRfS0VZV09SRF9CQVNFO1xuICAgICAgbGV0IG1hdGNoQm9vc3QgPSBERUZBVUxUX0tFWVdPUkRfQk9PU1Q7XG4gICAgICBmb3IgKGNvbnN0IHJvdyBvZiByb3dzKSB7XG4gICAgICAgIGNvbnN0IG4gPSBOdW1iZXIocm93LnZhbHVlKTtcbiAgICAgICAgaWYgKCFOdW1iZXIuaXNGaW5pdGUobikpIGNvbnRpbnVlO1xuICAgICAgICBpZiAocm93LmtleSA9PT0gJ2NlcmVicm9fa2V5d29yZF9iYXNlJykgYmFzZVNjb3JlID0gbjtcbiAgICAgICAgaWYgKHJvdy5rZXkgPT09ICdjZXJlYnJvX2tleXdvcmRfYm9vc3QnKSBtYXRjaEJvb3N0ID0gbjtcbiAgICAgIH1cbiAgICAgIGNhY2hlZEtleXdvcmRCYXNlID0gYmFzZVNjb3JlO1xuICAgICAgY2FjaGVkS2V5d29yZEJvb3N0ID0gbWF0Y2hCb29zdDtcbiAgICB9IGNhdGNoIHtcbiAgICAgIC8vIERCIG5vdCBpbml0aWFsaXplZCB5ZXQsIG9yIHRhYmxlIG1pc3NpbmcgXHUyMDE0IHNhZmUgZGVmYXVsdHMuXG4gICAgICBjYWNoZWRLZXl3b3JkQmFzZSA9IERFRkFVTFRfS0VZV09SRF9CQVNFO1xuICAgICAgY2FjaGVkS2V5d29yZEJvb3N0ID0gREVGQVVMVF9LRVlXT1JEX0JPT1NUO1xuICAgIH1cbiAgfVxuICByZXR1cm4geyBiYXNlU2NvcmU6IGNhY2hlZEtleXdvcmRCYXNlLCBtYXRjaEJvb3N0OiBjYWNoZWRLZXl3b3JkQm9vc3QgfTtcbn1cblxuLyoqIFRlc3Qtb25seTogZm9yY2UgdGhlIGtleXdvcmQtc2NvcmluZyBzZXR0aW5ncyBjYWNoZSB0byByZS1yZWFkLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIF9yZXNldEtleXdvcmRTY29yaW5nQ2FjaGUoKTogdm9pZCB7XG4gIGNhY2hlZEtleXdvcmRTZXR0aW5nc0F0ID0gMDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBNZW1vcnlSZWNvcmQge1xuICBpZDogc3RyaW5nO1xuICBjb250ZW50OiBzdHJpbmc7XG4gIHR5cGU6IHN0cmluZztcbiAgcHJvamVjdF9pZD86IHN0cmluZyB8IG51bGw7XG4gIGxhc3RfYWNjZXNzZWRfYXQ6IG51bWJlcjtcbiAgYWNjZXNzX2NvdW50OiBudW1iZXI7XG4gIGNyZWF0ZWRfYXQ6IG51bWJlcjtcbiAgc2ltaWxhcml0eT86IG51bWJlcjtcbn1cblxuZXhwb3J0IGNsYXNzIENlcmVicm9WZWN0b3JTdG9yZSB7XG4gIC8qKlxuICAgKiBJbnNlcnRzIGEgbWVtb3J5IGludG8gdGhlIHZlY3RvciBzdG9yZS5cbiAgICogSWYgZW1iZWRkaW5nIGlzIG51bGwsIGl0IHJlbGllcyBlbnRpcmVseSBvbiB0aGUgS2V5d29yZCBGYWxsYmFjayBFbmdpbmUgZm9yIHJldHJpZXZhbC5cbiAgICogcHJvamVjdElkIG51bGwvdW5kZWZpbmVkID0gR0xPQkFML1VTRVItdGllciBtZW1vcnksIHZpc2libGUgdG8gZXZlcnkgcHJvamVjdC5cbiAgICovXG4gIHB1YmxpYyBzdGF0aWMgaW5zZXJ0KGNvbnRlbnQ6IHN0cmluZywgdHlwZTogc3RyaW5nLCBlbWJlZGRpbmc/OiBGbG9hdDMyQXJyYXksIHByb2plY3RJZD86IHN0cmluZyB8IG51bGwpOiBzdHJpbmcge1xuICAgIGNvbnN0IGlkID0gY3J5cHRvLnJhbmRvbVVVSUQoKTtcbiAgICBjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuXG4gICAgLy8gMS4gSW5zZXJ0IE1ldGFcbiAgICBkYi5wcmVwYXJlKGBcbiAgICAgIElOU0VSVCBJTlRPIGNlcmVicm9fbWVtb3JpZXNfbWV0YSAoaWQsIGNvbnRlbnQsIHR5cGUsIHByb2plY3RfaWQsIGxhc3RfYWNjZXNzZWRfYXQsIGFjY2Vzc19jb3VudCwgY3JlYXRlZF9hdClcbiAgICAgIFZBTFVFUyAoPywgPywgPywgPywgPywgPywgPylcbiAgICBgKS5ydW4oaWQsIGNvbnRlbnQsIHR5cGUsIHByb2plY3RJZCA/PyBudWxsLCBub3csIDAsIG5vdyk7XG5cbiAgICAvLyAyLiBJbnNlcnQgVmVjdG9yIGlmIHByb3ZpZGVkXG4gICAgaWYgKGVtYmVkZGluZykge1xuICAgICAgZGIucHJlcGFyZShgXG4gICAgICAgIElOU0VSVCBJTlRPIGNlcmVicm9fbWVtb3JpZXNfdmVjIChpZCwgZW1iZWRkaW5nKVxuICAgICAgICBWQUxVRVMgKD8sID8pXG4gICAgICBgKS5ydW4oaWQsIGVtYmVkZGluZyk7XG4gICAgfVxuXG4gICAgcmV0dXJuIGlkO1xuICB9XG5cbiAgLyoqXG4gICAqIFNlYXJjaGVzIHRoZSBtZW1vcnkuXG4gICAqIElmIHF1ZXJ5RW1iZWRkaW5nIGlzIG5vdCBwcm92aWRlZCAob2ZmbGluZSBsb2NhbCBtb2RlKSwgaXQgc2VhbWxlc3NseSBkZWdyYWRlcyB0byB0aGUgS2V5d29yZCBGYWxsYmFjayBFbmdpbmUuXG4gICAqIFdoZW4gcHJvamVjdElkIGlzIHByb3ZpZGVkLCByZXN1bHRzIGFyZSBzY29wZWQgdG8gdGhhdCBwcm9qZWN0J3MgUFJPSkVDVC10aWVyXG4gICAqIG1lbW9yaWVzIHBsdXMgdW50YWdnZWQgKEdMT0JBTC9VU0VSLXRpZXIpIG1lbW9yaWVzIFx1MjAxNCBuZXZlciBhbm90aGVyIHByb2plY3Qncy5cbiAgICovXG4gIHB1YmxpYyBzdGF0aWMgc2VhcmNoKHF1ZXJ5OiBzdHJpbmcsIHR5cGVGaWx0ZXI/OiBzdHJpbmcsIHF1ZXJ5RW1iZWRkaW5nPzogRmxvYXQzMkFycmF5LCBsaW1pdDogbnVtYmVyID0gNSwgcHJvamVjdElkPzogc3RyaW5nKTogTWVtb3J5UmVjb3JkW10ge1xuICAgIGlmIChxdWVyeUVtYmVkZGluZykge1xuICAgICAgcmV0dXJuIHRoaXMuX3ZlY3RvclNlYXJjaChxdWVyeUVtYmVkZGluZywgdHlwZUZpbHRlciwgbGltaXQsIHByb2plY3RJZCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiB0aGlzLl9rZXl3b3JkRmFsbGJhY2tTZWFyY2gocXVlcnksIHR5cGVGaWx0ZXIsIGxpbWl0LCBwcm9qZWN0SWQpO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgc3RhdGljIF92ZWN0b3JTZWFyY2goZW1iZWRkaW5nOiBGbG9hdDMyQXJyYXksIHR5cGVGaWx0ZXI/OiBzdHJpbmcsIGxpbWl0OiBudW1iZXIgPSA1LCBwcm9qZWN0SWQ/OiBzdHJpbmcpOiBNZW1vcnlSZWNvcmRbXSB7XG4gICAgY29uc3QgZmlsdGVyU1FMID0gdHlwZUZpbHRlciA/IGBBTkQgbS50eXBlID0gJyR7dHlwZUZpbHRlcn0nYCA6ICcnO1xuICAgIGNvbnN0IHNjb3BlU1FMID0gcHJvamVjdElkID8gYEFORCAobS5wcm9qZWN0X2lkID0gPyBPUiBtLnByb2plY3RfaWQgSVMgTlVMTClgIDogJyc7XG5cbiAgICBjb25zdCBrbm5RdWVyeSA9IGRiLnByZXBhcmUoYFxuICAgICAgU0VMRUNUIG0uaWQsIG0uY29udGVudCwgbS50eXBlLCBtLnByb2plY3RfaWQsIG0ubGFzdF9hY2Nlc3NlZF9hdCwgbS5hY2Nlc3NfY291bnQsIG0uY3JlYXRlZF9hdCwgdi5kaXN0YW5jZVxuICAgICAgRlJPTSBjZXJlYnJvX21lbW9yaWVzX3ZlYyB2XG4gICAgICBKT0lOIGNlcmVicm9fbWVtb3JpZXNfbWV0YSBtIE9OIHYuaWQgPSBtLmlkXG4gICAgICBXSEVSRSB2LmVtYmVkZGluZyBNQVRDSCA/IEFORCBrID0gP1xuICAgICAgJHtmaWx0ZXJTUUx9XG4gICAgICAke3Njb3BlU1FMfVxuICAgICAgT1JERVIgQlkgdi5kaXN0YW5jZSBBU0NcbiAgICBgKTtcblxuICAgIGNvbnN0IHBhcmFtczogdW5rbm93bltdID0gW2VtYmVkZGluZywgbGltaXRdO1xuICAgIGlmIChwcm9qZWN0SWQpIHBhcmFtcy5wdXNoKHByb2plY3RJZCk7XG4gICAgY29uc3Qgcm93cyA9IGtublF1ZXJ5LmFsbCguLi5wYXJhbXMpIGFzIGFueVtdO1xuXG4gICAgcmV0dXJuIHJvd3MubWFwKHIgPT4gKHtcbiAgICAgIGlkOiByLmlkLFxuICAgICAgY29udGVudDogci5jb250ZW50LFxuICAgICAgdHlwZTogci50eXBlLFxuICAgICAgcHJvamVjdF9pZDogci5wcm9qZWN0X2lkLFxuICAgICAgbGFzdF9hY2Nlc3NlZF9hdDogci5sYXN0X2FjY2Vzc2VkX2F0LFxuICAgICAgYWNjZXNzX2NvdW50OiByLmFjY2Vzc19jb3VudCxcbiAgICAgIGNyZWF0ZWRfYXQ6IHIuY3JlYXRlZF9hdCxcbiAgICAgIHNpbWlsYXJpdHk6IE1hdGgubWF4KDAsIDEuMCAtIHIuZGlzdGFuY2UpIC8vIE5vcm1hbGl6ZSBkaXN0YW5jZSBpbnRvIHNpbWlsYXJpdHkgc2NvcmVcbiAgICB9KSk7XG4gIH1cblxuICBwcml2YXRlIHN0YXRpYyBfa2V5d29yZEZhbGxiYWNrU2VhcmNoKHF1ZXJ5OiBzdHJpbmcsIHR5cGVGaWx0ZXI/OiBzdHJpbmcsIGxpbWl0OiBudW1iZXIgPSA1LCBwcm9qZWN0SWQ/OiBzdHJpbmcpOiBNZW1vcnlSZWNvcmRbXSB7XG4gICAgLy8gRGV0ZXJtaW5pc3RpYyBmYWxsYmFjazogVG9rZW4gZmlsdGVyIGxlbmd0aCA+IDNcbiAgICAvLyBGb3JtdWxhOiBTaW1pbGFyaXR5ID0gYmFzZVNjb3JlICsgKG1hdGNoQ291bnQgKiBtYXRjaEJvb3N0KSwgcmVhZCBmcm9tXG4gICAgLy8gQ2VyZWJyb0Rhc2hib2FyZCdzIFwiQmFzZSBTY29yZVwiIC8gXCJNYXRjaCBCb29zdFwiIHNldHRpbmdzIChkZWZhdWx0c1xuICAgIC8vIDAuNyAvIDAuMDUsIG1hdGNoaW5nIHRoZSBwcmUtZXhpc3RpbmcgaGFyZGNvZGVkIGZvcm11bGEpLlxuICAgIGNvbnN0IHsgYmFzZVNjb3JlLCBtYXRjaEJvb3N0IH0gPSBnZXRLZXl3b3JkU2NvcmluZ1NldHRpbmdzKCk7XG5cbiAgICBjb25zdCBxdWVyeVRva2VucyA9IHF1ZXJ5LnRvTG93ZXJDYXNlKCkuc3BsaXQoL1xcVysvKS5maWx0ZXIodCA9PiB0Lmxlbmd0aCA+IDMpO1xuXG4gICAgY29uc3QgY29uZGl0aW9uczogc3RyaW5nW10gPSBbXTtcbiAgICBjb25zdCBwYXJhbXM6IHVua25vd25bXSA9IFtdO1xuICAgIGlmICh0eXBlRmlsdGVyKSB7XG4gICAgICBjb25kaXRpb25zLnB1c2goJ3R5cGUgPSA/Jyk7XG4gICAgICBwYXJhbXMucHVzaCh0eXBlRmlsdGVyKTtcbiAgICB9XG4gICAgaWYgKHByb2plY3RJZCkge1xuICAgICAgY29uZGl0aW9ucy5wdXNoKCcocHJvamVjdF9pZCA9ID8gT1IgcHJvamVjdF9pZCBJUyBOVUxMKScpO1xuICAgICAgcGFyYW1zLnB1c2gocHJvamVjdElkKTtcbiAgICB9XG4gICAgY29uc3Qgd2hlcmUgPSBjb25kaXRpb25zLmxlbmd0aCA+IDAgPyBgV0hFUkUgJHtjb25kaXRpb25zLmpvaW4oJyBBTkQgJyl9YCA6ICcnO1xuICAgIGNvbnN0IHNxbCA9IGBTRUxFQ1QgKiBGUk9NIGNlcmVicm9fbWVtb3JpZXNfbWV0YSAke3doZXJlfWA7XG5cbiAgICBjb25zdCBhbGxSZWNvcmRzID0gcGFyYW1zLmxlbmd0aCA+IDAgPyBkYi5wcmVwYXJlKHNxbCkuYWxsKC4uLnBhcmFtcykgOiBkYi5wcmVwYXJlKHNxbCkuYWxsKCk7XG5cbiAgICBjb25zdCBzY29yZWRSZWNvcmRzID0gKGFsbFJlY29yZHMgYXMgYW55W10pLm1hcChyZWNvcmQgPT4ge1xuICAgICAgY29uc3QgY29udGVudFRva2VucyA9IHJlY29yZC5jb250ZW50LnRvTG93ZXJDYXNlKCkuc3BsaXQoL1xcVysvKS5maWx0ZXIoKHQ6IHN0cmluZykgPT4gdC5sZW5ndGggPiAzKTtcbiAgICAgIFxuICAgICAgbGV0IG1hdGNoQ291bnQgPSAwO1xuICAgICAgZm9yIChjb25zdCBxdCBvZiBxdWVyeVRva2Vucykge1xuICAgICAgICBpZiAoY29udGVudFRva2Vucy5pbmNsdWRlcyhxdCkpIHtcbiAgICAgICAgICBtYXRjaENvdW50Kys7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgY29uc3Qgc2ltaWxhcml0eSA9IG1hdGNoQ291bnQgPiAwID8gYmFzZVNjb3JlICsgKG1hdGNoQ291bnQgKiBtYXRjaEJvb3N0KSA6IDA7XG4gICAgICBcbiAgICAgIHJldHVybiB7XG4gICAgICAgIC4uLnJlY29yZCxcbiAgICAgICAgc2ltaWxhcml0eVxuICAgICAgfTtcbiAgICB9KTtcblxuICAgIHJldHVybiBzY29yZWRSZWNvcmRzXG4gICAgICAuZmlsdGVyKHIgPT4gci5zaW1pbGFyaXR5ID4gMClcbiAgICAgIC5zb3J0KChhLCBiKSA9PiBiLnNpbWlsYXJpdHkgLSBhLnNpbWlsYXJpdHkpXG4gICAgICAuc2xpY2UoMCwgbGltaXQpO1xuICB9XG59XG4iLCAiaW1wb3J0IHsgTWVtb3J5UmVjb3JkIH0gZnJvbSAnLi92ZWN0b3InO1xuXG4vKiogRGVmYXVsdCBkZWNheS1yYXRlIGNvZWZmaWNpZW50IChcdTAzOTR0IG11bHRpcGxpZXIpIGluIHRoZSBiaW9sb2dpY2FsIGRlY2F5IGZvcm11bGEuICovXG5leHBvcnQgY29uc3QgREVGQVVMVF9ERUNBWV9SQVRFID0gMC4zO1xuLyoqIERlZmF1bHQgYWNjZXNzLWNvdW50IGJvb3N0IG11bHRpcGxpZXIgaW4gdGhlIGJpb2xvZ2ljYWwgZGVjYXkgZm9ybXVsYS4gKi9cbmV4cG9ydCBjb25zdCBERUZBVUxUX0FDQ0VTU19CT09TVCA9IDEuNTtcblxuLyoqXG4gKiBQdXJlIGRlY2F5LWZhY3RvciBmdW5jdGlvbjogZV4oLShkYXlzU2luY2VBY2Nlc3MgKiBkZWNheVJhdGUpKS5cbiAqIFNoYXJlZCBieSBIYWJpdHVhdGlvblNjb3Jlci5yYW5rIGFuZCB0aGUgc2VydmVyLXNpZGUgZGVjYXktc3RhdHMvcHJ1bmVcbiAqIHJvdXRlcyBzbyB0aGVyZSBpcyBhIHNpbmdsZSBzb3VyY2Ugb2YgdHJ1dGggZm9yIHRoZSBmb3JtdWxhLlxuICovXG5leHBvcnQgZnVuY3Rpb24gY29tcHV0ZURlY2F5RmFjdG9yKGRheXNTaW5jZUFjY2VzczogbnVtYmVyLCBkZWNheVJhdGU6IG51bWJlciA9IERFRkFVTFRfREVDQVlfUkFURSk6IG51bWJlciB7XG4gIHJldHVybiBNYXRoLmV4cCgtKGRheXNTaW5jZUFjY2VzcyAqIGRlY2F5UmF0ZSkpO1xufVxuXG5leHBvcnQgY2xhc3MgSGFiaXR1YXRpb25TY29yZXIge1xuICAvKipcbiAgICogQXBwbGllcyB0aGUgYmlvbG9naWNhbCBkZWNheSBmb3JtdWxhIHRvIHJhbmsgbWVtb3JpZXM6XG4gICAqIFJfZmluYWwgPSBSX3NlbWFudGljICogKGZfYWNjZXNzICogYm9vc3RNdWx0aXBsaWVyKSAqIGVeKC0oXHUwMzk0dCAqIGRlY2F5UmF0ZSkpXG4gICAqXG4gICAqIEBwYXJhbSByZWNvcmRzIFRoZSBpbml0aWFsIHNlbWFudGljIHJlY29yZHMgKGZyb20gdmVjdG9yIG9yIGZhbGxiYWNrIHNlYXJjaClcbiAgICogQHBhcmFtIGN1cnJlbnRUaW1lIEN1cnJlbnQgdGltZXN0YW1wIGluIG1zIChkZWZhdWx0cyB0byBEYXRlLm5vdygpKVxuICAgKiBAcGFyYW0gZGVjYXlSYXRlIFx1MDM5NHQgbXVsdGlwbGllciBpbiB0aGUgZGVjYXkgZXhwb25lbnQgKGRlZmF1bHRzIHRvIERFRkFVTFRfREVDQVlfUkFURSlcbiAgICogQHBhcmFtIGJvb3N0TXVsdGlwbGllciBBY2Nlc3MtY291bnQgYm9vc3QgbXVsdGlwbGllciAoZGVmYXVsdHMgdG8gREVGQVVMVF9BQ0NFU1NfQk9PU1QpXG4gICAqIEByZXR1cm5zIFJlLXJhbmtlZCByZWNvcmRzIHNvcnRlZCBieSBSX2ZpbmFsIGRlc2NlbmRpbmdcbiAgICovXG4gIHB1YmxpYyBzdGF0aWMgcmFuayhcbiAgICByZWNvcmRzOiBNZW1vcnlSZWNvcmRbXSxcbiAgICBjdXJyZW50VGltZTogbnVtYmVyID0gRGF0ZS5ub3coKSxcbiAgICBkZWNheVJhdGU6IG51bWJlciA9IERFRkFVTFRfREVDQVlfUkFURSxcbiAgICBib29zdE11bHRpcGxpZXI6IG51bWJlciA9IERFRkFVTFRfQUNDRVNTX0JPT1NUXG4gICk6IE1lbW9yeVJlY29yZFtdIHtcbiAgICByZXR1cm4gcmVjb3Jkcy5tYXAocmVjb3JkID0+IHtcbiAgICAgIC8vIERlbHRhIFQgaW4gZGF5c1xuICAgICAgY29uc3QgZGF5c1NpbmNlQWNjZXNzID0gTWF0aC5tYXgoMCwgKGN1cnJlbnRUaW1lIC0gcmVjb3JkLmxhc3RfYWNjZXNzZWRfYXQpIC8gKDEwMDAgKiA2MCAqIDYwICogMjQpKTtcblxuICAgICAgLy8gZl9hY2Nlc3M6IFRyZWF0IDAgYWNjZXNzZXMgYXMgMSBmb3IgYmFzZSBtdWx0aXBsaWVyXG4gICAgICBjb25zdCBmX2FjY2VzcyA9IE1hdGgubWF4KDEsIHJlY29yZC5hY2Nlc3NfY291bnQpO1xuXG4gICAgICBjb25zdCByX3NlbWFudGljID0gcmVjb3JkLnNpbWlsYXJpdHkgfHwgMC4xOyAvLyBCYXNlbGluZSBpZiBtaXNzaW5nXG5cbiAgICAgIC8vIEZvcm11bGFcbiAgICAgIGNvbnN0IGRlY2F5RmFjdG9yID0gY29tcHV0ZURlY2F5RmFjdG9yKGRheXNTaW5jZUFjY2VzcywgZGVjYXlSYXRlKTtcbiAgICAgIGNvbnN0IGJvb3N0RmFjdG9yID0gZl9hY2Nlc3MgKiBib29zdE11bHRpcGxpZXI7XG5cbiAgICAgIGNvbnN0IHJfZmluYWwgPSByX3NlbWFudGljICogYm9vc3RGYWN0b3IgKiBkZWNheUZhY3RvcjtcblxuICAgICAgcmV0dXJuIHtcbiAgICAgICAgLi4ucmVjb3JkLFxuICAgICAgICByX2ZpbmFsXG4gICAgICB9O1xuICAgIH0pLnNvcnQoKGEsIGIpID0+IGIucl9maW5hbCAtIGEucl9maW5hbCk7XG4gIH1cbn1cbiIsICJpbXBvcnQgeyBkYiwgaW5pdERCIH0gZnJvbSAnLi4vLi4vYmFzZXZhdWx0L2RiJztcbmltcG9ydCB7IENlcmVicm9WZWN0b3JTdG9yZSB9IGZyb20gJy4vdmVjdG9yJztcbmltcG9ydCB7IEhhYml0dWF0aW9uU2NvcmVyIH0gZnJvbSAnLi9oYWJpdHVhdGlvbic7XG5pbXBvcnQgY3J5cHRvIGZyb20gJ2NyeXB0byc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgQ2VyZWJyb1dvcmtlcklucHV0IHtcbiAgaGlzdG9yeVRvUHJvY2Vzcz86IHN0cmluZ1tdO1xuICBleHRyYWN0ZWRGYWN0cz86IHN0cmluZ1tdO1xuICBjbGFzc2lmaWNhdGlvbnM/OiB7IGZhY3Q6IHN0cmluZywgZXhpc3RpbmdDb250ZW50OiBzdHJpbmcsIGNsYXNzaWZpY2F0aW9uOiAnZHVwbGljYXRlJyB8ICd1cGRhdGUnIHwgJ3VucmVsYXRlZCcgfVtdO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcnVuUmVmbGVjdGlvblN3ZWVwKGlucHV0OiBDZXJlYnJvV29ya2VySW5wdXQpIHtcbiAgaW5pdERCKCk7XG4gIFxuICBpZiAoaW5wdXQuZXh0cmFjdGVkRmFjdHMpIHtcbiAgICBmb3IgKGNvbnN0IGZhY3Qgb2YgaW5wdXQuZXh0cmFjdGVkRmFjdHMpIHtcbiAgICAgIGNvbnN0IGV4aXN0aW5nID0gQ2VyZWJyb1ZlY3RvclN0b3JlLnNlYXJjaChmYWN0LCAncHJlZmVyZW5jZScsIHVuZGVmaW5lZCwgMSk7XG4gICAgICBsZXQgc2tpcCA9IGZhbHNlO1xuICAgICAgXG4gICAgICBpZiAoZXhpc3RpbmcubGVuZ3RoID4gMCAmJiBleGlzdGluZ1swXSEuc2ltaWxhcml0eSEgPiAwLjg1KSB7XG4gICAgICAgIGNvbnN0IGNsYXNzaWZpY2F0aW9uTWF0Y2ggPSBpbnB1dC5jbGFzc2lmaWNhdGlvbnM/LmZpbmQoYyA9PiBjLmZhY3QgPT09IGZhY3QgJiYgYy5leGlzdGluZ0NvbnRlbnQgPT09IGV4aXN0aW5nWzBdIS5jb250ZW50KTtcbiAgICAgICAgY29uc3QgY2xhc3NpZmljYXRpb24gPSBjbGFzc2lmaWNhdGlvbk1hdGNoID8gY2xhc3NpZmljYXRpb25NYXRjaC5jbGFzc2lmaWNhdGlvbiA6IChmYWN0LnRyaW0oKS50b0xvd2VyQ2FzZSgpID09PSBleGlzdGluZ1swXSEuY29udGVudC50cmltKCkudG9Mb3dlckNhc2UoKSA/ICdkdXBsaWNhdGUnIDogJ3VwZGF0ZScpO1xuICAgICAgICBcbiAgICAgICAgaWYgKGNsYXNzaWZpY2F0aW9uID09PSAnZHVwbGljYXRlJykge1xuICAgICAgICAgIHNraXAgPSB0cnVlO1xuICAgICAgICB9IGVsc2UgaWYgKGNsYXNzaWZpY2F0aW9uID09PSAndXBkYXRlJykge1xuICAgICAgICAgIHNraXAgPSB0cnVlO1xuICAgICAgICAgIGNvbnN0IGNvbmZsaWN0SWQgPSBleGlzdGluZ1swXSEuaWQ7XG4gICAgICAgICAgY29uc3QgY29uZmxpY3RSZWFzb25pbmcgPSBgUG9zc2libHkgY29udHJhZGljdHMgb3IgdXBkYXRlcyBhbiBleGlzdGluZyBtZW1vcnk6IFwiJHtleGlzdGluZ1swXSEuY29udGVudH1cImA7XG4gICAgICAgICAgZGIucHJlcGFyZShgXG4gICAgICAgICAgICBJTlNFUlQgSU5UTyBjZXJlYnJvX2xlYXJuaW5nX2FwcHJvdmFscyAoaWQsIGZhY3QsIGNvbmZpZGVuY2UsIHN0YXR1cywgc291cmNlX3J1bl9pZCwgY3JlYXRlZF9hdCwgY29uZmxpY3Rfd2l0aF9pZCwgY29uZmxpY3RfcmVhc29uaW5nKVxuICAgICAgICAgICAgVkFMVUVTICg/LCA/LCA/LCA/LCA/LCA/LCA/LCA/KVxuICAgICAgICAgIGApLnJ1bihjcnlwdG8ucmFuZG9tVVVJRCgpLCBmYWN0LCAwLjYsICdwZW5kaW5nJywgbnVsbCwgRGF0ZS5ub3coKSwgY29uZmxpY3RJZCwgY29uZmxpY3RSZWFzb25pbmcpO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGlmICghc2tpcCkge1xuICAgICAgICBDZXJlYnJvVmVjdG9yU3RvcmUuaW5zZXJ0KGZhY3QsICdwcmVmZXJlbmNlJyk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLy8gSGFiaXR1YXRpb24gc2NvcmluZyBzd2VlcFxuICBjb25zdCBhbGxNZW1vcmllc1JhdyA9IGRiLnByZXBhcmUoJ1NFTEVDVCBpZCwgY29udGVudCwgdHlwZSwgbGFzdF9hY2Nlc3NlZF9hdCwgYWNjZXNzX2NvdW50IEZST00gY2VyZWJyb19tZW1vcmllc19tZXRhJykuYWxsKCkgYXMgYW55W107XG4gIC8vIEF0dGFjaCBkdW1teSBzaW1pbGFyaXR5IHRvIHVzZSBIYWJpdHVhdGlvblNjb3JlciAoc2ltaWxhcml0eSBpc24ndCB1c2VkIGZvciBwcnVuaW5nIHR5cGljYWxseSwganVzdCByYW5raW5nKVxuICBjb25zdCBhbGxNZW1vcmllcyA9IGFsbE1lbW9yaWVzUmF3Lm1hcChtID0+ICh7IC4uLm0sIHNpbWlsYXJpdHk6IDEuMCwgZW1iZWRkaW5nOiBuZXcgRmxvYXQzMkFycmF5KCkgfSkpO1xuICBcbiAgaWYgKGFsbE1lbW9yaWVzLmxlbmd0aCA+IDApIHtcbiAgICBjb25zdCByYW5rZWQgPSBIYWJpdHVhdGlvblNjb3Jlci5yYW5rKGFsbE1lbW9yaWVzLCBEYXRlLm5vdygpKSBhcyAodHlwZW9mIGFsbE1lbW9yaWVzWzBdICYgeyByX2ZpbmFsOiBudW1iZXIgfSlbXTtcbiAgICAvLyBQcnVuZSBtZW1vcmllcyB3aXRoIHZlcnkgbG93IFJfZmluYWwgKGUuZy4gYmVsb3cgMC4wNSlcbiAgICBjb25zdCBQUlVORV9USFJFU0hPTEQgPSAwLjA1O1xuICAgIGZvciAoY29uc3QgbWVtIG9mIHJhbmtlZCkge1xuICAgICAgaWYgKG1lbS5yX2ZpbmFsIDwgUFJVTkVfVEhSRVNIT0xEKSB7XG4gICAgICAgIGRiLnByZXBhcmUoJ0RFTEVURSBGUk9NIGNlcmVicm9fbWVtb3JpZXNfbWV0YSBXSEVSRSBpZCA9ID8nKS5ydW4obWVtLmlkKTtcbiAgICAgICAgZGIucHJlcGFyZSgnREVMRVRFIEZST00gY2VyZWJyb19tZW1vcmllc192ZWMgV0hFUkUgcm93aWQgPSA/JykucnVuKG1lbS5pZCk7XG4gICAgICB9XG4gICAgfVxuICB9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsdUJBQTZCOzs7QUNBN0IsNEJBQXFCO0FBQ3JCLGtCQUFpQjtBQUNqQixnQkFBZTtBQUNmLG9CQUEyQjtBQUMzQiw0QkFBNkI7QUFHN0IsZ0JBQTJCO0FBVzNCLElBQU0sWUFBWSxDQUFDLENBQUMsUUFBUSxJQUFJO0FBQ2hDLElBQU0sVUFBVSxZQUFBQSxRQUFLLEtBQUssUUFBUSxJQUFJLEdBQUcsT0FBTztBQUNoRCxJQUFJLENBQUMsYUFBYSxDQUFDLFVBQUFDLFFBQUcsV0FBVyxPQUFPLEdBQUc7QUFDekMsWUFBQUEsUUFBRyxVQUFVLFNBQVMsRUFBRSxXQUFXLEtBQUssQ0FBQztBQUMzQztBQUVPLElBQU0sU0FBUyxZQUFZLGFBQWEsWUFBQUQsUUFBSyxLQUFLLFNBQVMsY0FBYztBQUd6RSxJQUFNLEtBQTRCLElBQUksc0JBQUFFLFFBQVMsUUFBUTtBQUFBLEVBQzVELFNBQVMsc0NBQWdCLFFBQVEsSUFBSSxh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QUMsRUFBRztBQUNoQyxnQkFBTSxvQkFBb0Isd0RBQXdELFNBQVMsQ0FBQyxFQUFHLE9BQU87QUFDdEcsYUFBRyxRQUFRO0FBQUE7QUFBQTtBQUFBLFdBR1YsRUFBRSxJQUFJLGVBQUFDLFFBQU8sV0FBVyxHQUFHLE1BQU0sS0FBSyxXQUFXLE1BQU0sS0FBSyxJQUFJLEdBQUcsWUFBWSxpQkFBaUI7QUFBQSxRQUNuRztBQUFBLE1BQ0Y7QUFFQSxVQUFJLENBQUMsTUFBTTtBQUNULDJCQUFtQixPQUFPLE1BQU0sWUFBWTtBQUFBLE1BQzlDO0FBQUEsSUFDRjtBQUFBLEVBQ0Y7QUFHQSxRQUFNLGlCQUFpQixHQUFHLFFBQVEscUZBQXFGLEVBQUUsSUFBSTtBQUU3SCxRQUFNLGNBQWMsZUFBZSxJQUFJLFFBQU0sRUFBRSxHQUFHLEdBQUcsWUFBWSxHQUFLLFdBQVcsSUFBSSxhQUFhLEVBQUUsRUFBRTtBQUV0RyxNQUFJLFlBQVksU0FBUyxHQUFHO0FBQzFCLFVBQU0sU0FBUyxrQkFBa0IsS0FBSyxhQUFhLEtBQUssSUFBSSxDQUFDO0FBRTdELFVBQU0sa0JBQWtCO0FBQ3hCLGVBQVcsT0FBTyxRQUFRO0FBQ3hCLFVBQUksSUFBSSxVQUFVLGlCQUFpQjtBQUNqQyxXQUFHLFFBQVEsZ0RBQWdELEVBQUUsSUFBSSxJQUFJLEVBQUU7QUFDdkUsV0FBRyxRQUFRLGtEQUFrRCxFQUFFLElBQUksSUFBSSxFQUFFO0FBQUEsTUFDM0U7QUFBQSxJQUNGO0FBQUEsRUFDRjtBQUNGOzs7QUpqREEsSUFBTSxnQkFBTixjQUE0Qiw4QkFBc0Q7QUFBQSxFQUN6RSxjQUFjO0FBQ25CLFVBQU07QUFBQSxNQUNKLFNBQVMsT0FBTyxVQUFVO0FBQ3hCLFlBQUksQ0FBQyxNQUFPLFFBQU8sRUFBRSxRQUFRLFNBQVMsT0FBTyxvQkFBb0I7QUFDakUsWUFBSTtBQUNGLGdCQUFNLG1CQUFtQixLQUFLO0FBQzlCLGlCQUFPLEVBQUUsUUFBUSxXQUFXLFNBQVMsb0RBQW9EO0FBQUEsUUFDM0YsU0FBUyxLQUFVO0FBQ2pCLGtCQUFRLE1BQU0sa0RBQWtELEdBQUc7QUFDbkUsaUJBQU8sRUFBRSxRQUFRLFNBQVMsT0FBTyxJQUFJLFFBQVE7QUFBQSxRQUMvQztBQUFBLE1BQ0Y7QUFBQSxJQUNGLENBQUM7QUFBQSxFQUNIO0FBQ0Y7QUFFQSxJQUFPLGlCQUFRLElBQUksY0FBYzsiLAogICJuYW1lcyI6IFsicGF0aCIsICJmcyIsICJEYXRhYmFzZSIsICJpbXBvcnRfY3J5cHRvIiwgImNyeXB0byIsICJpbXBvcnRfY3J5cHRvIiwgImNyeXB0byJdCn0K
