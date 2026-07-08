---
owner: ByteBuster Core Team
review_cadence: Quarterly
last_updated: "2026-07-08"
source_of_truth: true
---

# Project Charter: NeuroSync Sovereign OS

## 1. Executive Summary

NeuroSync Sovereign OS is a local-first, single-user, multi-project AI workflow
orchestrator. One Node.js server (Hono + `better-sqlite3` in WAL mode) and one
React/Vite dashboard run entirely on the operator's machine, scheduling
background agents and routing requests across local and free-tier LLM
providers with no third-party cloud dependency, no external databases, and no
paid libraries in the dependency tree.

Every AI interaction is a transactional, human-gated unit of work — AI output
stays draft-only until an explicit human click confirms it (see
`docs/docs/04-security/security-privacy-model.md`).

## 2. Mission and Core Values

- **Absolute sovereignty:** no user data, keys, or outputs leave the host
  machine without explicit human override.
- **Human-in-the-loop by construction:** AI-generated proposals (DAGs, code
  edits, workflow changes) cannot self-persist or self-execute; a human must
  approve them via the PortGrid/CoreExec approval queue.
- **Lean local-first computing:** SQLite over heavy vector databases,
  single-process Node.js over microservices, free/local model routing by
  default over paid API calls.

## 3. The Six Modules

Each module is a dashboard + backend pair:

- **PortGrid** — capability/tool governance, Zero-Trust HITL approval queue,
  and a real embedded terminal (hardened `bwrap` sandbox) for external coding
  agents.
- **ScopeLogic** — guided interview engine turning a request into a draft DAG
  proposal.
- **RouteSwitch** — LLM provider registry, fallback chains, council/consensus
  mode, model selector, and the Free Mode Governor (blocks paid-provider calls
  unless explicitly unlocked).
- **BaseVault** — SQLite data layer, backups, redaction/data-tier settings.
- **CoreExec** — DAG workflow engine, `node-cron` scheduler, autonomy dials,
  crash-recovery (resumes in-progress `workflow_runs` on boot).
- **ScoutDaemon** — idle-time background research and OKF (concept graph)
  scanning, triggered by a real idle detector, not deferred/manual-only.

Plus two dashboards outside that list: CerebroDashboard (chat assistant, tri-modal
memory: OKF semantic graph + GitNexus AST + a knowledge graph, routed by a
Context Router) and UnifiedMasterDashboard (global view).

**PortGrid and CoreExec are permanently separate dashboards** even though an
earlier version shared one backend directory — this was fixed by splitting
into `src/core/portgrid/` + `src/core/coreexec/`, not by merging the UI, and
must stay that way.

## 4. Scope Boundaries

**In scope:** single-user multi-project isolation, transactional DAG execution
and SQLite persistence, draft-only AI proposal generation, free-tier/local
model routing with paid-provider gating, the PortGrid approval cockpit and
embedded terminal, ScoutDaemon idle-time research.

**Out of scope (by design, not by gap):** multi-tenant cloud hosting,
distributed service mesh/microservices, heavy external vector databases (uses
`sqlite-vec` instead), any shell escape hatch outside the `CommandSandbox`
allowlist pattern (except the deliberately-approved embedded terminal, which
is sandboxed by directory+network containment instead).

## 5. Quality Gates

- Full test suite passing before any release declaration (`npm test`; see
  `docs/docs/06-quality/test-strategy.md` for current counts and the one
  known-flaky test).
- No AI-generated proposal can self-persist or self-execute without an
  explicit human approval action.
- `npx tsc --noEmit` and `npm run build` clean before merging.
