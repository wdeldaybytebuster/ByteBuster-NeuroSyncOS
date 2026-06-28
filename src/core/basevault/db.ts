import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { isMainThread } from 'worker_threads';

import type { Database as BetterSqlite3Database } from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';

// Resolve database directory in local workspace (.data)
const dataDir = path.join(process.cwd(), '.data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

export const dbPath = path.join(dataDir, 'neurosync.db');

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
    CREATE TABLE IF NOT EXISTS cerebro_memories_meta (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      type TEXT NOT NULL,
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

    CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

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
  `);

  try {
    db.exec(`ALTER TABLE projects ADD COLUMN workspace_path TEXT;`);
  } catch (e: any) {
    // Ignore error if column already exists
    if (!e.message.includes('duplicate column name')) {
      console.error('Error adding workspace_path column:', e);
    }
  }
}
