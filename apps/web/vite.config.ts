import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Vite config for the CAD web editor.
//
// - React 19 via the standard plugin.
// - Workers emitted as ES modules so `new Worker(new URL('./kernel.worker.ts',
//   import.meta.url), { type: 'module' })` works with bundler-resolved URLs.
// - `optimizeDeps.exclude` on `replicad-opencascadejs` and `@cad/kernel`
//   stops Vite from pre-bundling the OCCT WASM module — it's large, has
//   the postinstall preamble fix, and is imported via `?url` for the `.wasm`
//   asset from inside the worker.
// - `build.target: 'esnext'` lets us rely on top-level await and modern
//   syntax inside the worker.
// - `server.fs.allow` is widened to the workspace root so the dev server
//   can serve files from sibling packages via pnpm symlinks.

export default defineConfig({
  plugins: [react()],
  build: {
    target: 'esnext',
    sourcemap: true,
  },
  worker: {
    format: 'es',
  },
  server: {
    port: 5173,
    strictPort: false,
    fs: {
      allow: ['..', '../..'],
    },
  },
  optimizeDeps: {
    exclude: ['@cad/kernel', 'replicad-opencascadejs'],
  },
});
