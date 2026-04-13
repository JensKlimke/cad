# Known issues

> This file captures issues and issues discovered during development that are **unrelated to the current task**. AI coding agents must log issues here rather than silently ignoring them.

## How to log an issue

Each entry should follow this format:

```markdown
## [Priority] Short title — affected area

**Observed:** YYYY-MM-DD
**Where:** Build / Lint / Test / Stack logs / Browser / E2E / etc.
**Affects:** Package(s) or component(s)

**Symptom:** What you observed (error message, unexpected behavior, warning).

**Root cause:** If known, otherwise "To be investigated."
**Workaround:** If known, otherwise "None."
```

### Priority levels

- **P0 — Critical**: Data loss, security vulnerability, or blocking production deployments.
- **P1 — High**: Feature broken for users, but workaround exists or limited scope.
- **P2 — Medium**: Degraded experience, warnings, or tooling issues that affect developer workflow.
- **P3 — Low**: Cosmetic issues, minor inconsistencies, or upstream issues with no immediate impact.

## Fixing an issue

Remove the issue from this doc after fixing.

---

## [P2] `eslint` 9 → 10 upgrade blocked by React plugin ecosystem — Audit (outdated)

**Observed:** 2026-04-13
**Where:** `pnpm audit:outdated` (run via `pnpm audit:deps`)
**Affects:** root workspace, `@cad/config`

**Symptom:** `eslint` 10.2.0 and `@eslint/js` 10.0.1 are upstream-current. We are pinned at 9.39.4. Trying to upgrade fails at runtime: `eslint-plugin-react@7.37.5` calls APIs that were renamed in eslint 10 and throws `TypeError: contextOrFilename.getFilename is not a function` for every TSX file. `eslint-plugin-react-hooks@7.0.1`, `eslint-plugin-jsx-a11y@6.10.2`, and `eslint-plugin-react@7.37.5` all peer-dep `eslint ^9` only — none of them have shipped an eslint-10-compatible version yet.

**Root cause:** Upstream React plugin maintainers have not released eslint-10-compatible versions. The peer-dep range is enforced both at install time (warnings) and at runtime (the `getFilename` API drift).

**Workaround:** Both packages are listed in `outdated.exceptions` in `scripts/audit-deps.config.json` so the audit surfaces them as `info` instead of blocking. The exception only suppresses the block while the latest major remains 10 — the moment upstream ships a new major, the audit re-fails and forces a fresh decision. Tracked here as P2 with a deadline: re-evaluate when any one of `eslint-plugin-react`, `eslint-plugin-react-hooks`, or `eslint-plugin-jsx-a11y` releases a major that supports eslint 10.

## [P2] `replicad-opencascadejs@0.23.0` ships a hybrid CJS/ESM source file — Kernel toolchain

**Observed:** 2026-04-12
**Where:** `pnpm --filter @cad/kernel test`, `pnpm --filter @cad/kernel build`, raw `node` invocations that `import` the package
**Affects:** `@cad/kernel` (Node boot path, Vitest integration suite, future Web Worker build in `apps/web`)

**Symptom:** Upstream `replicad-opencascadejs` ships `src/replicad_single.js` as an Emscripten-generated module that (a) ends with `export default Module;` (ESM), (b) is declared `type: commonjs` via its own `package.json`, and (c) uses CJS globals `__dirname`, `__filename`, and bare `require()` calls inside its Node runtime branches. Node 24 rejects the combination with `ERR_AMBIGUOUS_MODULE_SYNTAX`; even when coerced through as ESM, it throws `ReferenceError: __dirname is not defined` at runtime. The package also contains no `"type"` field at all, so Node's default module-format inference fails.

**Root cause:** Upstream build pipeline emits mixed CJS/ESM output without the package.json metadata needed for either format. Tracked loosely in community reports against replicad.

**Workaround:** `scripts/patch-occt-esm.mjs` runs as `postinstall` after every `pnpm install` and idempotently:

1. Injects `"type": "module"` into the installed `replicad-opencascadejs/package.json`.
2. Prepends a CJS-in-ESM polyfill preamble (via `createRequire` + `fileURLToPath`) to `src/replicad_single.js` and `src/replicad_with_exceptions.js` so `__dirname`, `__filename`, and `require` resolve inside the file's own code at runtime.

Both patches are marker-guarded and safe to re-run. Remove the entire script and this entry when upstream ships a proper ESM build.

Alternative approaches considered and rejected:

- `.pnpmfile.cjs` `readPackage` hook — modifies pnpm's in-memory dependency graph but does not touch the on-disk manifest, so the fix never reaches the file system. Verified with a logging hook.
- `pnpm.packageExtensions` — documented to affect only dependency-related fields, not `type`.
- `pnpm patch` — works, but requires committing a patch blob plus a `pnpm.patchedDependencies` entry that must be regenerated on every version bump and spans both source files.

## [P3] `replicad-opencascadejs@0.23.0` Emscripten init function is typed as zero-arg — Kernel typing

**Observed:** 2026-04-12
**Where:** `tsc --noEmit -p tsconfig.json` in `packages/kernel`
**Affects:** `@cad/kernel/src/occt.ts`

