# LLM Provider Registry — Full Implementation Plan

**Status:** AWAITING APPROVAL  
**Date:** 2026-06-26  
**Scope:** Multi-provider named entries, encrypted keys, per-scope defaults, fallback ordering  

---

## 1. Problem Statement

Currently, NeuroSync has a single active LLM provider stored in-memory (`currentConfig` in `routes/llm.ts`). This means:

- Configuration is lost on every server restart
- Only one provider can exist at a time (no "My OpenRouter" vs "Local LMStudio")
- No way to set up multiple local GGUF models side-by-side
- No fallback ordering (if provider A fails, no automatic try of provider B)
- No per-scope defaults (Cerebro might want a cheap fast model, while ScopeLogic Council needs a flagship)
- API keys are not properly persisted with encryption

---

## 2. Design Goals

1. **Named Provider Entries** — User creates entries like "OpenRouter Free Tier", "LMStudio Local", "My Llama3 GGUF" with friendly names, persisted to SQLite
2. **Encrypted API Keys** — All keys stored via existing AES-256-GCM crypto.ts
3. **Multiple of the Same Type** — Two OpenAI-compatible endpoints or three different GGUF models can coexist
4. **Fallback Chain** — Ordered list of providers. If #1 fails (429, timeout, error), try #2, then #3
5. **Per-Scope Defaults** — Different default + fallback chains for: Global, Cerebro, Per-Project, Per-Agent/Workflow
6. **Scope Resolution Hierarchy** — Most specific wins: Agent > Project > Cerebro > Global
7. **UI in RouteSwitch Set-up View** — Where it already lives, expanded with provider management

---

## 3. Database Schema

### 3.1 New Table: `llm_providers`

```sql
CREATE TABLE IF NOT EXISTS llm_providers (
  id TEXT PRIMARY KEY,                    -- UUID
  name TEXT NOT NULL,                     -- User-assigned friendly name
  type TEXT NOT NULL,                     -- 'openai-compatible' | 'llama-cpp' | 'mock'
  config_json TEXT NOT NULL,             -- JSON: { baseUrl, modelId, modelPath, contextSize, gpuLayers, temperature }
  api_key_encrypted TEXT,                -- AES-256-GCM encrypted via crypto.ts (nullable for local/mock)
  is_enabled INTEGER NOT NULL DEFAULT 1, -- 1=active, 0=disabled by user
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

**Notes:**
- `config_json` stores type-specific configuration. For `openai-compatible`: `{ baseUrl, modelId }`. For `llama-cpp`: `{ modelPath, contextSize, gpuLayers, temperature, grammar }`. For `mock`: `{}`.
- `api_key_encrypted` uses the existing `encrypt()` from `crypto.ts`. Null for local models and mock.
- The `id` is system-generated UUID. The `name` is what the user sees in dropdowns.

### 3.2 New Table: `llm_routing_rules`

```sql
CREATE TABLE IF NOT EXISTS llm_routing_rules (
  id TEXT PRIMARY KEY,                   -- UUID
  scope TEXT NOT NULL,                   -- 'global' | 'cerebro' | 'project' | 'agent'
  scope_id TEXT,                         -- NULL for global/cerebro, project_id for project, agent_name for agent
  provider_chain TEXT NOT NULL,          -- JSON array of provider IDs in fallback order: ["id1","id2","id3"]
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(scope, scope_id)               -- Only one rule per scope+target
);
```

**Notes:**
- `scope='global'` + `scope_id=NULL` → the system-wide default
- `scope='cerebro'` + `scope_id=NULL` → Cerebro-specific override (memory reflections, preference extraction)
- `scope='project'` + `scope_id='<project_id>'` → per-project override
- `scope='agent'` + `scope_id='<agent_name>'` → per-agent/workflow override (e.g., "scopelogic-interview", "council-mode")
- `provider_chain` is a JSON array of `llm_providers.id` values. Position 0 is the primary, positions 1+ are fallbacks.

---

## 4. Scope Resolution Hierarchy

When RouteSwitchEngine receives a request, it resolves which provider chain to use:

```
1. Check: Is there an agent-level rule for this request context?
   → e.g., scope='agent', scope_id='council-mode'
   
