# @cad/web

Vite + React 19 + three.js web editor for the CAD monorepo. Slice 0 ships a
single viewport that renders a rotating box produced by `@cad/kernel` running
inside a Web Worker.

## Architecture

```
main thread                           kernel.worker.ts
─────────────────                     ───────────────────
<App> → <Viewport>                    import.meta.url:
  ├─ useKernelWorker(box) ─────────▶    initOCCT({ locateFile: () => wasmUrl })
  │    (starts a Worker, posts        createBox(input)
  │     a `createBox` message)          → TessellationResult
  │    ◀────────────────────────────    (posted back to main thread)
  └─ three-scene.ts
       BufferGeometry from positions/normals/indices
       WebGLRenderer → <canvas>
       rAF rotation loop
```

- The kernel never runs on the main thread — `apps/web` always drives it
  through the worker bridge. This keeps OCCT boot (~1 s first call) off
  the main loop.
- `replicad-opencascadejs/src/replicad_single.wasm` is imported via Vite's
  `?url` suffix; the resulting URL is passed to `initOCCT`'s `locateFile`
  hook, matching the browser contract `@cad/kernel` exposes.
- The root `<div>` writes `data-tessellation-hash` from the kernel result.
  Playwright (W12) asserts this attribute equals the committed snapshot
  from `packages/kernel/test/__snapshots__/tessellate.int.test.ts.snap`.

## Scripts

| Script               | Purpose                                                 |
| -------------------- | ------------------------------------------------------- |
| `pnpm dev`           | Vite dev server on port 5173                            |
| `pnpm build`         | Vite production build to `dist/`                        |
| `pnpm preview`       | Serve the production build locally                      |
| `pnpm typecheck`     | `tsc --noEmit` over source + tests                      |
| `pnpm test`          | Vitest (happy-dom) — React hook + smoke render          |
| `pnpm test:coverage` | Vitest with v8 coverage; gate is 70/60 (browser preset) |
| `pnpm lint`          | ESLint (root config via `@cad/config`)                  |
| `pnpm clean`         | Remove `dist/` and `.vite/`                             |

## Layout

```
index.html                 # Vite entry
src/
  main.tsx                 # React 19 root bootstrap
  App.tsx                  # Full-viewport host
  index.css                # Minimal reset
  viewport/
    Viewport.tsx           # three.js <canvas> + data-tessellation-hash attribute
    useKernelWorker.ts     # React hook owning the worker lifecycle
    kernel.worker.ts       # Worker entry — boots OCCT, runs createBox
  lib/
    three-scene.ts         # Pure scene builder from a TessellationResult
test/
  use-kernel-worker.test.tsx # unit — mocked Worker, asserts state machine
  App.test.tsx               # smoke — renders App in happy-dom
  setup.ts                   # happy-dom globals
```
