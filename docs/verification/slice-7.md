# Slice 7 Verification

## Automated Gates

- [x] `pnpm lint:code`
- [x] `pnpm lint:handbook`
- [x] `pnpm typecheck`
- [x] `pnpm build`
- [x] `pnpm test`
- [x] `pnpm test:api`
- [x] `INTEGRATION=1 pnpm --filter @cad/tests-api test -- build.int.test.ts`
- [x] `pnpm test:e2e`

## Manual Checklist

- [x] Open a document and build the default pad.
- [x] Click a face in the viewport.
- [x] Confirm the reference panel shows a stable handle and resolver layer.
- [x] Edit an upstream dimension and rebuild.
- [x] Confirm the selected semantic face still resolves.
- [x] Confirm unresolved handles surface diagnostics and ranked repair candidates in package/API tests.

## Acceptance Notes

Slice 7 validates reference survival on the current production feature set: sketch + pad. Fillet/chamfer consumers are intentionally deferred to Slice 8 so this slice does not ship placeholder geometry operations.

The root `pnpm test` pass includes the Compose-backed Playwright lifecycle suite. During verification, the server/web Compose image builds were narrowed to package-filtered builds to avoid rebuilding the full monorepo inside memory-constrained Docker build steps.