2. Check: Is there a project-level rule for the active project?
   → e.g., scope='project', scope_id='proj_abc123'
   
3. Check: Is there a cerebro-level rule? (only for Cerebro reflection calls)
   → e.g., scope='cerebro', scope_id=NULL
   
4. Fallback: Use the global rule
   → scope='global', scope_id=NULL
```

The first match wins. Within a chain, providers are tried in order until one succeeds.

**Why this matters for the user:**
- Globally, they might set "LMStudio Local" as primary with "OpenRouter Free" as fallback
- For Cerebro (which does background reflections cheaply), they might assign a fast/cheap model
- For a specific project doing complex code generation, they might assign a flagship model
- For Council Mode, they might pre-assign the 3 models that get run in parallel

---

## 5. API Endpoints

### 5.1 Provider CRUD

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/llm/providers` | List all saved providers (keys redacted in response) |
| POST | `/api/llm/providers` | Create a new named provider entry |
| PUT | `/api/llm/providers/:id` | Update an existing provider (name, config, key, enabled) |
| DELETE | `/api/llm/providers/:id` | Remove a provider (fails if referenced in active rules) |
| POST | `/api/llm/providers/:id/test` | Send a test prompt to verify connectivity |

**POST/PUT body example:**
```json
{
  "name": "My OpenRouter Free",
  "type": "openai-compatible",
  "config": {
    "baseUrl": "https://openrouter.ai/api/v1",
    "modelId": "meta-llama/llama-3-70b-instruct:free"
  },
  "apiKey": "sk-or-...",
  "isEnabled": true
}
```

**GET response (keys redacted):**
```json
{
  "success": true,
  "providers": [
    {
      "id": "prov_abc123",
      "name": "My OpenRouter Free",
      "type": "openai-compatible",
      "config": { "baseUrl": "https://openrouter.ai/api/v1", "modelId": "meta-llama/llama-3-70b-instruct:free" },
      "hasApiKey": true,
      "isEnabled": true,
      "createdAt": 1719388800000
    }
  ]
}
```

### 5.2 Routing Rules CRUD

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/llm/routing-rules` | List all routing rules |
| PUT | `/api/llm/routing-rules` | Upsert a routing rule (scope + scopeId + providerChain) |
| DELETE | `/api/llm/routing-rules/:id` | Remove a routing rule (falls back to next scope level) |

**PUT body example:**
```json
{
  "scope": "global",
  "scopeId": null,
  "providerChain": ["prov_abc123", "prov_def456", "prov_mock"]
}
```

---

## 6. Engine Integration

### 6.1 Boot Sequence (server/index.ts)

On server start:
1. Read all enabled providers from `llm_providers` table
2. Instantiate `OpenAICompatibleProvider` / `LlamaCppProvider` / `MockProvider` for each
3. Register all into `RouteSwitchEngine.providerRegistry`
4. Read the `global` routing rule → set position 0 as the engine's active primary provider
5. Always ensure MockProvider exists as a final air-gapped fallback

### 6.2 Modified `RouteSwitchEngine.execute()`

Add a `context` parameter to RouteRequest:

```typescript
interface RouteRequest {
  prompt: string;
  estimatedTokens: number;
  responseSchema?: any;
  complexity?: 'trivial' | 'logical' | 'complex';
  userPriority?: 'speed' | 'cost' | 'intelligence';
  // NEW: resolution context for scope hierarchy
  scope?: 'cerebro' | 'agent';
  scopeId?: string;         // agent name or left empty
  projectId?: string;       // active project
}
```

The engine's execute flow becomes:

```
1. Resolve provider chain via scope hierarchy (agent → project → cerebro → global)
2. For each provider in the chain:
   a. Check ProviderHealthState — skip if exhausted
   b. Check FreeModeGovernor — block if quota exceeded
   c. Try provider.generate()
   d. On success → return
   e. On error (429, timeout, network) → mark exhausted, try next
