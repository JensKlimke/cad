# @cad/kernel

Industrial B-rep geometry kernel for the CAD monorepo. Thin TypeScript wrapper
around [`replicad`](https://replicad.xyz), which wraps
[OpenCascade.js](https://ocjs.org) — the same OCCT kernel that powers FreeCAD.

The public surface is deliberately small for Slice 0: a single geometric
primitive (`createBox`) and a deterministic tessellation hash. It is the
innermost layer of the stack — every later layer (SDK, runtime, REST, MCP)
builds on top of it.

## Install

Workspace-internal. Not published. Consume via `workspace:*` from siblings.

## Usage — Node

```ts
import { createBox, tessellationHash, KERNEL_VERSION } from '@cad/kernel';

const result = await createBox({ width: 10, depth: 20, height: 30 });
console.log(result.metadata.triangleCount); // > 0
console.log(result.metadata.hash); // deterministic hex SHA-256
console.log(KERNEL_VERSION);
```

The Node path resolves the OpenCascade WASM automatically via
`require.resolve('replicad-opencascadejs/src/replicad_single.wasm')`. Zero
configuration.

## Usage — Browser (from W8 onward)

Browser consumers must supply a `locateFile` because bundlers resolve the
WASM via their own asset pipeline. Example with Vite:

```ts
import wasmUrl from 'replicad-opencascadejs/src/replicad_single.wasm?url';
import { initOCCT, createBox } from '@cad/kernel';

await initOCCT({ locateFile: () => wasmUrl });
const result = await createBox({ width: 10, depth: 20, height: 30 });
```

`initOCCT` is memoized — calling it more than once is cheap and idempotent.

## Determinism

`createBox` produces a `TessellationResult` whose `metadata.hash` is a SHA-256
over canonicalized geometry. Floating-point position and normal values are
rounded to 1e-6 precision and hashed as int32 bytes, which eliminates platform
float drift. The same box geometry produces the same hash on every machine
and every run.

The hash is how downstream layers (Playwright golden journey, mutation
testing, CI regression) assert kernel output stability. Two reference snapshots
live in `test/__snapshots__/hash.test.ts.snap`. A kernel change that moves
either hash is a deliberate, reviewable snapshot update — not an accidental
regression.

## Scripts

| Script               | Purpose                                            |
| -------------------- | -------------------------------------------------- |
| `pnpm build`         | Regenerate `src/version.ts`, then `tsc` to `dist/` |
| `pnpm typecheck`     | `tsc --noEmit` over source + tests                 |
| `pnpm test`          | Vitest — unit + integration (boots real OCCT)      |
| `pnpm test:coverage` | Vitest with v8 coverage; gate is 90/85             |
| `pnpm lint`          | ESLint (root config via `@cad/config`)             |
| `pnpm clean`         | Remove `dist/`                                     |

## Layout

```
src/
  index.ts      # public barrel
  types.ts      # BoxInput, TessellationResult, TessellationMetadata
  occt.ts       # memoized initOCCT + getOccVersion
  tessellate.ts # createBox + packMesh adapter
  hash.ts       # tessellationHash (deterministic SHA-256)
  version.ts    # KERNEL_VERSION (codegen'd)
test/
  hash.test.ts            # unit — pure function
  tessellate.int.test.ts  # integration — real OCCT
  __snapshots__/          # committed reference hashes
```
