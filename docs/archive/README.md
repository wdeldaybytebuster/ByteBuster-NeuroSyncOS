# Archive

Historical audit and review documents, kept in full for the record. Each was a
from-scratch, code-only snapshot of the project at a point in time. They are
**not** kept up to date — for current status, see `docs/docs/` (living source
of truth) and `docs/implementation-plan-and-progress-tracker.md` (dated
progress log).

| Document | Dated | What it was |
|---|---|---|
| `sovereign-os-reality-audit-2026-06-30.md` | 2026-06-30 | The original "Blindfold Rule" gap analysis (docs not read, source only) that found the Deference UI, PortGrid CLI hosting, and Developer Mode were all 0% implemented. This is the document that spawned `docs/implementation-plan-and-progress-tracker.md` — all of its findings were subsequently addressed and verified there. |
| `full-codebase-review-2026-06-28.md` | 2026-06-28 | An earlier code-only review with a prioritized P0/P1 fix list. Superseded by the 2026-06-30 audit above, which re-derived findings independently and found several of the earlier "complete" claims to be inaccurate. |
| `CODE-AUDIT-REPORT.md` | 2026-07-06 | A later code-only audit distinguishing what's fully functional vs. faked/stubbed, done as part of the de-fake pass in commit `179c178`. |
| `okf-implementation-plan.md` | pre-2026-07-01 | Planning doc for the OKF (semantic graph) feature. Marked COMPLETED; the corresponding line item is tracked as VERIFIED in the progress tracker. |

**Why archived instead of deleted:** each contains specific, dated evidence
(line-level findings, before/after comparisons) that's useful context for
understanding *how* the project's self-assessment evolved from optimistic
early claims to verified reality — deleting them would lose that trail even
though none of them describe the current state on their own.
