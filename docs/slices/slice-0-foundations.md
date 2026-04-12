# Slice 0 — Foundations

> Detailed implementation plan for the first vertical slice of the CAD system.
> Parent roadmap: [`PLAN.md`](../../PLAN.md) — Slice 0.

## Goal

Ship a production-grade monorepo skeleton that proves every layer of the target architecture — kernel, CLI, web, and the full testing pyramid — runs green in CI before any feature work begins. Nothing in this slice is throwaway. Every file committed is the shape it will keep.

## Definition of Done

A fresh clone of the repo, on a clean machine with Node 22 and pnpm installed, can execute:

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test           # unit + integration
pnpm test:api       # API e2e against Testcontainers
pnpm test:e2e       # Playwright golden journey
pnpm build
pnpm --filter @cad/web dev
pnpm --filter @cad/cli exec cad --version
```

…and every command exits zero. The Vite dev server displays a rotating 3D box rendered from a tessellation produced by `@cad/kernel` running inside a Web Worker. The `cad --version` CLI prints the CAD app version, the kernel version, and the OCCT build tag. GitHub Actions on the first PR is green across every job in the matrix.

Concretely, Slice 0 is done when **all** of the following hold:

1. Monorepo layout committed (pnpm workspaces + Turborepo), no stray legacy files
2. `packages/kernel` boots replicad/OpenCascade.js WASM in both Node and browser Web Worker
3. Deterministic tessellation hash verified by snapshot test
4. `apps/web` renders the box in three.js via a Worker bridge
5. `apps/cli` binary `cad --version` resolves through pnpm
6. Every testing layer runs in CI with coverage gates enforced
7. Single Playwright golden journey (`box-renders`) runs headless under 30s
8. Lint + typecheck + audit gates block bad PRs
9. `docs/verification/slice-0.md` manual checklist green on a clean macOS install

## Out of Scope (deferred to later slices)

- Docker Compose stack, Postgres schema, auth — **Slice 1**
- SDK, authoring layer, expression engine, runtime — **Slice 2**
- Trackpad camera controller, selection, ortho/iso toggle — **Slice 3**
- Feature tree UI, parameter inspector, Monaco, dual-write — **Slice 4**
- Tailwind/shadcn/ui design system, theming — **Slice 4+**
- Handbook MDX content (only the stub CI gate lands here) — **Slice 4b**
- Any SDK op beyond `createBox` — **Slice 2+**
- OpenTelemetry, Prometheus, Helm chart — **Slice 15**

## Repository Layout After Slice 0

```
cad/
  .github/
    workflows/
      ci.yml
      stryker.yml                # weekly mutation-testing workflow (manual trigger + cron)
      dependabot.yml
  .editorconfig
  .gitattributes
  .gitignore
  .nvmrc                         # 22
  .prettierignore
  .prettierrc.json
  eslint.config.js               # ESLint 9 flat config
  package.json                   # monorepo root, scripts only
  pnpm-workspace.yaml
  turbo.json
  tsconfig.base.json
  vitest.workspace.ts

  packages/
    config/                      # shared build + lint + test config
      src/
        eslint.ts
        prettier.ts
        vitest.ts
      tsconfig.base.json
      tsconfig.lib.json
      tsconfig.node.json
      tsconfig.browser.json
      package.json
    kernel/                      # replicad/OCCT wrapper, Node + browser
      src/
        index.ts                 # public API re-exports
        occt.ts                  # lazy WASM boot (cached)
        tessellate.ts            # createBox → TessellationResult
        hash.ts                  # deterministic tessellation hash
        types.ts                 # TessellationResult, BoxInput, Metadata
      test/
        tessellate.test.ts
        hash.test.ts
        occt.node.int.test.ts
      package.json               # exports map: node, browser, types
      tsconfig.json
      vitest.config.ts

  apps/
    cli/                         # `cad` binary
      src/
        index.ts                 # commander entrypoint
        commands/
          version.ts
      bin/
        cad.js                   # shebang + import dist entrypoint
      package.json
      tsconfig.json
      vitest.config.ts
    web/                         # Vite + React SPA
      public/
        (three.js canvas wrapper; no static html assets beyond favicon)
      src/
        main.tsx
        App.tsx
        viewport/
          Viewport.tsx
          useKernelWorker.ts
          kernel.worker.ts       # Web Worker entry, imports @cad/kernel/browser
        lib/
          three-scene.ts         # three.js scene setup
      index.html
      vite.config.ts
      package.json
      tsconfig.json
      vitest.config.ts

  tests/
    containers/
      postgres.ts                # Testcontainers helper (unused at Slice 0 but real)
      minio.ts                   # Testcontainers helper (unused at Slice 0 but real)
      index.ts
    api/
      harness.ts                 # Fastify stub + Supertest wiring
      harness.test.ts            # proves the harness works
    e2e/
      playwright.config.ts
      box-renders.spec.ts        # the single Slice 0 golden journey
      fixtures/
        app.ts
    mutation/
      stryker.conf.json

  scripts/
    lint-handbook.ts              # no-op stub, exits 0 (real gate lands in Slice 4b)

  docs/
    slices/
      slice-0-foundations.md     # this file
    verification/
      slice-0.md                 # manual verification checklist
