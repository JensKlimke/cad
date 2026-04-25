# @cad/tests-e2e

Playwright golden journeys for the CAD web app. The suite is intentionally
small and only covers customer-visible browser workflows that benefit from
real browser execution. Everything else should stay in route/component tests
or API integration tests.

Budget:

- Chromium only in standard CI
- **≤7 specs total**
- **≤3 min CI wall time**
- One retry on CI

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

## Current journeys

The current suite covers these feature areas:

- localized login and authenticated entry
- project lifecycle: create, rename, delete
- document lifecycle: create and open
- document workspace happy path: viewport render
- document workspace edit/build flow
- document workspace failure diagnostics
- handbook access inside the authenticated shell

As the product grows, new Playwright coverage should only be added when a new
customer journey appears or when a risk can only be reproduced in a real
browser. The repo-level strategy lives in [`docs/testing-strategy.md`](../../docs/testing-strategy.md).
