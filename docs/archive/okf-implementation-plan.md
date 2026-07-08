# OKF Integration — Implementation Plan (COMPLETED)

**Status:** IMPLEMENTED | **Branch:** OKF-Shift
**Date:** 2026-06-30
**GBNF Guardrail:** Enforced (no best-effort local extraction)

## Delivered (All 7 Phases)

| Phase | Deliverable | Files |
|-------|-------------|-------|
| 1A | DB Schema (okf_nodes, okf_edges, scout_okf_nodes + 5 indexes) | `src/core/basevault/db.ts` |
| 1B | OKFDirectoryManager (GLOBAL/USER/PROJECT/scout_drafts) | `src/core/okf/directory-manager.ts` |
| 2A | OKFParser (YAML frontmatter + link extraction + SHA-256) | `src/core/okf/parser.ts` |
| 2B | OKFIndexer (dedup, confidence gates, atomic upsert) | `src/core/okf/indexer.ts` |
| 3A | OKFGraphQuery (BFS depth=2, visited-set, token-budget context) | `src/core/okf/graph-query.ts` |
| 3B | Engine context injection (every LLM call gets OKF context) | `src/core/routeswitch/engine.ts` |
| 4A | OKFGenerator + strict GBNF grammar (fromDocument/Chat/Workflow) | `src/core/okf/generator.ts` |
| 4B | LlamaCppProvider GBNF enforcement | `src/core/routeswitch/adapters/llama-cpp.ts` |
| 4C | ReflectionExecutor → OKF generation | `src/core/memory/cerebro/reflection.ts` |
| 5 | ScoutResearch (ingest/promote/reject/listDrafts) | `src/core/scoutdaemon/research.ts` + `idle.ts` |
| 6 | 9 API endpoints at /api/okf/ | `src/server/routes/okf.ts` + `index.ts` |
| 7 | UI: Cerebro Knowledge Browser, Scout Drafts, BaseVault OKF stats | 3 dashboard files |

## Confidence Gates

- >= 0.95: Auto-indexed (immediately available to agents)
- 0.80-0.94: Pending review (amber badge, awaits operator approval)
- < 0.80: Rejected (not written to active directory)

## Graph Traversal Limits

- MAX_DEPTH = 2 (prevents explosion on dense graphs)
- Cycle prevention via visited-set
- Token budget: 8000 chars (~2000 tokens) max context injection

## GBNF Grammar (Strict Token-Level Enforcement)

Local GGUF models enforce valid JSON output via GBNF grammar passed to node-llama-cpp's createGrammar() API. The grammar zeros out logit probabilities for any token that would violate the structure. This guarantees:
- Valid JSON arrays of concepts
- Correct field names and types
- Proper number formatting for confidence scores
- No malformed YAML frontmatter from local models

## 3-Tier Context Stack

| Tier | Location | Scope |
|------|----------|-------|
| GLOBAL | ~/.neurosync/global_okf/ | System-wide, read-only for agents |
| USER | ~/.neurosync/user_okf/ | Operator habits, cross-project |
| PROJECT | <root>/.neurosync/project_okf/ | Strictly siloed per project |
| SCOUT | <root>/.neurosync/scout_drafts/ | Quarantined research |

Resolution: PROJECT > USER > GLOBAL (most specific wins)

## API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | /api/okf/nodes | List indexed nodes (filterable) |
| GET | /api/okf/nodes/:id | Get node with edges |
| POST | /api/okf/search | Search + graph expansion |
| POST | /api/okf/index | Manual re-index |
| POST | /api/okf/generate/document | Generate OKF from text |
| POST | /api/okf/generate/chat | Generate OKF from chat |
| GET | /api/okf/scout-drafts | List quarantined drafts |
| POST | /api/okf/scout-drafts/:id/promote | Promote to active graph |
| POST | /api/okf/scout-drafts/:id/reject | Reject and delete |
