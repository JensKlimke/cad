# Test Strategy

Comprehensive test strategy for the current implementation. The goal is high confidence with low PR latency: push coverage down to unit, component, package-integration, and API-integration layers, while keeping browser e2e narrow and customer-focused.

## Current feature surface

The current implementation exposes these customer-facing areas:

- Auth and locale-aware login
- Project lifecycle: list, create, rename, delete
- Document lifecycle: create, load, edit source, save, build, artifact access
- Document workspace UX: viewport rendering, streamed build status, diagnostics, undo/redo, dirty-state protection
- Handbook access inside the authenticated app
- On-prem stack boot, readiness, and persistence across restart

## Test pyramid

The repo should stay intentionally asymmetric:

- Wide at unit, component, package-integration, and API-integration levels
- Narrow at Docker Compose and browser e2e levels
- Customer features appear in browser e2e at least once, but browser e2e is never the primary confidence layer

### Unit tests

Own pure logic and isolated helpers.

- `packages/protocol/test`: Zod schemas, pagination params, shared envelopes
- `packages/expr/test`: parser, dependency resolution, units, cycles, errors
- `packages/sdk/test`: document helpers and feature constructors
- `packages/authoring/test`: codemod invariants, parse/print stability, source selections
- `packages/runtime/test`: error normalization and source validation branches that do not need HTTP
- `packages/handbook/test`: search, fallback, lookup by op
- `packages/i18n/test`: locale set, detector, resource invariants
- `apps/server/test`: auth helpers, env validation, OIDC stubs, error helpers
- `apps/web/test`: pure viewport-state and wheel-intent helpers

Rules:

- Any behavior with no DOM, HTTP, DB, worker, or container dependency belongs here first.
- Prefer deterministic assertions over snapshots unless the hash or serialized output is itself the public contract.

### Component and route tests

Own almost all user-visible browser behavior.

- Dialogs and forms: login, new project, rename project, confirm delete
- Route behavior: app shell, project list/detail, document workspace, handbook route
- Editor interactions: source updates, diagnostics, focus/retry, undo/redo
- Workspace state: dirty banners, navigation blocking, streamed build transitions
- Localization UX: language switcher, translated client-side errors
- Viewport host behavior: successful render, failure fallback, preserved last-good state

Rules:

- If a behavior can be proven with React Testing Library and mocked data/stream hooks, keep it here.
- Do not promote validation or UI-state permutations to Playwright unless real-browser wiring is the risk being tested.

### Package and process integration tests

Own real subsystem integration inside one process.

- `packages/kernel/test`: real OCCT boot, deterministic tessellation hashes
- `packages/runtime/test`: real document execution, fixture corpus, diagnostics
- `packages/sketch/test`: solver behavior and parameter/expression integration
- `packages/db/test`: migrations, repository isolation, cascade behavior
- `tests/containers/test`: Docker/Testcontainers smoke for local infra boot

Rules:

- Use real package boundaries and real dependencies.
- Avoid HTTP and browser boot when the contract can be proven in-process.

### API integration tests

This is the primary system-level regression net.

- `tests/api/test/auth.int.test.ts`: login/logout/session and auth failure surfaces
- `tests/api/test/projects.int.test.ts`: project CRUD, pagination, malformed IDs, auth boundaries
- `tests/api/test/documents.int.test.ts`: document CRUD and cross-resource guards
- `tests/api/test/build.int.test.ts`: document build success/failure, artifact storage, build events
- `tests/api/test/handbook.int.test.ts`: handbook search/get/list/by-op
- `tests/api/test/lifecycle.int.test.ts`: end-to-end login → create → upload/download → delete lifecycle

Rules:

- Prefer API integration over browser e2e for backend-backed workflows that do not require real browser semantics.
- Every endpoint should have happy-path, auth-denied, validation-error, and unknown-resource coverage where applicable.
- Cross-resource invariants belong here even if a matching UI flow exists.

### Compose and packaged-stack tests

Keep these few and deployment-oriented.

- `tests/compose/test/compose.int.test.ts`: full stack boot, `/health`, `/ready`, web reachability, persisted project/document state across restart

Rules:

- Do not use Compose tests for broad feature coverage.
- Use them only to prove packaged wiring, service readiness, and restart persistence.

### Browser e2e tests

Keep the suite small, overlapping, and explicitly budgeted.

Targets:

- Chromium only in normal CI
- `<= 7` specs total
- `<= 3 minutes` CI wall time
- One retry on CI; flaky tests are fixed or removed, not allowed to accumulate

The current browser suite should cover these customer journeys:

1. Localized login and authenticated entry
   - Verify locale-aware login rendering and successful sign-in.
2. Project lifecycle
   - Create a project, open it, rename it, delete it.
3. Document happy path
   - Create a document, route into the workspace, and render the viewport.
4. Document edit and rebuild
   - Edit source, trigger build, and observe updated build status and viewport hash.
5. Document failure diagnostics
   - Build invalid source and verify structured diagnostics render in the workspace.
6. Handbook access from the authenticated shell
   - Open a handbook page from an authenticated app session and verify the content loads.

Rules:

- Every shipped feature area appears in at least one browser journey.
- Browser e2e does not duplicate API validation matrices, pagination edges, or token/cookie semantics already proven below.
- Locale coverage stays narrow: one localized entry journey is enough unless a browser-only localization bug appears.

## Feature-to-layer ownership

Each customer-facing area has a primary owner and a browser confirmation:

| Feature area | Primary confidence layer | Browser e2e requirement |
| --- | --- | --- |
| Auth and session | Unit + API integration | Login included in at least one journey |
| Localization | Unit + component | Localized login or locale switch included once |
| Projects | Component + API integration | Create/rename/delete covered once |
| Documents and build pipeline | Runtime/package + API integration + route tests | Create/edit/build/failure covered once |
| Workspace UX | Route/component tests | One happy-path render and one failure-path proof |
| Handbook | Package + API + route tests | One authenticated handbook journey |
| On-prem packaging | Compose integration | None beyond normal app boot inside e2e |

## CI policy

Fast suites run by default; expensive suites run only where they add distinct confidence.

### Required on every PR

- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`
- `pnpm test:api`
- `pnpm test:e2e`

### Required on infra-sensitive changes or nightly

- `pnpm test:compose`
- `INTEGRATION=1 pnpm --filter @cad/tests-containers test`
- `INTEGRATION=1 pnpm --filter @cad/db test`

Recommended trigger paths for the heavier suites:

- `deploy/**`
- `apps/server/**`
- `apps/web/**`
- `packages/db/**`
- `packages/runtime/**`
- `packages/kernel/**`
- `tests/compose/**`
- `tests/containers/**`
- `tests/e2e/**`

## Acceptance criteria

The strategy is being followed when all of these stay true:

- Every shipped customer feature area is represented in browser e2e at least once.
- No feature relies only on browser e2e for confidence.
- API integration remains the primary full-system regression layer.
- Compose testing stays deployment-focused and tiny.
- Browser e2e stays under the stated budget and remains stable enough to run on every PR.

## Maintenance rules

When adding or changing a feature:

- Add or update unit tests for new pure logic.
- Add or update route/component tests for new UI states and interactions.
- Add or update API integration tests for new or changed server contracts.
- Add or update package integration tests when a real subsystem boundary is introduced.
- Add or update browser e2e only if the change affects a shipped customer journey or introduces a new browser-only risk.
- Update this document when a new customer-facing feature area is added or when the CI budget changes.
