# Slice 5 Verification

- [ ] `pnpm --filter @cad/sketch test`
- [ ] `pnpm --filter @cad/sdk test`
- [ ] `pnpm --filter @cad/authoring test`
- [ ] `pnpm --filter @cad/runtime test`
- [ ] `pnpm --filter @cad/web test`
- [ ] `pnpm --filter @cad/web typecheck`
- [ ] `INTEGRATION=1 pnpm --filter @cad/tests-api test`
- [ ] `pnpm test:e2e`

## Manual

- [ ] Create a project and document in the local stack
- [ ] Add a sketch feature from the document tree
- [ ] Enter sketch mode from the inspector
- [ ] Redraw the rectangle on the sketch canvas
- [ ] Bind width or height to a parameter and apply the dimensions
- [ ] Exit sketch mode and confirm Monaco shows `sketch({ plane, svg, constraints })`
- [ ] Build the document successfully
- [ ] Confirm sketch-only documents build without a tessellation error
