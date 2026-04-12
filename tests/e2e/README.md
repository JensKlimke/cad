# @cad/tests-e2e

Playwright golden journeys for the CAD web editor. Slice 0 ships one test;
Slice 6 onward adds more (sketch → pad workflow, reference survival,
Playwright screenshot of the printable demo, etc.). The budget stays tight
— **≤10 tests total, ≤3 min CI wall time** — because Playwright is slow
and flaky and we want UI coverage to come primarily from component tests

- API e2e.

## Running

```bash
# Install browsers once per machine (also runs automatically in CI):
pnpm exec playwright install chromium

# Run the suite (starts the Vite preview server automatically):
pnpm --filter @cad/tests-e2e test

# Run headed (watch the browser):
pnpm --filter @cad/tests-e2e test:headed

# Debug with Playwright Inspector:
pnpm --filter @cad/tests-e2e test:debug

# View the HTML report after a run:
pnpm --filter @cad/tests-e2e test:report
```

From the repo root, `pnpm test:e2e` delegates to `pnpm --filter @cad/tests-e2e test`.

## Golden journey: `box-renders`

Proves the full kernel → worker → three.js → canvas chain produces the
committed tessellation hash from the kernel integration snapshot. Assertion
is on the `data-tessellation-hash` attribute of the viewport root — this
is the hash determinism contract the kernel guarantees, so a visual match
here proves the entire stack is consistent with the Node kernel run.

If the kernel tessellation changes (e.g. a new OCCT version), update both
`packages/kernel/test/__snapshots__/tessellate.int.test.ts.snap` and the
`EXPECTED_HASH_10x20x30` constant in `src/box-renders.spec.ts`.
