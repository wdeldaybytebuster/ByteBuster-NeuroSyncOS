import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Several tests spin up real worker threads and spawn bwrap subprocesses
    // (CoreExec's DAG runner, the sandbox, the embedded terminal). The 5s
    // default is fine on a fast dev machine but too tight on slower/shared
    // CI hardware.
    testTimeout: 20000,
  },
});
