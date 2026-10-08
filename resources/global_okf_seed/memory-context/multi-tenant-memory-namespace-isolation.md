---
type: concept
title: Multi-Tenant Memory Namespace Isolation
description: Scoping every memory read and write to an explicit namespace (e.g. user or project ID) to prevent cross-tenant contamination and data leaks in a shared memory store.
confidence: 0.95
tags: [memory, security, multi-tenancy, isolation]
category: memory-context
source_doc: architectures-of-mind-a-system-level-analysis-of-episodic-and-semantic-memory-sy.md
---

# Multi-Tenant Memory Namespace Isolation

## Core Idea
Production memory deployments require strict multi-tenant isolation: stores must be scoped using explicit namespaces (the source's example is `(user_memory, user_id)`) so that one user's or tenant's memories can never leak into another's context. This is paired with token budgeting — prioritizing high-activation, relevant memories rather than dumping everything scoped to a namespace into the context window.

## When To Use
Apply namespace scoping any time a single memory store serves more than one user, project, or tenant — it is a baseline requirement, not an optimization, for any multi-tenant deployment of a persistent memory layer.

## NeuroSync Applicability
Already implemented. `src/core/memory/cerebro/vector.ts` (`CerebroVectorStore.insert` / `.search`) tags every memory row with a `project_id` and scopes retrieval accordingly: passing a `projectId` restricts `_vectorSearch`/`_keywordFallbackSearch` results to `(m.project_id = ? OR m.project_id IS NULL)`, so a project's own memories plus untagged GLOBAL/USER-tier memories are visible, but never another project's PROJECT-tier memories. The same tiering principle governs NeuroSync's separate OKF knowledge base (`src/core/okf/directory-manager.ts`, `OKFDirectoryManager`), which resolves PROJECT > USER > GLOBAL directories with PROJECT strictly siloed per `project_root_path`.

## Tradeoffs / Risks
Namespace isolation via a nullable `project_id` column relies on every query path consistently applying the `scopeSQL` filter — a single unscoped query anywhere in the codebase would silently leak cross-project memories. It also does not address token-budgeting: NeuroSync's `search()` takes a `limit` parameter but does not implement the source's broader "prioritize high-activation memories under a token budget" policy beyond the `HabituationScorer` re-ranking step.
