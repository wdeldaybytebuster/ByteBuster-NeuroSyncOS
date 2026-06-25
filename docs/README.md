# NeuroSync Sovereign OS — Documentation

This directory contains all planning, context, and governance documentation for the **NeuroSync Sovereign OS** project. The system is fully implemented (Phase 12 complete) — these docs reflect the actual implemented codebase.

---

## Quick Start for AI Agents

Read context files in this order at the start of every session:

1. `context/project-overview.md` — What the system is and what has been built.
2. `context/architecture.md` — Module inventory, DB schema, server routes, UI components. *(Most critical file)*
3. `context/ai-workflow-rules.md` — How to operate. GitNexus workflow. DAG execution rules.
4. `context/code-standards.md` — Implementation conventions.
5. `context/ui-context.md` — UI component registry, CSS tokens, SSE integration.
6. `context/progress-tracker.md` — Current phase, completed work, open questions.
7. Active implementation spec under `context/specs/`

---

## Current Project State (2026-06-26)

| Item | Status |
| --- | --- |
| Implementation Phases | §1.2–§3.4 all complete ✅ |
| GitNexus Index | Up-to-date (df328cb, 1358 symbols) ✅ |
| Vitest | All test suites green ✅ |
| TypeScript | tsc --noEmit clean on all phase files ✅ |
| Active Goal | Free-tier LLM model testing preparation |

---

## Entry Files

| File | Purpose |
| --- | --- |
| `docs/README.md` | This file — documentation entry point and navigation |
| `docs/AGENTS.md` | AI agent operating instructions and non-negotiable rules |
| `docs/MANIFEST.md` | Full file inventory and purpose map |
| `context/architecture.md` | **Most critical** — module inventory, DB schema, routes, UI |
| `context/project-overview.md` | Product scope, feature set, goals, success criteria |
| `context/progress-tracker.md` | Phase completion status, open questions, session notes |
| `context/ai-workflow-rules.md` | Agent operating rules, GitNexus workflow, DAG rules |
| `context/code-standards.md` | Coding conventions, naming, test patterns |
| `context/ui-context.md` | UI component registry, CSS system, SSE integration |

---

## Folder Map (Actual)

```text
NeuroSyncMega/
├── docs/
│   ├── README.md           — This entry point
│   ├── AGENTS.md           — AI agent instructions
│   ├── MANIFEST.md         — Full file inventory
│   ├── context/
│   │   ├── architecture.md           — Core architecture (SOURCE OF TRUTH)
│   │   ├── architecture_working.md   — Change log
│   │   ├── project-overview.md       — Product overview
│   │   ├── project-overview_working.md
│   │   ├── progress-tracker.md       — Phase status + open questions
│   │   ├── progress-tracker_working.md
│   │   ├── ai-workflow-rules.md      — Agent operating rules
│   │   ├── ai-workflow-rules_working.md
│   │   ├── code-standards.md         — Implementation conventions
│   │   ├── code-standards_working.md
│   │   ├── ui-context.md             — UI component registry
│   │   ├── ui-context_working.md
│   │   └── specs/                    — Implementation unit specs
│   ├── grammar/            — GBNF grammar files
│   ├── templates/          — ADR, RFC, review templates
│   └── docs/               — Deeper planning docs (01-product through 09-governance)
├── src/
│   ├── core/
│   │   ├── basevault/      — SQLite schema, Zod schemas, crypto
│   │   ├── coreexec/       — DAG engine, scheduler, sandbox, dispatch, worker pool
│   │   ├── routeswitch/    — Governor, council, triage, interceptor, adapters
│   │   ├── scopelogic/     — Interview, validator, schemas
│   │   ├── scoutdaemon/    — SSE bus, idle detector, AST parser
│   │   ├── scoutlogic/     — Benchmarker, classifier, dynamic router
│   │   ├── memory/cerebro/ — Vector store, reflection, habituation
│   │   └── system-reserved.ts
│   ├── server/
│   │   ├── index.ts        — Hono gateway (port 3743)
│   │   └── routes/         — Hono sub-routers
│   └── ui/
│       ├── App.tsx          — PortGrid canvas root
│       ├── components/      — 19 UI components
│       └── views/           — 7 dashboard views
└── .data/                   — Runtime: neurosync.db, .master.key (gitignored)
```

---

## Documentation Change Rule

When implementation changes any of the following, update the corresponding document in the same change set:

- Product scope or user flow → `context/project-overview.md`
- Architecture, module boundaries, DB schema, routes → `context/architecture.md`
- UI components, CSS tokens, SSE patterns → `context/ui-context.md`
- Phase completion, open questions → `context/progress-tracker.md`
- Agent operating rules → `context/ai-workflow-rules.md`
- Coding conventions → `context/code-standards.md`

---

## Key Architectural Reference Points

| Topic | Where to Look |
| --- | --- |
| DB schema tables | `context/architecture.md` → Module Inventory → BaseVault |
| API endpoints | `context/architecture.md` → Server Routes table |
| SA-01–SA-07 safety rules | `context/architecture.md` → ScopeLogic section |
| Reserved DAG labels | `src/core/system-reserved.ts` (7 labels) |
| Status enums | `src/core/basevault/schema.ts` (WorkflowRunSchema, TaskSchema) |
| Phase completion log | `context/progress-tracker.md` → Completed Phases table |
| UI component list | `context/ui-context.md` → Confirmed Component Inventory |
