import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// The one-city game on its own page (play.html): `npm run play` to develop, `npm run build:play`
// for one self-contained file in dist-play/. React comes from a CDN in that build (see
// tools/artpage.mjs), so the page stays small.
export default defineConfig(({ command }) => ({
  plugins: [viteSingleFile({ removeViteModuleLoader: true })],
  base: './',
  esbuild: { jsx: 'transform', jsxFactory: 'React.createElement', jsxFragment: 'React.Fragment', jsxInject: `import React from 'react'` },
  build: {
    outDir: 'dist-play',
    emptyOutDir: true,
    target: 'es2022',
    assetsInlineLimit: 100000000,
    cssCodeSplit: false,
    rollupOptions: command === 'build' ? {
      input: 'play.html',
      external: ['react', 'react-dom', 'react-dom/client'],
      output: { format: 'iife', globals: { react: 'React', 'react-dom': 'ReactDOM', 'react-dom/client': 'ReactDOM' } },
    } : { input: 'play.html' },
  },
}));