3. If all fail → throw "All providers exhausted"
```

This replaces the separate `executeWithFallback()` in router.ts and unifies all routing logic into one place.

### 6.3 Cerebro Integration

The `injectLLMGenerator()` call in server/index.ts passes a generate function to Cerebro. Update it to include scope context:

```typescript
const _cerebroGenerateFn = async (prompt: string) => {
  const result = await routeSwitch.execute({ 
    prompt, 
    estimatedTokens: 150,
    scope: 'cerebro'  // ← triggers cerebro-specific routing rule
  });
  return result.content;
};
```

### 6.4 ScopeLogic Integration

The interview `generateFn` already passes through RouteSwitchEngine. Add project context:

```typescript
const generateFn = async (prompt: string) => {
  const result = await routeSwitch.execute({ 
    prompt, 
    estimatedTokens: 200,
    scope: 'agent',
    scopeId: 'scopelogic-interview',
    projectId: activeProjectId
  });
  return result.content;
};
```

### 6.5 Council Mode Integration

Council mode currently takes `this.councilProviders`. Update to:
- Read the `agent` rule for `scope_id='council-mode'` 
- Those providers in the chain are the council participants
- If no council-specific rule exists, fall back to running the top 3 from the global chain

---

## 7. UI Placement

### 7.1 Primary Location: RouteSwitch Set-up View

This is where provider configuration already lives. The Set-up View gets restructured into sections:

**Section A: Provider Registry (new)**
- List of all saved provider entries (card per provider)
- Each card shows: name, type badge, model/endpoint, enabled toggle, edit/delete buttons
- "Add Provider" button opens a form:
  - Name (text input)
  - Type selector (OpenAI Compatible / Local GGUF / Mock)
  - Type-specific fields (baseUrl+modelId+apiKey for OpenAI, modelPath+contextSize+gpuLayers for GGUF)
  - "Test Connection" button
  - Save

**Section B: Default & Fallback Chain (new)**
- Scope selector tabs: Global | Cerebro | [Per-Project dropdown] | [Per-Agent dropdown]
- For each scope: an ordered list of providers (drag-to-reorder)
- "Add to chain" dropdown to append a provider from the registry
- Remove button per entry
- Position 1 = primary, positions 2+ = fallbacks
- Save button per scope

**Section C: Free Mode Governor Limits (existing)**
- Daily Cost Ceiling slider (keep as-is)
- External Calls Enabled toggle (keep as-is)

**Section D: MCP Connection Manager (existing)**
- Keep as-is

### 7.2 Quick Status in RouteSwitch Dashboard View

The existing "LLM Fleet Health & Fallback Monitor" widget already shows providers with status. Update it to:
- Pull from `llm_providers` table instead of hardcoded rows
- Show the active scope chain being used
- Show which provider is currently "active" (position in chain)

---

## 8. User Flow Examples

### Example 1: First-time setup

1. User opens RouteSwitch → Set-up
2. Clicks "Add Provider" → selects "OpenAI Compatible"
3. Fills in: Name="LMStudio Local", Base URL="http://localhost:1234/v1", Model="Auto"
4. Clicks "Test Connection" → sees green checkmark
5. Saves → provider appears in the registry list
6. In "Default & Fallback Chain" → Global tab → drags "LMStudio Local" to position 1
7. Saves → system now uses LMStudio for everything

### Example 2: Adding a cloud fallback

1. User adds another provider: Name="OpenRouter Llama3", type=OpenAI Compatible, URL="https://openrouter.ai/api/v1", model="meta-llama/llama-3-70b-instruct:free", API Key="sk-or-..."
2. In Global chain → drags it to position 2 (after LMStudio)
3. Now if LMStudio is down, system auto-falls-back to OpenRouter

### Example 3: Cerebro gets a cheap model

1. User switches to "Cerebro" scope tab
2. Adds "OpenRouter Llama3" at position 1 (Cerebro does cheap background work)
3. Cerebro reflections now use Llama3 instead of the global default

### Example 4: A specific project uses a flagship

1. User switches to "Per-Project" scope tab → selects their code project
2. Adds a provider "GPT-4o" at position 1
3. All ScopeLogic interviews and workflow executions for that project now route to GPT-4o

### Example 5: Multiple GGUF models

1. User adds: Name="Llama3 8B (fast)", type=Local GGUF, path="/models/llama3-8b.gguf"
2. User adds: Name="Codestral 22B (code)", type=Local GGUF, path="/models/codestral-22b.gguf"
3. In Global chain: position 1="Codestral 22B", position 2="Llama3 8B", position 3="Mock"
4. Both models are available, Codestral is preferred, Llama3 is fallback

---

## 9. Implementation Phases

### Phase 1: Database + CRUD API (backend only)
- Add `llm_providers` and `llm_routing_rules` tables to `initDB()`
- Create `src/server/routes/llm-providers.ts` with CRUD endpoints
- Wire encrypt/decrypt for API keys
- Mount routes in server/index.ts
- **No UI changes. No engine changes. Test via curl.**

### Phase 2: Engine Integration
- Add `resolveProviderChain(scope, scopeId, projectId)` method to RouteSwitchEngine
- Modify `execute()` to accept RouteRequest.scope/scopeId/projectId
- Implement fallback-on-error loop inside execute()
- Boot sequence: load all enabled providers from DB into providerRegistry
- Remove the separate `executeWithFallback()` from router.ts (dead code path)
- Update Cerebro and ScopeLogic generate functions with scope context

### Phase 3: UI — Provider Registry
- New section in RouteSwitch Set-up: Provider list + Add/Edit/Delete forms
- Test Connection button
- Type-specific form fields

### Phase 4: UI — Routing Rules (Scope + Fallback Chain)
- Scope selector tabs
- Ordered drag-and-drop provider chain per scope
- Per-project and per-agent scope selectors

---

## 10. Files Touched

| File | Change Type |
|------|-------------|
| `src/core/basevault/db.ts` | Add 2 new tables to initDB() |
| `src/core/routeswitch/engine.ts` | Add resolveProviderChain(), modify execute(), add boot loader |
| `src/core/routeswitch/providers.ts` | No change (interface stays the same) |
| `src/core/routeswitch/router.ts` | Deprecate executeWithFallback() |
| `src/server/routes/llm.ts` | Extend with provider CRUD + routing rules CRUD |
| `src/server/index.ts` | Boot sequence: load providers from DB, update Cerebro/ScopeLogic scope context |
| `src/ui/views/RouteSwitchDashboard.tsx` | New Set-up sections: Provider Registry + Routing Rules |
| `src/core/routeswitch/adapters/openai-compatible.ts` | Accept dynamic id from DB (currently hardcoded 'openai-compatible') |
| `src/core/routeswitch/adapters/llama-cpp.ts` | Accept dynamic id from DB (currently hardcoded 'llama-cpp') |

---

## 11. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Provider chain resolution adds latency | Resolution is a simple DB read cached at boot. Re-read only on rule change. |
| User deletes a provider that's in a chain | DELETE endpoint checks references; returns error if provider is in use. Offer force-delete with cascade. |
| All chain providers fail simultaneously | MockProvider is always appended as final fallback (air-gapped, never fails). |
| API key exposed in response | GET endpoint returns `hasApiKey: true/false`, never the actual key. Edit form sends new key only if changed. |
| Migration from current in-memory config | Phase 2 boot sequence reads DB first; if empty, falls back to env vars (current behavior preserved). |

---

## 12. What This Does NOT Cover (Future Work)

- Per-request cost tracking per provider (would need provider-specific pricing tables)
- Automatic provider health scoring / ELO (ScoutLogic benchmarks handle this separately)
- UI drag-and-drop reordering library (will use simple up/down arrows initially for stability)
- OpenRouter model discovery integration into the provider creation form (nice-to-have)
- Token-level streaming with mid-stream fallback (current architecture is request-level)

---

## 13. Summary

This plan transforms the LLM subsystem from "one provider in memory" to "a named registry of providers persisted to SQLite with encrypted keys, organized into fallback chains that resolve per-scope (Global → Cerebro → Project → Agent)". The user manages everything from the RouteSwitch Set-up View with clear visual controls.

**Waiting for approval to begin implementation.**
