---
title: "Glossary"
status: draft
owner: "williamdeldaymarketing"
last_updated: "2026-07-08"
review_cadence: "weekly"
source_of_truth: true
---

# Glossary

## Key Terms

- **CoreExec:** asynchronous state machine orchestrating transactional DAG
  workflow execution; `node-cron` scheduling; crash-recovery resume on boot.
- **BaseVault:** local SQLite-backed storage module — schema, migrations,
  backups, and the `SensitiveDataRedactor` redaction pipeline.
- **RouteSwitch:** LLM provider registry and traffic routing, fallback
  cascades, council/consensus mode, model selector, and the Free Mode
  Governor.
- **PortGrid:** the capability/tool governance dashboard — Zero-Trust HITL
  approval queue and the sandboxed embedded terminal. Permanently separate
  from CoreExec's dashboard.
- **ScopeLogic:** bounded interview engine that turns a request into a
  draft-only DAG proposal with a numeric confidence score.
- **ScoutDaemon:** idle-time background research and OKF concept-graph
  scanning, gated by a real idle detector.
- **Cerebro:** the memory/chat-assistant layer (`CerebroDashboard`) — tri-modal
  memory (OKF semantic graph + GitNexus AST + knowledge graph) behind a
  Context Router. Current name, not a "formerly" — an earlier planning doc
  had this backwards.
- **Free Mode Governor:** RouteSwitch's paid-provider lock (`is_paid_tier`
  per provider + a global unlock), blocking paid API calls by default.
- **Deference UI:** the numeric-confidence approval pattern — items
  >=0.70 confidence auto-approve as a pill row; items <0.70 require manual
  review.
- **Project (`project_id`):** the isolation boundary — memory and workspace
  scoping are enforced at the database query level, not just UI filtering.
- **UnifiedMasterDashboard:** the global cross-module status view, outside
  the six core module dashboards.
