# Slice 1 — Verification checklist

Manual verification for the Slice 1 on-prem baseline. Run this on a clean
machine before declaring Slice 1 complete.

## Prerequisites

- [ ] Node 22 installed (`node -v`)
- [ ] pnpm 9.15 installed (`pnpm -v`)
- [ ] Docker running (`docker info` exits zero)

## Clean boot

- [ ] `pnpm install`
- [ ] `pnpm build`
- [ ] `cp deploy/compose/.env.example deploy/compose/.env`
- [ ] `docker compose --env-file deploy/compose/.env -f deploy/compose/docker-compose.yml up --build -d`
- [ ] `curl -fsS http://localhost:8080/health`
- [ ] `curl -fsS http://localhost:8080/ready`
- [ ] Open `http://localhost:15173/login` and confirm the login form renders

## Lifecycle

- [ ] Log in with `ADMIN_EMAIL` / `ADMIN_INITIAL_PASSWORD` from `deploy/compose/.env`
- [ ] Create a project from the projects page
- [ ] Open the project and create a document
- [ ] Confirm the app routes to `/projects/:id/documents/:docId`
- [ ] Confirm the rotating viewport renders and the root element carries a non-empty `data-tessellation-hash`

## Persistence

- [ ] `docker compose --env-file deploy/compose/.env -f deploy/compose/docker-compose.yml down`
- [ ] `docker compose --env-file deploy/compose/.env -f deploy/compose/docker-compose.yml up -d`
- [ ] Log back in and confirm the previously created project still exists
- [ ] Open the same document and confirm the viewport still loads

## Automated checks

- [ ] `pnpm typecheck`
- [ ] `pnpm lint`
- [ ] `pnpm i18n:check`
- [ ] `pnpm test:coverage`
- [ ] `pnpm test:api`
- [ ] `pnpm test:compose`
- [ ] `pnpm test:e2e`

## CI smoke

- [ ] GitHub Actions `ci` workflow is green for `lint`, `i18n-check`, `typecheck`, `test`, `test-api`, `build`, `test-compose`, and `test-e2e`

## Retrospective

### What landed clean

- _(fill in)_

### What needs follow-up

- _(fill in)_

### Discovered issues (file in `known-issues.md`)

- _(fill in)_
