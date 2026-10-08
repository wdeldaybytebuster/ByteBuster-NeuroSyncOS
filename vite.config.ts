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
  },
});
