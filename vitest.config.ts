import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // scripts/tauri-config.test.ts is dual-mode: it must ALSO run under bare
    // `npx tsx`, where any `import ... from 'vitest'` becomes a `require` that
    // vitest's CJS entry deliberately throws on. It therefore registers its
    // tests through the globals injected here instead of importing vitest.
    // Explicit `import { ... } from 'vitest'` in other test files is unaffected.
    globals: true,
    // Phase F-5 — explicit default environment: 'node'. The suite is
    // server/DB-first; only UI component tests need a DOM. Per-file jsdom
    // selection uses the `@vitest-environment jsdom` docblock pragma
    // (`environmentMatchGlobs` was REMOVED in Vitest 4 — the pragma is the
    // sanctioned replacement). See src/ui/layouts/OSLayout.test.tsx for the
    // first UI test. jsdom itself stays a devDependency for exactly this.
    environment: 'node',
    // Phase F-5 — global setup (environment-agnostic: it must load for
    // node-env files too, so it guards every DOM touch).
    setupFiles: ['src/ui/setupTests.ts'],
    // Several tests spin up real worker threads and spawn bwrap subprocesses
    // (CoreExec's DAG runner, the sandbox, the embedded terminal). The 5s
    // default is fine on a fast dev machine but too tight on slower/shared
    // CI hardware.
    testTimeout: 20000,
    exclude: ['node_modules', 'dist', '.idea', '.git', '.cache', '.claude/**', 'e2e/**'],
  },
});
