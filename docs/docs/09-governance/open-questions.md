---
title: "Open Questions"
status: draft
owner: "williamdeldaymarketing"
last_updated: "2026-06-25"
review_cadence: "weekly"
source_of_truth: true
---

# Open Questions

## Unresolved Items

- **OQ-001 (active as of 2026-07-08):** LLM-provider live-test matrix is
  incomplete — OpenCode Zen and OpenRouter adapters and real
  `node-llama-cpp` inference shipped 2026-07-01, but end-to-end validation
  with real API keys against the test matrix in
  `docs/llm-provider-testing-plan-2026-07-01.md` §4 is still in progress.
  This is real, unfinished work, not a stale doc.
- **OQ-002:** Exact performance overhead of local embeddings in sqlite-vec on 6-year-old legacy hardware — not yet benchmarked.
- **OQ-003:** Custom key manager encryption schema for SQLite fields — not yet designed.
