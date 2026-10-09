/**
 * Phase F1 — flat ESLint config (eslint 9 flat-config format).
 *
 * Scope decisions (triaged against the existing codebase, Phase F-1):
 *
 *  - `@typescript-eslint/no-var-requires` is OFF by design: lazy `require()`
 *    inside functions is a deliberate pattern in this codebase — the
 *    CoreExec/Cerebro worker bundles keep native + DB handles out of module
 *    load (worker.ts, worker-pool.ts, reflection.ts), and several route files
 *    defer optional deps. The two pre-existing
 *    `// eslint-disable-next-line @typescript-eslint/no-var-requires` comments
 *    (both worker-pool.ts) were REMOVED as part of this triage since the rule
 *    no longer fires anywhere.
 *  - `@typescript-eslint/no-explicit-any` is OFF: 625 `any` sites exist today
 *    (duck-typed better-sqlite3 rows, poolifier generics workarounds,
 *    IncomingMessage-shaped WS peers). A typed-project sweep is its own
 *    ticket; enabling it now would fail lint on ~60 files.
 *  - `@typescript-eslint/no-unused-vars` is WARN: 67 sites exist today (dead
 *    lucide-react imports, test-only unused args, dead locals in the worker
 *    bundle). Each is a one-line removal, but the sweep is its own ticket;
 *    warn keeps the gate green and the debt visible in every lint run.
 *  - `react-hooks/exhaustive-deps` is ON (warn) for the UI: three mount-only
 *    effects carried `eslint-disable-next-line` comments (Phase F-1 triage) —
 *    GovernorUI's SSE subscription, DeveloperModeContext's first-launch sync,
 *    PreferencesContext's settings fallback. Re-subscribing on every dep
 *    change would reconnect streams / re-POST defaults. Triage outcome: the
 *    GovernorUI directive is KEPT (with justification — a real missing dep it
 *    deliberately does not list); the DeveloperModeContext and
 *    PreferencesContext directives were REMOVED as dead (the rule reports
 *    nothing at those sites — ESLint 9 flags them as unused directives).
 *  - `react-refresh/only-export-components` is ON (warn) for the UI: it
 *    guards the lazy-dashboard code-splitting contract (Phase F-3) — view
 *    modules must default-export/only-export components.
 *
 * Run: `npm run lint` (CI gate) / `npm run lint:fix` (autofix).
 */
const tseslint = require('typescript-eslint');
const reactHooks = require('eslint-plugin-react-hooks');
const reactRefresh = require('eslint-plugin-react-refresh');

module.exports = tseslint.config(
  {
    ignores: [
      'dist/**',
      '.claude/**',
      '**/*.generated.cjs',
      'node_modules/**',
      'src-tauri/**',
      'e2e/**',
      'e2e-report/**',
      'test-results/**',
      'coverage/**',
      'public/**',
      'scripts/**',
      'local_models/**',
      'resources/**',
    ],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-var-requires': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrors: 'none',
        ignoreRestSiblings: true,
      }],
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
    },
  },
  {
    files: ['src/ui/**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
);
