import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// The production build is a single self-contained HTML file (workers inlined) so the
// app can be opened directly from disk with no server and no installation.
export default defineConfig({
  plugins: [react(), viteSingleFile({ removeViteModuleLoader: true })],
  base: './',
  worker: { format: 'iife' },
  build: {
    outDir: 'dist',
    target: 'es2022',
    assetsInlineLimit: 100000000,
    chunkSizeWarningLimit: 100000,
    cssCodeSplit: false,
  },
  test: { environment: 'node', include: ['tests/**/*.test.ts'], testTimeout: 600000 },
} as never);
