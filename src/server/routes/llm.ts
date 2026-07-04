import { Hono } from 'hono';
import { RouteSwitchEngine } from '../../core/routeswitch/engine';
import { instantiateProvider, PROVIDER_TYPES } from '../../core/routeswitch/provider-factory';
import { FreeModeGovernor } from '../../core/routeswitch/governor';
import { ProviderHealthState } from '../../core/routeswitch/interceptor';
import { db } from '../../core/basevault/db';
import { encrypt, decrypt } from '../../core/basevault/crypto';
import crypto from 'crypto';

export const llmRouter = new Hono();

// We will inject the singleton RouteSwitchEngine and Governor here when mounting
export let activeEngine: RouteSwitchEngine | null = null;
export let activeGovernor: FreeModeGovernor | null = null;

export const injectLLMEngine = (engine: RouteSwitchEngine, governor: FreeModeGovernor) => {
  activeEngine = engine;
  activeGovernor = governor;
};

// Current active configuration state
let currentConfig = {
  provider: 'openai-compatible',
  baseUrl: 'http://localhost:1234/v1',
  modelId: 'Auto',
  apiKey: '',
  modelPath: './local_models/',
  councilRisk: 70
};

llmRouter.get('/config', (c) => {
  return c.json({
    success: true,
    config: currentConfig,
    telemetry: activeGovernor ? activeGovernor.getStatus() : null
  });
});

// §3.2 — 24h rolling usage aggregate for the RouteSwitch dashboard.
// Returns { success, usage24h: { tokens, costUsd, requests, byProvider, windowMs, generatedAt } }.
// The window prunes records older than 24h on read so the in-memory buffer
// stays bounded under long-running processes.
llmRouter.get('/usage', (c) => {
  if (!activeGovernor) {
    return c.json({ success: false, error: 'LLM Engine not initialized' }, 500);
  }
  return c.json({
    success: true,
    usage24h: activeGovernor.getUsage24h(),
  });
});

llmRouter.post('/config', async (c) => {
  if (!activeEngine) {
    return c.json({ success: false, error: 'LLM Engine not initialized' }, 500);
  }

  const body = await c.req.json();
  currentConfig = { ...currentConfig, ...body };

  try {
    activeEngine.setProvider(instantiateProvider(currentConfig.provider, currentConfig, currentConfig.apiKey));

    return c.json({ success: true, config: currentConfig });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 400);
  }
});

// Clear all provider exhaustion errors — operator quick-fix from RouteSwitch Dashboard
llmRouter.post('/clear-error', (c) => {
  const cleared = ProviderHealthState.clearAllErrors();
  return c.json({ success: true, message: `Cleared ${cleared} exhausted provider(s).`, cleared });
});

/**
 * Sync a provider row from the DB into the live RouteSwitchEngine registry.
 * Called after create/update so runtime routing immediately uses the new config.
 */
function syncProviderToEngine(row: { id: string; type: string; config_json: string; api_key_encrypted: string | null; is_enabled: number }) {
  if (!activeEngine) return;
  if (row.is_enabled !== 1) return;
  const config = JSON.parse(row.config_json || '{}');
  const apiKey = row.api_key_encrypted ? decrypt(row.api_key_encrypted) : '';
  const provider = instantiateProvider(row.type, config, apiKey, row.id);
  activeEngine.registerProvider(provider);
}

// ═══════════════════════════════════════════════════════════════════════════════
// LLM PROVIDER REGISTRY — CRUD Endpoints
// Per: docs/llm-provider-registry-plan.md §5.1
// ═══════════════════════════════════════════════════════════════════════════════