```

## Work Items (ordered, each independently verifiable)

### W1. Repo baseline & legacy cleanup

**Files**

- Delete: `src/`, `tsconfig.json`, `.DS_Store`, and the legacy root `package.json`
- Keep: `PLAN.md`, `TODO.md`, `known-issues.md`, `security-analysis.md`, `.idea/` (already gitignored), `.gitignore`
- Create: `.editorconfig`, `.gitattributes` (enforce LF), `.nvmrc` (`22`), extended `.gitignore` (adds `.DS_Store`, `dist/`, `.turbo/`, `coverage/`, `playwright-report/`, `test-results/`, `.vite/`, `*.tsbuildinfo`)
- Create: root `package.json` — monorepo root, `private: true`, `packageManager: pnpm@9.x`, scripts for every CI target

**Acceptance**: `git status` is clean; no legacy single-package `src/` or `dist/` remains.

### W2. Workspace, build orchestration, shared TypeScript config

**Files**

- `pnpm-workspace.yaml` — include `packages/*`, `apps/*`
- `turbo.json` — pipelines: `build`, `typecheck`, `lint`, `test`, `test:api`, `test:e2e`, `test:coverage`, `clean`; cache outputs for `dist/**`, `.vite/**`, `coverage/**`
- `tsconfig.base.json` — strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `target: ES2022`, `module: ESNext`, `moduleResolution: Bundler`, `declaration`, `declarationMap`, `sourceMap`, `isolatedModules`, `skipLibCheck`, `esModuleInterop`
- `packages/config/tsconfig.{base,lib,node,browser}.json` — per-environment presets extended by every package

**Acceptance**: `pnpm install` succeeds on a clean checkout; `pnpm -r typecheck` runs (passes trivially with zero source).

### W3. ESLint 9, Prettier, EditorConfig

**Files**

- `eslint.config.js` — flat config with `@typescript-eslint`, `eslint-plugin-import`, `eslint-plugin-unicorn`, `eslint-plugin-vitest`, `eslint-plugin-react`, `eslint-plugin-react-hooks`, `eslint-plugin-jsx-a11y`, `eslint-plugin-no-only-tests`
- Strict rules: `no-any: error`, `no-console: error` (per-app allowlist for `apps/cli`), `no-unused-vars: error`, `no-floating-promises: error`, `consistent-type-imports: error`, `exhaustive-deps: error` on the web app
- `.prettierrc.json` — 2-space, 100-column, single quote, trailing comma "all", no semicolons off (default), print-width consistent with the rest of the house style
- `.prettierignore` — matches `.gitignore` + generated artifacts

**Acceptance**: `pnpm lint` runs green; introducing an `any` in any file fails `pnpm lint`.

### W4. `packages/config` — shared test and lint presets

**Files**

- `packages/config/package.json` — name `@cad/config`, no build step (pure config)
- `packages/config/src/vitest.ts` — `defineVitestPreset({ packageType: 'lib' | 'node' | 'browser' })` returning a Vitest config with coverage thresholds: lib packages 90% lines / 85% branches, others 80%
- `packages/config/src/eslint.ts` — re-exports the flat config blocks for packages to compose
- `packages/config/src/prettier.ts` — the canonical Prettier object (imported by the root `.prettierrc.json`-equivalent via `prettier.config.js` if needed)

**Acceptance**: Other packages can `import { defineVitestPreset } from '@cad/config/vitest'`.

### W5. `packages/kernel` — replicad WASM boot (Node + browser)

**Dependencies**: `replicad`, `replicad-opencascadejs` (or the current recommended OCCT build)

**Files**

- `src/occt.ts` — `initOCCT()` returns a memoized `Promise<OpenCascadeInstance>`; uses `import.meta.url` URL resolution for WASM; Node path fetches the wasm from the package's own `dist/` (via `readFileSync`), browser path uses `fetch(new URL('./opencascade.wasm', import.meta.url))`. Never blocks on a cold boot more than once per process.
- `src/types.ts` —

  ```ts
  export interface BoxInput {
    readonly width: number;
    readonly depth: number;
    readonly height: number;
  }

  export interface TessellationMetadata {
    readonly hash: string;
    readonly triangleCount: number;
    readonly vertexCount: number;
    readonly bbox: {
      readonly min: readonly [number, number, number];
      readonly max: readonly [number, number, number];
    };
  }

  export interface TessellationResult {
    readonly positions: Float32Array;
    readonly normals: Float32Array;
    readonly indices: Uint32Array;
    readonly metadata: TessellationMetadata;
  }
  ```

- `src/tessellate.ts` — `export async function createBox(input: BoxInput): Promise<TessellationResult>` — validates with Zod, calls replicad `makeBox(w, d, h)`, tessellates with a configured linear/angular deflection, packs into the typed arrays above.
- `src/hash.ts` — `export function tessellationHash(result: TessellationResult): string` — SHA-256 over canonicalized float buffers (rounded to 1e-6 to beat floating-point noise); deterministic across machines.
- `src/index.ts` — public barrel: `createBox`, `tessellationHash`, `types`, `version` (read from package.json at build time via `vite-plugin-package-version` or a plain code-gen).
- `package.json` — `exports` with `node` and `browser` conditions; `"type": "module"`; `sideEffects: false`; pinned replicad + opencascade.js versions.

**Acceptance**:

- Node: `pnpm --filter @cad/kernel test` creates a 10×20×30 box, asserts triangle count > 0, asserts bbox, asserts deterministic hash over two back-to-back calls.
- Browser: bundles cleanly into a Worker in `apps/web` (verified by W8 Playwright test).

### W6. Tessellation hash snapshot test

**Files**

- `test/hash.test.ts` — deterministic hash for a fixed box (`10×20×30` and `1×1×1`); two invocations return the same hash; a 1-unit change produces a different hash.
- Snapshot: committed hash strings for the reference boxes. Breaking the kernel triggers a snapshot diff in CI.

**Acceptance**: Snapshot test fails if the kernel's output changes; updating the snapshot requires a deliberate commit.

### W7. `apps/cli` — `cad --version`

**Dependencies**: `commander` (lean, well-maintained), `@cad/kernel`

**Files**

- `src/commands/version.ts` — prints JSON when `--json` is passed, otherwise human-readable:
  ```
  cad           0.0.1
  @cad/kernel   0.0.1
  occt          7.8.1 (replicad-opencascadejs@<pinned>)
  node          v22.x
  ```
- `src/index.ts` — commander program with a single `version` command wired up; default action delegates to the version command.
- `bin/cad.js` — shebang + ESM entrypoint into compiled `dist/index.js`.
- `package.json` — `"bin": { "cad": "bin/cad.js" }`, `"type": "module"`, `"exports"`.

**Acceptance**: `pnpm --filter @cad/cli build && pnpm --filter @cad/cli exec cad --version` prints the expected lines; `cad version --json` parses as valid JSON.

### W8. `apps/web` — Vite + React 19 + three.js + kernel Worker

**Dependencies**: `react@19`, `react-dom@19`, `three`, `@types/three`, `vite`, `@vitejs/plugin-react`, `@cad/kernel`

**Files**

- `vite.config.ts` — React plugin, worker format `es`, alias `@cad/kernel` to the package's browser entry, serve `.wasm` with correct MIME, `build.target: esnext`, disable legacy polyfills
- `src/main.tsx` — React 19 root bootstrap
- `src/App.tsx` — full-viewport dark page, one child: `<Viewport />`
- `src/viewport/kernel.worker.ts` —
  ```ts
  import { createBox, tessellationHash } from '@cad/kernel';
  // Worker contract: message { kind: 'createBox', input: BoxInput } → { result, hash }
  ```
- `src/viewport/useKernelWorker.ts` — React hook that owns the worker lifecycle, posts messages, returns `{ result, hash, error, pending }`
- `src/viewport/Viewport.tsx` — builds a three.js scene inside a `<canvas>` ref, feeds it the tessellation, rotates the box, exposes `data-tessellation-hash` on the root `<div>` for e2e assertions
- `src/lib/three-scene.ts` — pure (non-React) scene construction from a `TessellationResult`

**Acceptance**: `pnpm --filter @cad/web dev` opens a page showing a rotating box; `data-tessellation-hash` matches the snapshot from W6.

### W9. Vitest workspace + unit/integration harness

**Files**

- `vitest.workspace.ts` — enumerates every `packages/*` and `apps/*` test config
- Per-package `vitest.config.ts` extends `@cad/config/vitest`
- Coverage collection via `@vitest/coverage-v8`; thresholds per package; CI uploads coverage artifact
- Unit tests (W5, W6, W7) run under `pnpm test`

**Acceptance**: `pnpm test` runs all unit + integration tests across the workspace; `pnpm test:coverage` produces a `coverage/` directory.

### W10. Testcontainers helpers (unused at Slice 0, real)

**Dependencies**: `testcontainers`

**Files**

- `tests/containers/postgres.ts` — `startPostgres()` returns `{ url, stop }`; uses `testcontainers` with Postgres 16 image
- `tests/containers/minio.ts` — same shape for MinIO
- `tests/containers/index.ts` — barrel
- `tests/containers/__smoke__.int.test.ts` — `it('boots postgres and minio', ...)` — runs only when `INTEGRATION=1` env is set, so CI can skip or include as needed

**Acceptance**: Locally, `INTEGRATION=1 pnpm test tests/containers/__smoke__.int.test.ts` boots both containers and exits green.

### W11. API e2e harness (Fastify stub + Supertest)

**Dependencies**: `fastify`, `supertest`, `@fastify/type-provider-zod`, `zod`

**Files**

- `tests/api/harness.ts` — `createTestApp()` returns a Fastify instance with a single `GET /health → { ok: true }` route; wired for Zod-based type provider so Slice 1+ can extend it without changing the harness
- `tests/api/harness.test.ts` — asserts `/health` returns `{ ok: true }` via Supertest

**Acceptance**: `pnpm test:api` runs and passes.

### W12. Playwright golden journey (`box-renders`)

**Dependencies**: `@playwright/test`

**Files**

- `tests/e2e/playwright.config.ts` — Chromium only for CI, headless, `webServer` launches the Vite dev server with a fixed port, 30s global timeout, 1 retry, trace on first retry
- `tests/e2e/box-renders.spec.ts` — launches the app, waits for the `<canvas>` to paint, reads the `data-tessellation-hash` attribute, asserts it equals the committed snapshot from W6, asserts no console errors
- `tests/e2e/fixtures/app.ts` — custom fixture that builds once per worker

**Acceptance**: `pnpm test:e2e` runs in under 30 seconds on CI and exits green.

### W13. Mutation testing baseline (Stryker, weekly)

**Dependencies**: `@stryker-mutator/core`, `@stryker-mutator/vitest-runner`

**Files**

- `tests/mutation/stryker.conf.json` — targets `packages/kernel/src/hash.ts` as the first mutation target (pure function, easy win); mutation threshold 80% high, 60% low
- `.github/workflows/stryker.yml` — weekly cron + manual dispatch

**Acceptance**: `pnpm exec stryker run` runs locally and produces a report. CI workflow file is committed but only the weekly schedule fires.

### W14. Handbook CI gate stub

**Files**

- `scripts/lint-handbook.ts` — TS CLI that currently exits 0 with the message `handbook lint stub: no SDK ops yet`. Placeholder for the real gate in Slice 4b.
- Root `package.json` script: `"lint:handbook": "tsx scripts/lint-handbook.ts"`
- Root script `lint` composes `lint:code && lint:handbook`

**Acceptance**: `pnpm lint:handbook` exits 0. A follow-up PR that introduces an SDK op without a page will fail once Slice 4b's real check replaces this stub.

### W15. GitHub Actions CI matrix

**Files**

- `.github/workflows/ci.yml` — single workflow, jobs:
  1. `setup` — checkout, pnpm + Node 22 setup with cache, `pnpm install --frozen-lockfile`
  2. `lint` — `pnpm lint && pnpm lint:handbook`
  3. `typecheck` — `pnpm -r typecheck` through Turbo
  4. `test` — `pnpm test:coverage` through Turbo with per-package parallelism; uploads `coverage/` artifact; enforces thresholds
  5. `test:api` — boots Testcontainers on the runner, `pnpm test:api`
  6. `test:e2e` — builds the web app, runs Playwright; uploads traces/screenshots on failure
  7. `audit` — `pnpm audit --prod --audit-level=high`
  8. `build` — `pnpm build` through Turbo; uploads `dist/` artifacts
- `.github/workflows/stryker.yml` — weekly Stryker run
- `.github/dependabot.yml` — pnpm ecosystem updates, weekly, grouped by major/minor

**Acceptance**: Push a branch, open a PR, CI runs all jobs green in under 10 minutes.

### W16. Verification checklist

**Files**

- `docs/verification/slice-0.md` — manual checklist mirroring Definition of Done, to be ticked on macOS and Linux; includes screenshot of the rotating box

**Acceptance**: Checklist runs on one macOS laptop and one Linux VM; every box ticked.

## Key Technical Decisions (locked for Slice 0)

| Concern            | Choice                                                                                           | Reason                                                                                           |
| ------------------ | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Node version       | **22.x**                                                                                         | Current LTS at time of writing; needed for `import.meta.url` ergonomics and recent WASM features |
| Package manager    | **pnpm 9**                                                                                       | Workspace-native, fast installs, strict peer resolution                                          |
| Build orchestrator | **Turborepo**                                                                                    | Incremental builds, remote cache-capable, one `turbo.json` vs custom scripts                     |
| Module system      | **ESM across the board**                                                                         | Node 22 ESM is stable; avoids cjs/esm interop pain                                               |
| Kernel target      | **replicad + OpenCascade.js (WASM)**                                                             | Same as PLAN.md; industrial B-rep, TS API, finders-based toponaming                              |
| Linter             | **ESLint 9 flat config**                                                                         | Required by modern plugins; future-proof                                                         |
| Formatter          | **Prettier 3**                                                                                   | House standard across the ecosystem                                                              |
| Testing            | **Vitest 2**                                                                                     | Workspace-aware, fast, vite-native, covers both Node and JSDOM                                   |
| API testing        | **Fastify + Supertest + Testcontainers**                                                         | Per PLAN.md Testing Strategy                                                                     |
| UI testing         | **Playwright 1.50+**                                                                             | Per PLAN.md; focused ≤10-test budget long-term                                                   |
| Three.js           | **r165+**                                                                                        | Current line with BufferGeometry stabilized                                                      |
| Strict TS flags    | `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noFallthroughCasesInSwitch` | Catch entire bug classes before they ship                                                        |

**Not yet introduced** (avoid scope creep): Tailwind, shadcn/ui, Radix, Zustand, TanStack Query, Monaco, Fastify auth, Postgres, MinIO, OpenTelemetry, Zod at runtime beyond the kernel's input validation. All land in the slices that need them.

## Testing Strategy (specific to Slice 0)

| Layer           | What it exercises at Slice 0                                                                             | File(s)                                      |
| --------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Unit            | `createBox` happy path, Zod validation rejects bad input, `tessellationHash` determinism and sensitivity | `packages/kernel/test/*.test.ts`             |
| Integration     | Real OCCT WASM boot in Node; same hash across two boots                                                  | `packages/kernel/test/occt.node.int.test.ts` |
| API e2e         | `/health` endpoint round-trip via Supertest against Fastify stub                                         | `tests/api/harness.test.ts`                  |
| Container smoke | Postgres + MinIO boot successfully (opt-in via `INTEGRATION=1`)                                          | `tests/containers/__smoke__.int.test.ts`     |
| UI e2e          | Web app loads, box paints, `data-tessellation-hash` matches snapshot, no console errors                  | `tests/e2e/box-renders.spec.ts`              |
| Mutation        | `packages/kernel/src/hash.ts` mutation score ≥ 80%                                                       | `tests/mutation/stryker.conf.json`           |

Coverage gates enforced in CI:

- `packages/kernel` ≥ 90% lines / 85% branches
- `packages/config` skipped (pure config)
- `apps/cli` ≥ 80% lines
- `apps/web` ≥ 70% lines (lower because three.js scene setup is hard to assert without visual regression — handled later via Playwright screenshots)

## CI Pipeline Specification

```
name: ci
on: [push, pull_request]

jobs:
  setup:
    # checkout, pnpm 9, node 22, cache, install --frozen-lockfile
  lint:        needs: [setup]  # eslint + lint:handbook
  typecheck:   needs: [setup]  # turbo run typecheck
  test:        needs: [setup]  # turbo run test:coverage + coverage gate
  test-api:    needs: [setup]  # testcontainers + supertest
  test-e2e:    needs: [build]  # playwright
  audit:       needs: [setup]  # pnpm audit --prod --audit-level=high
  build:       needs: [typecheck]  # turbo run build
```

Target: first-PR green run ≤ **10 minutes** end-to-end on GitHub-hosted runners. If Playwright exceeds its 3-minute budget from day one, we tune concurrency before merging Slice 0.

## Risks & Mitigations

| Risk                                                     | Likelihood | Impact | Mitigation                                                                                                          |
| -------------------------------------------------------- | ---------- | ------ | ------------------------------------------------------------------------------------------------------------------- |
| OpenCascade.js WASM >30 MB blows out the Vite bundle     | Med        | High   | Load kernel only inside the Worker; serve the `.wasm` as a separate static asset; gzip/br compression in dev server |
| Node + browser dual-target for replicad is finicky       | High       | High   | Isolated `packages/kernel` with `exports` conditions; both paths covered by tests in W5 and W8                      |
| Testcontainers on GitHub Actions is slow on cold runners | Med        | Med    | Pin container digests; cache Docker layers; only one API e2e uses containers at Slice 0                             |
| Playwright flakes on CI                                  | Med        | Med    | Single test, one retry, deterministic hash assertion instead of visual diff                                         |
| Stryker is heavy                                         | Low        | Low    | Weekly job only, not on every PR                                                                                    |
| OCCT version drift changes tessellation output           | Low        | High   | Pin `replicad` and `replicad-opencascadejs` to exact versions; commit tessellation hash snapshot                    |

## Verification Runbook (`docs/verification/slice-0.md`)

1. `git clean -fdx` and `pnpm install`
2. `pnpm lint`
3. `pnpm typecheck`
4. `pnpm test:coverage` — coverage HTML produced under `coverage/`, all packages green
5. `INTEGRATION=1 pnpm test tests/containers/__smoke__.int.test.ts`
6. `pnpm test:api`
7. `pnpm build`
8. `pnpm test:e2e`
9. `pnpm --filter @cad/web dev` — open the browser, confirm a rotating box, open devtools, verify `data-tessellation-hash` on the viewport root
10. `pnpm --filter @cad/cli build && pnpm --filter @cad/cli exec cad --version` — confirm the three version lines
11. Push to a branch, open a PR, wait for CI green
12. Screenshot the rotating box, attach to PR description

Every step must pass before Slice 0 is called done.

## Exit Criteria → Gate into Slice 1

Slice 1 (Project & Document Lifecycle) may **begin only after**:

- This plan's Definition of Done is met
- CI has been green on `main` for at least one PR cycle
- `known-issues.md` has no P0 or P1 entries introduced by this slice
- A short retrospective note is added to the bottom of this file ("what landed clean / what needs follow-up")
