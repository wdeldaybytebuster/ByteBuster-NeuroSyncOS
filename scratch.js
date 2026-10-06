import Database from 'better-sqlite3';
const db = new Database('./.data/neurosync_basevault.db');
db.prepare(`
  INSERT INTO llm_providers (id, name, type, config_json, is_enabled, is_paid_tier)
  VALUES ('local-openai', 'Local OpenAI Endpoint', 'openai-compatible', '{"baseUrl":"http://localhost:3001/v1","modelId":"Auto"}', 1, 0)
  ON CONFLICT(id) DO UPDATE SET config_json=excluded.config_json;
`).run();
const { encrypt } = await import('./dist/core/basevault/crypto.js').catch(() => ({ encrypt: (s) => s }));
// Note: actually let's see how crypto is handled in the project.
