# Manual verification scripts

These are not part of `npm test` (Vitest) — they're end-to-end smoke tests
that hit a **running dev server** (`npm run dev:server`, `http://localhost:3743`)
and a live `.data/neurosync.db`. Run them manually when you want to verify a
real request/response round trip, not as part of CI.

- `crypto-test.ts` — verifies an API key POSTed to `/api/system/settings` is
  masked on read and stored AES-256-GCM encrypted at rest, and that
  `src/core/basevault/crypto.ts` can decrypt it back.
- `dag-test.ts` — submits a 3-node DAG with out-of-order dependencies to
  `/api/coreexec/approve` and confirms CoreExec resolves the topological sort
  correctly.
- `e2e-test.ts` — submits a DAG node with an intentionally failing command and
  confirms the `CommandSandbox` traps it (path traversal / non-zero exit)
  instead of silently failing.

Run with:

```bash
npm run dev:server   # in one terminal
npx tsx scripts/manual/crypto-test.ts   # in another
npx tsx scripts/manual/dag-test.ts
npx tsx scripts/manual/e2e-test.ts
```