**Symptom:** `replicad-opencascadejs/src/replicad_single.d.ts` declares `declare function init(): Promise<OpenCascadeInstance>` — zero arguments. The Emscripten module does in fact accept an options object at runtime (`{ locateFile, wasmBinary, ... }`), so passing one is necessary for the Node boot path, but TypeScript flags the call as `TS2554: Expected 0 arguments, but got 1`.

**Root cause:** Upstream hand-crafted `.d.ts` is incomplete — it does not mirror Emscripten's module-options contract.

**Workaround:** `src/occt.ts` defines a local `OCCTInitFn` type that re-types the default import with the correct signature, then casts the import site. The cast is scoped to the one place that needs it and documented inline. Remove when upstream publishes an accurate declaration.

## [P3] `eslint-plugin-jsx-a11y` and `eslint-plugin-no-only-tests` ship no type declarations — Lint typing

**Observed:** 2026-04-12
**Where:** `tsc --noEmit` in `packages/config`
**Affects:** `@cad/config/src/eslint.js` (indirectly: every consumer of `@cad/config/eslint`)

**Symptom:** Neither plugin ships a `.d.ts` file or a corresponding `@types/*` package. Importing them from a TypeScript-aware `tsc --checkJs` context raises `TS7016 — Could not find a declaration file for module ...`.

**Root cause:** Upstream — both are plain JavaScript packages and have never shipped typings.

**Workaround:** `packages/config/src/shims.d.ts` declares both modules with the minimum shape `@cad/config` consumes (`ESLint.Plugin` for `no-only-tests`; `ESLint.Plugin` extended with `flatConfigs.{recommended, strict}` for `jsx-a11y`). Remove the corresponding block when each upstream publishes types.

## [P3] oxc does not resolve tsconfig package-path `extends` — Vitest/Vite transform

**Observed:** 2026-04-12
**Where:** `pnpm --filter @cad/kernel test` when `packages/kernel/tsconfig.json` extended `@cad/config/tsconfig/node`
**Affects:** Any workspace package that runs its test suite through Vitest 4

**Symptom:** Vite 8's default `vite:oxc` TypeScript-transform plugin failed with `[TSCONFIG_ERROR] Error: Failed to load tsconfig for '...'`. Switching the extends target from a package-path (`@cad/config/tsconfig/node`) to an equivalent relative path (`../config/tsconfig.node.json`) resolved it. `tsc` itself has no issue with either form.

**Root cause:** oxc's tsconfig loader does not yet follow package.json `exports` resolution for tsconfig `extends`.

**Workaround:** `packages/kernel/tsconfig.json` uses a relative `extends` path. New packages should do the same until oxc catches up. Not a blocker; the shared config is still reused via the relative path.

## [P3] Vite 8 externalizes Node builtins (`node:module`, `node:url`, `node:path`, `fs`) during `apps/web` build — Web bundling

**Observed:** 2026-04-12
**Where:** `pnpm --filter @cad/web build`
**Affects:** `apps/web` production bundle — does not affect tests or dev

**Symptom:** `vite build` prints four `[plugin rolldown:vite-resolve] Module "node:..." has been externalized for browser compatibility` warnings, originating from:

