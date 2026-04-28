import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.tsx'],
  format: ['esm'],
  target: 'node18',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  dts: true,
  banner: {
    js: '#!/usr/bin/env node\nimport { createRequire as __argoCreateRequire } from "module"; const require = __argoCreateRequire(import.meta.url);',
  },
  external: ['node-pty'],
});
