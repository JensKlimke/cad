# Slice 4b — Verification checklist

Manual verification for handbook infrastructure.

## Package quality gates

- [ ] `pnpm --filter @cad/handbook test`
- [ ] `pnpm --filter @cad/handbook typecheck`
- [ ] `pnpm --filter @cad/cli test`
- [ ] `pnpm --filter @cad/web test`
- [ ] `pnpm --filter @cad/i18n test`
- [ ] `pnpm test:api -- --run test/handbook.int.test.ts`
- [ ] `pnpm lint:handbook`
- [ ] `pnpm lint:code`

## Web handbook

- [ ] Open a document workspace and use a `?` action from the feature tree or inspector
- [ ] The in-app viewer opens the correct handbook page
- [ ] The table of contents links scroll to the matching anchor
- [ ] Code copy buttons copy the rendered code block
- [ ] Switching to German still opens the FAQ page in German
- [ ] Opening `pad` in German shows the English fallback note

## CLI handbook

- [ ] `pnpm --filter @cad/cli exec cad docs list`
- [ ] `pnpm --filter @cad/cli exec cad docs search pad`
- [ ] `pnpm --filter @cad/cli exec cad docs /handbook/features/pad`

## Retrospective

- [ ] Any unrelated warnings or regressions were logged to `known-issues.md`
