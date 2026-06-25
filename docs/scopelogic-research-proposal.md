# ScopeLogic Staging Documents Proposal (Updates -> Originals)

## 1. Documentation Batch Update Summary
This proposal addresses the 9 massive research and planning documents (~240KB total) currently staged in the `docs/Updates/` folder. To preserve **100% Absolute Detail Fidelity** while maintaining an organized structure, ScopeLogic recommends integrating these by migrating them to their canonical `docs/docs/*` domains and explicitly linking them from the core summary documents (e.g., `architecture.md` and `project-charter.md`). Blindly concatenating 40KB research deep-dives into 5KB summary files would destroy the architectural readability of the system.

## 2. Logged Changes That Affect Documentation
- 9 Staged documents require permanent integration into the SovereignOS knowledge base.
- Documents cover deep SQLite 5-Tier architecture, UX competitor patterns, grammar-constrained decoding, and Phase 8 expansions.

## 3. Documentation Updates Proposed

| Staged File (Source) | Proposed Canonical Destination (Target) | Integration Strategy |
| --- | --- | --- |
| `implementation-plan-neurosync...md` | `docs/docs/05-delivery/implementation-plan-reliability.md` | Move to Delivery folder; add link to `milestone-roadmap.md`. |
| `analysis-update-planing...md` | `docs/docs/01-product/market-and-competitor-analysis.md` | **Merge/Append:** Roll up competitor analysis safely into this existing file. |
| `research-important-architectures...md` | `docs/docs/08-research/grammar-constrained-decoding.md` | Move as standalone research deep-dive; link from `architecture.md`. |
| `research-important-ai-os-architectural...md` | `docs/docs/08-research/ai-os-architecture-brief.md` | Move as standalone research deep-dive; link from `architecture.md`. |
| `research-important-the-state-aware...md` | `docs/docs/08-research/emerging-ux-patterns.md` | Move as standalone research deep-dive; link from `ui-context.md`. |
| `research-importanttechnical-methodologies...md` | `docs/docs/02-architecture/sqlite-vector-retrieval.md` | Move to Architecture folder; link from `data-architecture.md`. |
| `research-important-sqlite-5-tier...md` | `docs/docs/02-architecture/sqlite-5-tier-design.md` | Move to Architecture folder; link from `data-architecture.md`. |
| `research-important-local-ai-os-architecture...md` | `docs/docs/08-research/local-ai-os-deep-dive.md` | Move as standalone research deep-dive. |
| `phase-8-expansion-analysis.md` | `docs/context/specs/phase8-plan.md` | **Merge/Append:** Roll up specific Phase 8 details into the existing Phase 8 spec. |

## 4. Conflicts, Gaps, Risks, or Required Human Decisions
- **Structural Preservation:** Is it acceptable to retain the 7 massive deep-dive documents as standalone canonical files within `/docs/docs/` and link them from the main headers? Merging 40KB files directly into `architecture.md` violates the "Functional density over decoration" readability principle.
- **Merge Endorsement:** The 2 files designated for **Merge/Append** will be safely injected as `## Research Rollup` subsections, exactly as we executed in the previous step.

## 5. Final Batch Proposal Summary
Upon your PortGrid approval of this structural mapping, BaseVault will execute the `mv` operations for the deep-dives, execute the safe `append` operations for the merged files, update the master index links, and delete the obsolete `docs/Updates/` staging directory.
