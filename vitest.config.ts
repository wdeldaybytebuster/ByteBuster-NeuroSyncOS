import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // scripts/tauri-config.test.ts is dual-mode: it must ALSO run under bare
    // `npx tsx`, where any `import ... from 'vitest'` becomes a `require` that
    // vitest's CJS entry deliberately throws on. It therefore registers its
    // tests through the globals injected here instead of importing vitest.
    // Explicit `import { ... } from 'vitest'` in other test files is unaffected.
    globals: true,
    // Several tests spin up real worker threads and spawn bwrap subprocesses
    // (CoreExec's DAG runner, the sandbox, the embedded terminal). The 5s
    // default is fine on a fast dev machine but too tight on slower/shared
    // CI hardware.
    testTimeout: 20000,
    exclude: ['node_modules', 'dist', '.idea', '.git', '.cache', '.claude/**', 'e2e/**'],
  },
});
