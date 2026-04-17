# Slice 2 — Verification checklist

Manual verification for the Slice 2 runtime and authoring baseline.

## Prerequisites

- [ ] Slice 1 stack boots cleanly
- [ ] Node 22 and pnpm 9 installed
- [ ] Docker running for API integration tests

## Package quality gates

- [ ] `pnpm --filter @cad/expr test`
- [ ] `pnpm --filter @cad/sdk test`
- [ ] `pnpm --filter @cad/authoring test`
- [ ] `pnpm --filter @cad/runtime test`
- [ ] `pnpm --filter @cad/expr test:coverage`
- [ ] `pnpm --filter @cad/sdk test:coverage`
- [ ] `pnpm --filter @cad/authoring test:coverage`
- [ ] `pnpm --filter @cad/runtime test:coverage`
- [ ] `pnpm typecheck`
- [ ] `pnpm lint:code`
- [ ] `pnpm test:e2e`

## CLI build

- [ ] Create a local `hello.ts` using `@cad/sdk`
- [ ] `pnpm --filter @cad/cli exec cad build hello.ts`
- [ ] Output is valid JSON containing `documentHash`, `parameters`, `features`, and `tessellation`
- [ ] Changing a parameter in `hello.ts` changes the deterministic build output

## Server build

- [ ] Boot the Slice 1 compose stack
- [ ] Create a project and document with valid `@cad/sdk` source
- [ ] `POST /documents/:id/build` returns 200 with artifact URL and build payload
- [ ] Downloading the artifact URL returns the same JSON build result

## Retrospective

- [ ] Any unrelated warnings or regressions were logged to `known-issues.md`
- [ ] Mutation testing note updated: current `tests/mutation/stryker.conf.json` still targets `packages/kernel/src/hash.ts` only; Slice 2 packages are not yet in the Stryker scope
