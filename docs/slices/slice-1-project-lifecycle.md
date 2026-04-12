# Slice 1 — Project & Document Lifecycle

> Skeleton plan. Upgraded to Slice-0 depth when execution begins.
> Parent: [`PLAN.md`](../../PLAN.md) — Slice 1.

## Goal

Stand up the on-prem baseline and round-trip a project through the full stack: create it, close the browser, `docker compose up` the next day, open the same project. No CAD content yet — this slice proves the plumbing.

## Definition of Done

- `docker compose up` boots Postgres + MinIO + server + web on a clean machine
- Seeded admin account logs in through the web shell
- Creating a project via the UI persists it; refreshing the tab still shows it
- REST API: create, list, get, rename, delete for projects and (empty) documents
- Document blob artifact URLs point at MinIO and fetch cleanly
- All Slice 0 CI jobs remain green; new API e2e tests added for every endpoint
- Down/up cycle of the compose stack preserves data (verified in checklist)

## Out of Scope

- SDK, expression engine, runtime → Slice 2
- Viewport content beyond the Slice 0 box → Slice 3
- Feature tree, parameter UI, dual-write → Slice 4
- Sketching, features, exports, printing → Slices 5+
- Multi-tenant workspaces (single workspace for v1)

## Dependencies

Slice 0 (monorepo, CI, kernel boot, testing pyramid scaffold).

## Work Items (high-level)

- **W1** Docker Compose stack (`deploy/compose/docker-compose.yml`): postgres 16, MinIO, server, web; healthchecks; named volumes
- **W2** Postgres schema: `workspace → project → document → document_version`; single-tenant for now
- **W3** Migration tool (Drizzle + drizzle-kit) and baseline migrations
- **W4** Fastify bootstrap (`apps/server`): plugin architecture, Zod type provider, pino logger, `/health` + `/ready`
- **W5** First `@cad/protocol` command/response schemas for projects and documents
- **W6** Auth v1: local users (argon2id), JWT session cookie, seeded admin on first boot, OIDC adapter stub that compiles but isn't wired to an IdP
- **W7** REST endpoints: projects CRUD, documents CRUD, version stubs
- **W8** Document storage: TS source in Postgres `text`; artifacts in MinIO via short-TTL pre-signed URLs
- **W9** Web shell expansion: login page, project list, create/rename/delete, open-document link (still lands on the Slice 0 box)
- **W10** TanStack Query wiring to the new REST endpoints
- **W11** Dedicated migrator container that runs before the server starts
- **W12** API e2e coverage across every endpoint (happy, 400, 401, 404, idempotency)
- **W13** `docs/verification/slice-1.md` manual checklist (clean boot, login, create, refresh, re-open, down/up cycle)

## Key Decisions

| Concern           | Choice                       | Reason                                                  |
| ----------------- | ---------------------------- | ------------------------------------------------------- |
| ORM + migrations  | Drizzle ORM + drizzle-kit    | Lightweight, SQL-native, no decorators, TS-first        |
| Password hashing  | argon2id                     | Modern standard, no bcrypt legacy                       |
| Session           | JWT in HTTP-only cookie      | Stateless, dev-friendly, refresh on sensitive ops       |
| Blob store        | MinIO (S3 API)               | Bundled for on-prem; swappable for AWS S3 / GCS / Azure |
| Migration runtime | Dedicated migrator container | Separates schema changes from server boot               |

## Testing Strategy

- **Unit**: Zod schemas, auth helpers, repo layer
- **Integration**: Drizzle repo against Testcontainers Postgres (Slice 0 helpers now used for real)
- **API e2e**: every endpoint (happy + 400 + 401 + 404 + idempotency)
- **Component**: login form, project list, create-project dialog
- **Playwright**: extend existing `box-renders` journey to "log in → create project → open doc → box renders" — no new golden journey

## Risks

| Risk                              | Likelihood | Impact | Mitigation                                                        |
| --------------------------------- | ---------- | ------ | ----------------------------------------------------------------- |
| Migrator drift between dev and CI | Med        | High   | Single source via drizzle-kit; migrator always runs before server |
| Pre-signed URL leakage            | Low        | High   | ≤5 min TTL, server-issued, never persisted                        |
| Auth design over-engineered       | Med        | Med    | Keep OIDC as stub; one form, one user table, one claim            |
| Postgres volume not persisted     | Low        | High   | Verification checklist explicitly tests a down/up cycle           |

## Exit Criteria → Gate into Slice 2

- DoD met, CI green on `main` for one PR cycle
- `known-issues.md` has no new P0/P1 entries
- Retrospective note added to the bottom of this file
