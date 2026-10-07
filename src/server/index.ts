// §6.0 — Genesis Hardware Profiler integration
// This bootstrapper runs the profiler if --profile is passed.
// It outputs the hardware constraints as JSON and exits.
// Tauri orchestrates this: it runs `sidecar --profile` first, reads the JSON,
// then sets UV_THREADPOOL_SIZE and memory ceilings BEFORE spawning the main sidecar.
// This strictly enforces Axiom 6 for the edge node constraint.

if (process.argv.includes('--profile')) {
  import('../core/scoutdaemon/hardware-profiler.js').then(async ({ runGenesisProfiler, getEnvRule }) => {
    try {
      await runGenesisProfiler(false); // Runs probe and writes to DB only if missing

      const uv = getEnvRule('UV_THREADPOOL_SIZE', '3');
      const maxOldSpace = getEnvRule('max_old_space_size_mb', '1024');

      console.log(JSON.stringify({
        UV_THREADPOOL_SIZE: uv,
        NODE_OPTIONS: `--max-old-space-size=${maxOldSpace}`
      }));
      
      process.exit(0);
    } catch (err) {
      console.error('[NeuroSync] Boot: Profiler failed', err);
      process.exit(1);
    }
  });
} else {
  // Main server process (environment is constrained by Tauri before execution)
  import('./server-main.js');
}
