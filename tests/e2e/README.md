# @cad/tests-e2e

Playwright golden journeys for the CAD web editor. Slice 1 ships the
compose-backed login → create project → open document → viewport lifecycle.
Later slices add more (sketch → pad workflow, reference survival, printable
demo, etc.). The budget stays tight
— **≤10 tests total, ≤3 min CI wall time** — because Playwright is slow
and flaky and we want UI coverage to come primarily from component tests

- API e2e.

## Running

```bash
# Install browsers once per machine (also runs automatically in CI):
pnpm exec playwright install chromium

# Run the suite (boots the compose stack automatically):
pnpm --filter @cad/tests-e2e test

# Run headed (watch the browser):
pnpm --filter @cad/tests-e2e test:headed

# Debug with Playwright Inspector:
pnpm --filter @cad/tests-e2e test:debug

# View the HTML report after a run:
pnpm --filter @cad/tests-e2e test:report
```

From the repo root, `pnpm test:e2e` delegates to `pnpm --filter @cad/tests-e2e test`.

## Golden journey: `lifecycle`

Proves the full Slice 1 stack works end-to-end:
login with the seeded admin account, create a project, open it, create a
document, route to `/projects/:id/documents/:docId`, and assert the viewport's
`data-tessellation-hash` matches the committed kernel snapshot.