- `packages/kernel/dist/occt.js` (our own `await import('node:module')` inside the Node-only branch of `resolveDefaultLocateFile`)
- `node_modules/.pnpm/replicad-opencascadejs@*/src/replicad_single.js` (postinstall-patched CJS-in-ESM preamble that imports `node:module`, `node:url`, `node:path`)
- `node_modules/.pnpm/replicad@*/dist/replicad.js` (replicad's own Node code path, `import 'fs'`)

**Root cause:** The kernel and replicad both contain dual-target code paths — a Node branch that uses `node:*` builtins and a browser branch that does not. Vite cannot statically prove the Node branches are dead in the browser bundle, so it externalizes the builtins to empty stubs.

**Workaround:** Kernel's browser branch detects the externalized stub via `typeof __cadNodeModule.createRequire === 'function'` and falls back to inert values, so the stubs are never actually invoked at runtime. Replicad's own Node branches are gated on `ENVIRONMENT_IS_NODE` (an Emscripten runtime constant) and likewise never execute in the browser. The warnings are expected and safe. We could silence them with a custom Vite plugin or per-import tree-shaking hints, but the noise is tolerable for now.

## [P3] `apps/web` production bundle is large (10.8 MB WASM + 700 KB JS) — Bundle size

**Observed:** 2026-04-12
**Where:** `pnpm --filter @cad/web build`
**Affects:** Initial page-load bundle size for `apps/web` production deployments

**Symptom:** Vite reports `Some chunks are larger than 500 kB after minification`. Observed sizes:

- `dist/assets/replicad_single-*.wasm` — 10.8 MB (gzip 4.6 MB) — the full OpenCascade.js kernel
- `dist/assets/index-*.js` — 696 KB (gzip 187 KB) — three.js + React + app
- `dist/assets/kernel.worker-*.js` — 342 KB — kernel bridge bundled into the worker

**Root cause:** OpenCascade.js is an industrial-grade B-rep kernel; it ships a large binary by design. Three.js is ~600 KB uncompressed. These are load-bearing dependencies.

**Workaround:** The WASM asset is loaded lazily by the Web Worker, not on the critical path — users see the React shell before the kernel boots. Real page-weight optimization (code-splitting, three.js tree-shaking, brotli compression) is a later slice concern. Not a regression.

## [P3] `unicorn/number-literal-case` default conflicts with Prettier 3 hex normalization — Lint toolchain

**Observed:** 2026-04-12
**Where:** `pnpm lint:code` + `pnpm format:check` on `apps/web/src/lib/three-scene.ts`
**Affects:** Any file containing hexadecimal numeric literals

**Symptom:** Out-of-the-box, `unicorn/number-literal-case` enforces **uppercase** hex digits (`0xFF_FF_FF`) while Prettier 3 normalizes them to **lowercase** (`0xff_ff_ff`). The two tools fight over every hex literal and neither `eslint --fix` nor `prettier --write` converges.

**Root cause:** Unicorn's rule default predates Prettier 3's hex normalization (added in 2024). The rule has a `hexadecimalValue` option that accepts `'lowercase'` to match Prettier.

**Workaround:** `packages/config/src/eslint.js` overrides the rule with `{ hexadecimalValue: 'lowercase' }` so Unicorn and Prettier agree. Resolved at the preset level; no per-file action needed.

## [P3] Vitest 4 v8 coverage text reporter renders an empty file table for small packages — Tooling

**Observed:** 2026-04-12
**Where:** `pnpm --filter @cad/cli test:coverage` (and similar on other small packages)
**Affects:** CI output readability — does not affect threshold enforcement or the underlying lcov/HTML reports

**Symptom:** The text reporter prints the coverage summary box correctly (`Statements : 100% (4/4)` etc.) but the per-file table between the header and footer is empty:

```
File          | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
--------------|---------|----------|---------|---------|-------------------
--------------|---------|----------|---------|---------|-------------------
```

The lcov report in `coverage/lcov.info` contains the correct per-file data, so the issue is cosmetic and isolated to the `text` reporter.

**Root cause:** Likely a rendering bug in `@vitest/coverage-v8@4.1.4` when the covered file list is short. To be investigated — upstream.

**Workaround:** None needed — the `lcov` and `html` reporters emit correct data, coverage thresholds are enforced correctly, and the text reporter's summary section works. Revisit if it starts masking real coverage regressions.

## [P3] `testcontainers` v11 moved Postgres module to `@testcontainers/postgresql` — Test tooling

**Observed:** 2026-04-12
**Where:** `pnpm --filter @cad/tests-containers typecheck` while scaffolding Wave C
**Affects:** `tests/containers` (Postgres factory only — MinIO still uses `GenericContainer` from the root `testcontainers` package)

**Symptom:** `import { PostgreSqlContainer } from 'testcontainers'` reports `TS2305: Module has no exported member 'PostgreSqlContainer'`. In v10 the class was re-exported from the main package; v11 moved each first-party container module to its own `@testcontainers/<name>` scoped package so the base install stays small.

**Root cause:** Upstream restructuring in `testcontainers` v11 — documented in their migration notes. Not a bug.

**Workaround:** Added `@testcontainers/postgresql@^11.14.0` as a direct dep alongside the base `testcontainers` package and imported `PostgreSqlContainer` from it. The base package is still needed for `GenericContainer` + `Wait` (used by the MinIO factory). The two packages share the same major version tag.

## [P3] `ssh2` native binding builds from source on `pnpm install` — Install tooling

**Observed:** 2026-04-12
**Where:** `pnpm install` after Wave C introduced `testcontainers` as a transitive dep
**Affects:** First install on each dev machine — adds ~10 s to `pnpm install`

**Symptom:** pnpm runs `ssh2`'s `install` script which invokes `node-gyp` to compile a native SSH crypto binding. Output is verbose (`CXX(target) Release/obj.target/...`) but harmless; the binding compiles successfully.

**Root cause:** `testcontainers` depends on `ssh2` for its remote-Docker-host support. `ssh2` ships an optional native crypto binding that is compiled locally on install rather than distributed as a prebuilt binary.

**Workaround:** None needed. The build succeeds and the binding is cached in the pnpm store after the first install — subsequent installs on the same machine reuse it. If local `node-gyp` becomes a problem in CI (e.g. Python missing on a new runner image), pin an older `ssh2` or exclude the build.

## [P3] `glob@10.5.0` deprecation warning from transitive dependency — Install tooling

**Observed:** 2026-04-12
**Where:** `pnpm install` after Wave C introduced `testcontainers`
**Affects:** Install output noise only; no functional impact

**Symptom:** pnpm prints `WARN  1 deprecated subdependencies found: glob@10.5.0`. The warning originates from a transitive pull somewhere under `testcontainers` / `ssh2`.

**Root cause:** Upstream dependency still ranges on a pre-11 glob. Not under our control.

**Workaround:** None. The deprecated version still works; the warning is purely informational. Revisit during the next major dependency audit pass.
