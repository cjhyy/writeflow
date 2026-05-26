import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig({
  main: {
    build: {
      outDir: 'out/main',
      lib: { entry: 'src/main/index.ts' },
      rollupOptions: {
        // The SDK uses dynamic `require('./openrouter-models.json')` and reads
        // .md prompt sections relative to its own dist/ at runtime. Bundling
        // breaks those lookups; keep it external so it loads from node_modules.
        external: ['@cjhyy/code-shell-core', 'electron'],
      },
    },
  },
  preload: {
    build: {
      outDir: 'out/preload',
      lib: {
        entry: 'src/preload/index.ts',
        formats: ['cjs'],
        fileName: () => 'index.js',
      },
      rollupOptions: {
        output: { format: 'cjs', entryFileNames: 'index.js' },
      },
    },
  },
  renderer: {
    root: 'src/renderer',
    plugins: [react()],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src/renderer/src'),
        '@shared': resolve(__dirname, 'src/shared'),
      },
    },
    build: {
      outDir: 'out/renderer',
    },
  },
})
