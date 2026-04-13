# Slice 0b — Verification checklist

Manual verification for the Slice 0b i18n baseline. Run through this on
a clean machine (or a fresh `git clone` in a new directory) before
declaring Slice 0b shipped. Every box must tick green; record any
exceptions in the **Retrospective** section below.

Parent: [`PLAN.md`](../../PLAN.md) — Slice 0b.
Slice plan: [`slice-0b-i18n-baseline.md`](../slices/slice-0b-i18n-baseline.md).

## Prerequisites

- [ ] Node 22 installed (`node -v` prints `v22.x`)
- [ ] pnpm 9.15 installed (`pnpm -v` prints `9.15.x`)
- [ ] A real browser (not Playwright) for the cookie round-trip step —
      Chrome, Firefox, or Safari all work

## Clean install

- [ ] `rm -rf node_modules packages/*/node_modules apps/*/node_modules tests/*/node_modules pnpm-lock.yaml`
- [ ] `pnpm install` — completes cleanly; the `postinstall` script
      builds `@cad/config` and `node_modules/@cad/i18n` is a symlink to
      `packages/i18n`
- [ ] `pnpm --filter @cad/i18n build` — emits `packages/i18n/dist/` with
      `.js` + `.d.ts` files for every source module

## Unit + integration tests

- [ ] `pnpm --filter @cad/i18n test` — exits zero, reports
      **5 files, 57 tests passing**
- [ ] `pnpm --filter @cad/i18n test:coverage` — reports
      **100 % statements / branches / functions / lines** on every
      source file

Expected file layout in the coverage report:

| File           | Statements | Branches | Functions |
| -------------- | ---------- | -------- | --------- |
| `detector.ts`  | 100        | 100      | 100       |
| `instance.ts`  | 100        | 100      | 100       |
| `locales.ts`   | 100        | 100      | 100       |
| `react.tsx`    | 100        | 100      | 100       |
| `resources.ts` | 100        | 100      | 100       |

## apps/web consumer

- [ ] `pnpm --filter @cad/web test` — exits zero, reports at minimum
      `App.test.tsx` (2), `use-kernel-worker.test.tsx` (5), and
      `LanguageSwitcher.test.tsx` (6). 13 tests total.
- [ ] `pnpm --filter @cad/web typecheck` — `tsc --noEmit` green
- [ ] `pnpm --filter @cad/web build` — emits `apps/web/dist/` without
      warnings other than the existing bundle-size note documented in
      `known-issues.md`

## i18n:check gate

- [ ] `pnpm i18n:check` — exits zero on the committed source
- [ ] **Proof-of-gate**: temporarily edit
      `apps/web/src/viewport/Viewport.tsx` and replace
      `t('kernel.booting')` with `t('not.in.catalog')`. Run
      `pnpm i18n:check` — it MUST exit non-zero with
      `Some translations was updated and failOnUpdate option is enabled. Exiting...`.
      Revert the edit.

## Browser round-trip (live preview)

- [ ] `pnpm --filter @cad/web preview --host 127.0.0.1 --port 4173`
- [ ] Open `http://127.0.0.1:4173` — the overlay reads **"Booting
      kernel…"** while WASM boots, then the mesh summary
      (`N tri · hash …`) appears
- [ ] Open devtools → Application → Cookies → `http://127.0.0.1:4173`
      — no `cad_locale` cookie set yet (fresh browser)
- [ ] In the devtools console, run:
      `document.cookie = 'cad_locale=de; Path=/'`
- [ ] Reload the tab — the overlay now reads **"Kernel wird geladen…"**
      and then **"N Dreiecke · Hash …"**
- [ ] Confirm the tessellation hash in the overlay is identical in
      English and German — geometry is language-free
- [ ] Confirm the `cad_locale` cookie survives a tab close + reopen
      (value stays `de`)

## Playwright golden journey

- [ ] `pnpm test:e2e` — runs `box-renders.spec.ts` twice (once per
      locale), both pass, total wall time **under 10 seconds** on a
      warm machine. Output lists two tests:

  ```
  ✓  1 [chromium] ... (en)
  ✓  2 [chromium] ... (de)
  2 passed
  ```

- [ ] The Playwright HTML report under `tests/e2e/playwright-report/`
      shows both locale runs green

## CI gate

- [ ] Push to a branch; open a PR
- [ ] Wait for the new `i18n-check` job to run alongside `lint` and
      `typecheck` — it MUST appear in the PR status checks and exit
      zero
- [ ] Expected job order in CI (no new failures from Slice 0):

  ```
  setup → { lint, i18n-check, typecheck, test, audit } → build → { test-e2e, ... }
  ```

## Full quality pass

- [ ] `pnpm lint` — green
- [ ] `pnpm format:check` — green
- [ ] `pnpm typecheck` — 11/11 turbo tasks green
- [ ] `pnpm test` — 13/13 turbo tasks green
- [ ] `pnpm test:coverage` — 11/11 turbo tasks green
- [ ] `pnpm test:api` — green (pre-Slice-1 harness only)
- [ ] `pnpm test:e2e` — 2 locale runs green
- [ ] `pnpm audit:deps` — exits zero; the two documented `eslint`
      exceptions surface as info

## Exit criteria → gate into Slice 1

Slice 1 (Project & Document Lifecycle) may begin only after:

- [ ] Every box above is ticked green
- [ ] `known-issues.md` has no new P0 or P1 entries introduced by Slice 0b
- [ ] CI has been green on `main` for at least one PR cycle after the
      merge
- [ ] `security-analysis.md`'s Slice 0b entry reviewed by a second pair
      of eyes (self-review OK for a solo maintainer, but re-read the
      threat model + mitigations before shipping)

## Retrospective

### What landed clean

- _(fill in after the slice lands)_

### What needed follow-up

- _(fill in after the slice lands)_

### Discovered issues

- _(link to the relevant `known-issues.md` entries)_
