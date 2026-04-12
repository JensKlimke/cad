# Slice 0 — Verification checklist

Manual verification for the Slice 0 release. Run through this on a clean
machine (or a fresh `git clone` in a new directory) before declaring
Slice 0 shipped. Every box must tick green; record any exceptions in the
**Retrospective** section below.

## Prerequisites

- [ ] Node 22 installed (`node -v` prints `v22.x`)
- [ ] pnpm 9.15 installed (`pnpm -v` prints `9.15.x`)
- [ ] Docker Desktop or equivalent running (for the opt-in Testcontainers
      smoke test only — CI and default test runs do not require it)

## Clean install

- [ ] `rm -rf node_modules packages/*/node_modules apps/*/node_modules tests/*/node_modules pnpm-lock.yaml`
- [ ] `pnpm install` — completes with zero peer-dep warnings (the
      `postinstall` script reports `patched N manifest(s), N source file(s)`)
- [ ] `node_modules/@cad/config`, `node_modules/@cad/kernel`, `node_modules/@cad/tests-e2e`, etc. are symlinks into `packages/*` / `tests/*`

## Unit + integration tests

- [ ] `pnpm -r test` — exits zero, reports `Test Files passed` for every
      workspace package with tests

Expected counts at time of Slice 0 release (update when new tests land):

| Package                 | Files | Tests                           |
| ----------------------- | ----- | ------------------------------- |
| `@cad/kernel`           | 4     | 28                              |
| `@cad/cli`              | 3     | 16                              |
| `@cad/web`              | 2     | 6                               |
| `@cad/tests-api`        | 1     | 5                               |
| `@cad/tests-containers` | 1     | 1 (+2 gated on `INTEGRATION=1`) |

- [ ] `pnpm -r test:coverage` — every package meets its preset threshold: - `@cad/kernel`: lib preset (90 / 85 / 90 / 90) ✓ - `@cad/cli`: node preset (80 / 75 / 80 / 80) ✓ - `@cad/web`: browser preset (70 / 60 / 70 / 70) ✓ - `@cad/tests-api`: node preset ✓

- [ ] `INTEGRATION=1 pnpm --filter @cad/tests-containers test` — boots
      Postgres and MinIO containers end-to-end, exits zero within 90s

## API e2e

- [ ] `pnpm test:api` — Fastify harness boots, `/health` round-trip passes,
      404 path passes, uptime monotonicity passes

## UI e2e (Playwright)

- [ ] `pnpm exec playwright install chromium` (one-time per machine)
- [ ] `pnpm -r build` (Playwright's webServer launches `vite preview`)
- [ ] `pnpm test:e2e` — single golden journey passes in ≤30s
- [ ] The `box-renders` spec asserts the viewport's
      `data-tessellation-hash` attribute equals
      `c3a9076d584ff45bacc82ee495860a8a60815b0f4f6e917edf2a6a437a427cb0`
      (same hash committed in the kernel integration snapshot)

## Type safety + lint + format

- [ ] `pnpm -r typecheck` — exits zero for every package
- [ ] `pnpm lint:code` — exits zero, no eslint errors
- [ ] `pnpm lint:handbook` — exits zero (Slice 0 stub: no SDK ops yet)
- [ ] `pnpm format:check` — exits zero, "All matched files use Prettier code style"

## Build

- [ ] `pnpm -r build` — every package with a `build` script emits to
      `dist/` (or `apps/web/dist/` for Vite)
- [ ] `pnpm --filter @cad/kernel build` — emits `dist/index.js` +
      `dist/index.d.ts` + `dist/.tsbuildinfo`
- [ ] `pnpm --filter @cad/cli build` — emits `dist/index.js`; `bin/cad.js`
      can execute it directly
- [ ] `pnpm --filter @cad/web build` — emits `dist/index.html`,
      `dist/assets/index-*.js`, `dist/assets/kernel.worker-*.js`,
      `dist/assets/replicad_single-*.wasm`

## Hands-on smoke

- [ ] `pnpm --filter @cad/cli exec cad --version` prints four lines:

      ```
      cad           0.0.1
      @cad/kernel   0.0.1
      occt          replicad-opencascadejs@0.23.0
      node          v22.x
      ```

- [ ] `pnpm --filter @cad/cli exec cad version --json` prints parseable
      JSON with the same four keys
- [ ] `pnpm --filter @cad/web dev` — Vite dev server starts on
      http://localhost:5173, the browser shows a rotating 3D box (blue-ish
      metallic shading), the devtools "Elements" panel shows
      `data-tessellation-hash="c3a9076d..."` on the viewport root
- [ ] The rotating box is smooth (no stutter), no red errors in the
      devtools Console

## Mutation testing (opt-in)

- [ ] `pnpm test:mutation` — Stryker runs against
      `packages/kernel/src/hash.ts`, reports a mutation score ≥ 80%
      (the `high` threshold in `stryker.conf.json`) - This is a weekly CI job, not a PR gate. Run manually only if
      you're touching the hash function.

## CI smoke (GitHub Actions)

- [ ] Open a PR against `main`; the `ci` workflow runs and every job
      turns green: `lint`, `typecheck`, `test`, `test-api`, `build`,
      `test-e2e`
- [ ] Playwright artifacts (HTML report + screenshots + video on failure)
      upload correctly

## Retrospective

Space for the human running this checklist to note anything that didn't
land cleanly, or follow-ups the next slice should carry.

### What landed clean

- _(fill in)_

### What needs follow-up

- _(fill in)_

### Discovered issues (file in `known-issues.md`)

- _(fill in; link to the issue entry)_
