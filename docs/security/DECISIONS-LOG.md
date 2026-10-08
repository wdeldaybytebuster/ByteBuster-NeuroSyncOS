# Decisions Log (approved — implement exactly)

Convention: each entry = context, options, decision, rationale, evidence, reversibility.

## D1 — Zen provider: option C (flag + label + retired-type error)

- Context: roll-in B7 asks decommission-vs-keep; AGENTS.md Directive 3 mandates keeping Zen.
- Options: (a) keep as-is, (b) full decommission, (c) disable-by-default flag + UI label +
  explicit retired-type error.
- Decision: option C, P3, needs human sign-off. Do NOT implement removal.
- Rationale: preserves directive compliance while bounding the FreeTierError surface; P2-1
  already resolved the hang risk (candidate cap + timeout).
- Evidence: `docs/security/FOLLOWUPS-P2-ROLLIN.md:65-74`; adapter
  `src/core/routeswitch/adapters/opencode.ts:13,20`; factory
  `src/core/routeswitch/provider-factory.ts:4,9,42-43`; discovery
  `src/core/routeswitch/discovery.ts:125-145`; UI
  `src/ui/views/RouteSwitchDashboard.tsx:341,386,472,503,542-553`.
- Reversibility: fully reversible (flag flip).

## D2 — R-2 key rotation: option B (scheduled rotation + riders)

- Context: committed `.bak` key material = plaintext-equivalent; scrub alone never suffices.
- Options: (a) scrub-only, (b) scheduled rotation + riders.
- Decision: option B. Riders: oss-readiness/rescue branch cleanup, `filter-repo --analyze` on
  `e2e-report/`+`test-results/`, `.master.key` boot gate (verify keygen pre-deletion).
- Rationale: clones already exist; provider-side keys must rotate at the dashboard.
- Evidence: `docs/security/ARCHITECT-canonical-reset.md:162-163,174-176,310-311`;
  backup tracked `ARCHITECT-canonical-reset.md:71`; artifacts `:231,244-245`.
- Reversibility: irreversible by nature (rotation) — intended.

## D3 — OD-6 history scrub: option A scoped

- Context: R-1 scrub rewrites pushed `main`; needs tool + window + approval.
- Options: (a) scoped `filter-repo` + coordinated push, (b) BFG / uncoordinated.
- Decision: option A scoped — branch/artifact cleanup first, analyze-before-scrub, operator
  approval required, post-content-commits only.
- Rationale: minimizes collaborator divergence; runbook line covers recovery.
- Evidence: `docs/security/ARCHITECT-canonical-reset.md:161,230-231,310,330`.
- Reversibility: history rewrite is one-way; gated by approval.

## D4 — OD-3 master key: option A (auto-gen + boot assert)

- Context: purge deletes `.master.key`; boot must recreate it or crash (R-4).
- Options: (a) auto-gen + boot assert, (b) explicit-generate fallback as primary.
- Decision: option A — verify keygen code path pre-deletion; boot asserts fresh 32B key.
- Rationale: `initDB` recreation is the documented path (`:132-133,150,247`); fallback only
  if the path is missing.
- Evidence: `docs/security/ARCHITECT-canonical-reset.md:150,314,327`;
  `FOLLOWUPS-P1-REMEDIATION.md:181`.
- Reversibility: n/a (procedure).

## D5 — OD-4 reset helper: option A (create + delete with condition)

- Context: whether `scripts/canonical-reset.ts` survives as a runbook artifact.
- Options: (a) create + delete after use (if §5 procedure is the durable artifact),
  (b) keep permanently.
- Decision: option A with condition — delete after use; keep only if §5 proves insufficient.
- Rationale: one-shot script; procedure in §5 is durable; never a DAG node (SA-01–SA-06).
- Evidence: `docs/security/ARCHITECT-canonical-reset.md:238,328`.
- Reversibility: reversible (script regenerable from §5).

## D6 — OD-1 system-maintenance: keep-one

- Context: R-3 — if the project row is code-created, purging breaks boot assumptions.
- Options: purge-all-3 vs keep-one.
- Decision: keep-one (grep `system-maintenance` in `src/`; if code-created, keep that row,
  delete only the 2 test projects). Amends plan default (was purge-all).
- Rationale: safe under both outcomes; Phase 0 amendment records the flip.
- Evidence: `docs/security/ARCHITECT-canonical-reset.md:312,325`;
  `FOLLOWUPS-P1-REMEDIATION.md:179`.
- Reversibility: reversible pre-purge; post-purge restore from snapshot.

## D7 — OD-2 test_tx: DROP

- Context: R-5 — DROP breaks `initDB` idempotency if the table is schema.
- Options: DROP vs rows-only.
- Decision: DROP `test_tx` (test-created, `(1,'hello')`), after `db.ts` schema check confirms
  it is not schema.
- Rationale: test-only artifact; check first, drop second.
- Evidence: `docs/security/ARCHITECT-canonical-reset.md:51,66,132,144,315,326`;
  `FOLLOWUPS-P1-REMEDIATION.md:180`.
- Reversibility: snapshot restore.

## D8 — OD-5 DegradationEngine test: delete now + OSLayout ticket

- Context: test renders orphan `App` (`src/ui/App.tsx`), possibly names a real component
  referenced in `schema.ts`/`Statusline.tsx`.
- Options: (a) delete test now + ticket rewrite against `OSLayout` if component found,
  (b) rewrite first.
- Decision: (a) — delete with D-14 orphan subtree; ticket covers the rewrite.
- Rationale: unblocks the orphan-UI commit; ticket preserves the component if real.
- Evidence: `docs/security/ARCHITECT-canonical-reset.md:103,116,212,227,329`.
- Reversibility: single-commit revert.

## D9 — OD-7 gitignore: resolved

- Context: exact ignore lines for failure artifacts.
- Options: new lines vs existing patterns.
- Decision: resolved — append `.data.bak*/`, `e2e-report/`, `test-results/`,
  `playwright/.cache` after verifying no existing pattern covers them (commit 1).
- Evidence: `docs/security/ARCHITECT-canonical-reset.md:231,245,331`.
- Reversibility: trivially reversible.

## D10 — Hono bump: standalone chore post-gate

- Context: tree pins Hono `^4.12.27` (`package.json:52`); 4.13.x deferred through P1.
- Decision: standalone chore after the gate is green — never bundled with T1–T6.
- Rationale: version bumps risk the tuple-typed guard wiring fixed in T3.
- Evidence: `docs/security/FOLLOWUPS-P1-REMEDIATION.md:152,159,218`;
  `docs/security/FOLLOWUPS-P2-ROLLIN.md:90`.
- Reversibility: pin revert.

## D11 — Port sweep: 4-file follow-up chore (App.tsx excluded)

- Context: port-bind follow-up across server files; `App.tsx` belongs to Phase 4 D-14.
- Decision: 4-file chore, `App.tsx` explicitly excluded.
- Rationale: keeps the orphan-UI deletion atomic in the reset track.
- Evidence: `docs/security/ARCHITECT-canonical-reset.md:103,212` (D-14 scope).
- Reversibility: per-file revert.
