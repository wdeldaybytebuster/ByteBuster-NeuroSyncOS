import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react({})],
  server: {
    port: 3742,
    proxy: {
      '/api': 'http://localhost:3743',
    },
  },
  root: '.',
  build: {
    outDir: 'dist/ui',
    // Phase F-2 — deterministic vendor chunking for the edge node.
    //
    // 1. chunkSizeWarningLimit 800 kB — the previous single-bundle build
    //    blew past Vite's 500 kB default on the combined
    //    react + lucide + xyflow + xterm graph. 800 kB is the honest
    //    per-chunk ceiling this app's UI can keep under.
    // 2. manualChunks splits the three heavy, independently-cacheable
    //    dependency families into their own chunks so an app-code change
    //    never invalidates them (and vice-versa) on a cold eMMC boot:
    //      xterm   — @xterm/* (terminal viewport; only PortGrid mounts it)
    //      xyflow  — @xyflow/* (the CoreExec DAG canvas)
    //      vendor-react — react/react-dom/scheduler (changes ~never)
    //      vendor  — everything else from node_modules
    //    Ordering matters: the narrow families are matched BEFORE the
    //    generic vendor bucket, and xyflow/xterm are matched before
    //    vendor-react so nothing lands in two chunks (Rollup throws on
    //    overlapping manualChunks aliases).
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks(id: string): string | undefined {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('@xterm')) return 'xterm';
          if (id.includes('@xyflow')) return 'xyflow';
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'vendor-react';
          return 'vendor';
        },
      },
    },
  },
});