/** List all saved providers (API keys redacted in response) */
llmRouter.get('/providers', (c) => {
  try {
    const rows = db.prepare(`
      SELECT id, name, type, config_json, api_key_encrypted, is_enabled, is_paid_tier, created_at, updated_at
      FROM llm_providers
      ORDER BY created_at ASC
    `).all() as any[];

    const providers = rows.map((row) => ({
      id: row.id,
      name: row.name,
      type: row.type,
      config: JSON.parse(row.config_json || '{}'),
      hasApiKey: !!row.api_key_encrypted,
      isEnabled: row.is_enabled === 1,
      isPaidTier: row.is_paid_tier === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    return c.json({ success: true, providers });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

/** Create a new named provider entry */
llmRouter.post('/providers', async (c) => {
  try {
    const body = await c.req.json();
    const { name, type, config, apiKey, isEnabled, isPaidTier } = body;

    if (!name || !type) {
      return c.json({ success: false, error: 'name and type are required' }, 400);
    }

    if (!PROVIDER_TYPES.includes(type)) {
      return c.json({ success: false, error: `type must be one of: ${PROVIDER_TYPES.join(', ')}` }, 400);
    }

    const id = `prov_${crypto.randomUUID().replace(/-/g, '').substring(0, 12)}`;
    const now = Date.now();
    const configJson = JSON.stringify(config || {});
    const encryptedKey = apiKey ? encrypt(apiKey) : null;
    // Opt-in only: defaults to free (0) unless the caller explicitly marks it paid.
    const paidTier = isPaidTier === true ? 1 : 0;

    db.prepare(`
      INSERT INTO llm_providers (id, name, type, config_json, api_key_encrypted, is_enabled, is_paid_tier, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, name, type, configJson, encryptedKey, isEnabled !== false ? 1 : 0, paidTier, now, now);

    // Sync to live engine so it's immediately usable without restart
    syncProviderToEngine({ id, type, config_json: configJson, api_key_encrypted: encryptedKey, is_enabled: isEnabled !== false ? 1 : 0 });

    // If this is the first provider and no global rule exists, also set as active primary
    if (activeEngine) {
      const provCount = db.prepare('SELECT COUNT(*) as cnt FROM llm_providers WHERE is_enabled = 1').get() as any;
      const globalRule = db.prepare(`SELECT id FROM llm_routing_rules WHERE scope = 'global' AND scope_id IS NULL`).get();
      if (provCount?.cnt === 1 && !globalRule) {
        // First provider added — make it the active primary
        const config2 = JSON.parse(configJson);
        const key2 = encryptedKey ? decrypt(encryptedKey) : '';
        activeEngine.setProvider(instantiateProvider(type, config2, key2, id));
      }
    }

    return c.json({
      success: true,
      provider: { id, name, type, config: config || {}, hasApiKey: !!apiKey, isEnabled: isEnabled !== false, isPaidTier: paidTier === 1, createdAt: now }
    });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

/** Update an existing provider */
llmRouter.put('/providers/:id', async (c) => {
  try {
    const { id } = c.req.param();
    const body = await c.req.json();
    const { name, type, config, apiKey, isEnabled, isPaidTier } = body;

    // Verify exists
    const existing = db.prepare('SELECT id FROM llm_providers WHERE id = ?').get(id);
    if (!existing) {
      return c.json({ success: false, error: 'Provider not found' }, 404);
    }

    const now = Date.now();
    const updates: string[] = [];
    const params: any[] = [];

    if (name !== undefined) { updates.push('name = ?'); params.push(name); }
    if (type !== undefined) { updates.push('type = ?'); params.push(type); }
    if (config !== undefined) { updates.push('config_json = ?'); params.push(JSON.stringify(config)); }
    if (apiKey !== undefined) {
      // Empty string = clear key, non-empty = encrypt and store
      updates.push('api_key_encrypted = ?');
      params.push(apiKey ? encrypt(apiKey) : null);
    }
    if (isEnabled !== undefined) { updates.push('is_enabled = ?'); params.push(isEnabled ? 1 : 0); }
    if (isPaidTier !== undefined) { updates.push('is_paid_tier = ?'); params.push(isPaidTier ? 1 : 0); }

    updates.push('updated_at = ?');
    params.push(now);
    params.push(id);

    if (updates.length > 1) {
      db.prepare(`UPDATE llm_providers SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    }

    // Re-sync to live engine with updated config
    const updated = db.prepare('SELECT id, type, config_json, api_key_encrypted, is_enabled FROM llm_providers WHERE id = ?').get(id) as any;
    if (updated) syncProviderToEngine(updated);

    return c.json({ success: true, message: 'Provider updated' });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

/** Delete a provider (fails if referenced in active routing rules) */
llmRouter.delete('/providers/:id', (c) => {
  try {
    const { id } = c.req.param();

    // Check if any routing rule references this provider
    const rules = db.prepare('SELECT id, scope, scope_id, provider_chain FROM llm_routing_rules').all() as any[];
    for (const rule of rules) {
      const chain: string[] = JSON.parse(rule.provider_chain || '[]');
      if (chain.includes(id)) {
        return c.json({
          success: false,
          error: `Cannot delete: provider is referenced in routing rule (scope=${rule.scope}, scopeId=${rule.scope_id || 'null'}). Remove it from the chain first.`
        }, 409);
      }
    }

    const result = db.prepare('DELETE FROM llm_providers WHERE id = ?').run(id);
    if (result.changes === 0) {
      return c.json({ success: false, error: 'Provider not found' }, 404);
    }

    return c.json({ success: true, message: 'Provider deleted' });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

/** Test connectivity to a provider — sends a simple prompt and checks for a response */
llmRouter.post('/providers/:id/test', async (c) => {
  try {
    const { id } = c.req.param();
    const row = db.prepare('SELECT * FROM llm_providers WHERE id = ?').get(id) as any;
    if (!row) {
      return c.json({ success: false, error: 'Provider not found' }, 404);
    }

    const config = JSON.parse(row.config_json || '{}');
    const apiKey = row.api_key_encrypted ? decrypt(row.api_key_encrypted) : undefined;
    const provider = instantiateProvider(row.type, config, apiKey);

    const startMs = Date.now();
    const result = await provider.generate('Hello, respond with a single word to confirm connectivity.', 20);
    const latencyMs = Date.now() - startMs;

    return c.json({
      success: true,
      test: { connected: true, latencyMs, responsePreview: result.substring(0, 100) }
    });
  } catch (err: any) {
    return c.json({
      success: false,
      test: { connected: false, error: err.message }
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// LLM ROUTING RULES — CRUD Endpoints
// Per: docs/llm-provider-registry-plan.md §5.2
// ═══════════════════════════════════════════════════════════════════════════════

/** List all routing rules */
llmRouter.get('/routing-rules', (c) => {
  try {
    const rows = db.prepare(`
      SELECT id, scope, scope_id, provider_chain, created_at, updated_at
      FROM llm_routing_rules
      ORDER BY scope ASC, created_at ASC
    `).all() as any[];

    const rules = rows.map((row) => ({
      id: row.id,
      scope: row.scope,
      scopeId: row.scope_id,
      providerChain: JSON.parse(row.provider_chain || '[]'),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    return c.json({ success: true, rules });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

/** Upsert a routing rule (scope + scopeId identifies uniqueness) */
llmRouter.put('/routing-rules', async (c) => {
  try {
    const body = await c.req.json();
    const { scope, scopeId, providerChain } = body;

    if (!scope) {
      return c.json({ success: false, error: 'scope is required' }, 400);
    }

    const validScopes = ['global', 'cerebro', 'project', 'agent'];
    if (!validScopes.includes(scope)) {
      return c.json({ success: false, error: `scope must be one of: ${validScopes.join(', ')}` }, 400);
    }

    if (!Array.isArray(providerChain) || providerChain.length === 0) {
      return c.json({ success: false, error: 'providerChain must be a non-empty array of provider IDs' }, 400);
    }

    // Validate that all provider IDs exist
    for (const provId of providerChain) {
      const exists = db.prepare('SELECT id FROM llm_providers WHERE id = ?').get(provId);
      if (!exists) {
        return c.json({ success: false, error: `Provider ID '${provId}' not found in registry` }, 400);
      }
    }

    const now = Date.now();
    const chainJson = JSON.stringify(providerChain);
    const normalizedScopeId = scopeId || null;

    // Check if rule already exists for this scope+scopeId
    const existing = db.prepare('SELECT id FROM llm_routing_rules WHERE scope = ? AND (scope_id = ? OR (scope_id IS NULL AND ? IS NULL))').get(scope, normalizedScopeId, normalizedScopeId) as any;

    if (existing) {
      // Update existing rule
      db.prepare('UPDATE llm_routing_rules SET provider_chain = ?, updated_at = ? WHERE id = ?').run(chainJson, now, existing.id);
      return c.json({ success: true, id: existing.id, message: 'Routing rule updated' });
    } else {
      // Create new rule
      const id = `rule_${crypto.randomUUID().replace(/-/g, '').substring(0, 12)}`;
      db.prepare(`
        INSERT INTO llm_routing_rules (id, scope, scope_id, provider_chain, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(id, scope, normalizedScopeId, chainJson, now, now);
      return c.json({ success: true, id, message: 'Routing rule created' });
    }
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

/** Delete a routing rule */
llmRouter.delete('/routing-rules/:id', (c) => {
  try {
    const { id } = c.req.param();
    const result = db.prepare('DELETE FROM llm_routing_rules WHERE id = ?').run(id);
    if (result.changes === 0) {
      return c.json({ success: false, error: 'Routing rule not found' }, 404);
    }
    return c.json({ success: true, message: 'Routing rule deleted' });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});
