# Slice 1 — Project & Document Lifecycle (on-prem baseline)

> Detailed implementation plan for the second vertical slice of the CAD system.
> Parent roadmap: [`PLAN.md`](../../PLAN.md) — Slice 1.
> Previous slice: [`slice-0-foundations.md`](./slice-0-foundations.md).

## Goal

Stand up the **self-hosted on-prem baseline** and prove a project can be
round-tripped through the full stack: create it in the browser, close the
tab, `docker compose down`, `docker compose up` the next morning, log back
in, open the same project, and land on the Slice 0 rotating box. No CAD
content yet — Slice 1 proves the plumbing and makes the server load-bearing
for every later slice.

This slice introduces the **persistence layer** (Postgres), the
**object store** (MinIO), the **server process** (Fastify), the
**auth layer** (local users + JWT + OIDC adapter stub), the first real
**API contract** (`@cad/protocol`), and **real routing + authenticated
data fetching** in `apps/web`. It is the single largest architectural
delta between Slice 0 and the end of the roadmap, and every subsequent
slice builds on the primitives landed here.

## Definition of Done

A fresh clone on a clean machine with Docker running, Node 22, and pnpm
installed can execute:

```bash
pnpm install
pnpm -r build
cp deploy/compose/.env.example deploy/compose/.env
docker compose -f deploy/compose/docker-compose.yml up --build -d
# wait for /health to return 200
curl -fsS http://localhost:8080/health
# log in as the seeded admin and create a project:
open http://localhost:5173
```

…and every command exits zero. The browser shows a login form, the
seeded admin credentials from `.env` work, creating a project persists
through a `docker compose down && docker compose up` cycle, and opening
the project still lands on the Slice 0 rotating box (now reached via a
routed `/projects/:id` URL instead of a hard-coded root).

Concretely, Slice 1 is done when **all** of the following hold:

1. Docker Compose stack boots cleanly on macOS + Linux with no manual
   intervention past copying `.env.example` to `.env`
2. Postgres schema migrates forward to the Slice 1 baseline via a
   dedicated migrator container that runs **before** the server starts
3. MinIO bucket exists on first boot; the server can generate pre-signed
   PUT and GET URLs against it
4. Seeded admin account exists on first-run and is not re-seeded on
   subsequent boots
5. Local-user login works (username + password → JWT in HTTP-only
   cookie); logout clears the cookie; `/auth/me` round-trips
6. REST endpoints exist and pass every tier of tests (unit, integration,
   API e2e) for **every** CRUD operation on projects and documents,
   including happy path, 400 (validation), 401 (unauthenticated),
   403 (wrong user), 404 (missing), and idempotency edges
7. Document **TypeScript source** persists in Postgres as `text`;
   document **blob artifacts** (tessellation cache, thumbnails) persist
   in MinIO and are fetched via short-TTL pre-signed URLs, never direct
   bucket URLs
8. `apps/web` has real routing (React Router v7), a login page, a
   project list, a create/rename/delete dialog, and routes to the
   Slice 0 viewport for any opened document
9. TanStack Query wires every data fetch in `apps/web`; the API client
   is fully typed from `@cad/protocol` with zero hand-maintained types
10. Extended Playwright golden journey `lifecycle.spec.ts` runs the
    full login → create project → open document → box renders chain
    end-to-end against the docker compose stack (or a local dev stack
    on CI runners)
11. All Slice 0 CI jobs remain green; the new `test-api`, `test-db`,
    and `test-compose` jobs are added to `.github/workflows/ci.yml`
    and run on every PR
12. `docs/verification/slice-1.md` manual checklist runs green, including
    the explicit `down/up` persistence cycle
13. **i18n contract** (established in [Slice 0b](./slice-0b-i18n-baseline.md)):
    every user-visible string added in `apps/web` routes through the
    `useT(namespace)` hook from `@cad/i18n`; every error envelope emitted
    by `apps/server` carries an optional `i18nKey` that the web client
    re-translates in the active locale. `pnpm i18n:check` is green on
    CI — any new translation key without a catalog entry blocks the
    merge. The `lifecycle.spec.ts` Playwright journey runs once per
    supported locale (`en` + `de`) and asserts the localized overlay
    labels appear in both

## Out of Scope (deferred to later slices)

- **SDK, expression engine, authoring layer, runtime** — [Slice 2](./slice-2-sdk-authoring-runtime.md)
- **Viewport content beyond the Slice 0 box** — [Slice 3](./slice-3-viewport-navigation.md)
- **Feature tree UI, parameter inspector, Monaco, dual-write** — [Slice 4](./slice-4-dual-write.md)
- **Handbook content** — [Slice 4b](./slice-4b-handbook-infrastructure.md)
- **Sketching, features, exports, printing** — Slices 5+
- **Multi-tenant workspaces** — single workspace for v1; the `workspace`
  table exists but only ever has one row, and every route takes the
  workspace implicitly from the logged-in user
- **OIDC end-to-end** — the adapter module compiles, is covered by a
  unit test, and is wired behind a config flag, but the integration
  against a real IdP lands in Slice 12 when we harden the API surface
- **Realtime multi-user / websocket broadcast of project changes** —
  optimistic locking at the API level is enough for Slice 1
- **Rate limiting per-user / per-IP beyond Fastify defaults** — Slice 12
- **File uploads beyond the document JSON payload** — no STEP/STL import
  yet, those come with the importers in Slice 9/10
- **OpenTelemetry, Prometheus scraping, Helm chart** — [Slice 15](./slice-15-onprem-packaging-observability.md)

## Repository Layout After Slice 1

Only **new** and **materially extended** files are shown; everything
landed in Slice 0 stays put. The new top-level `deploy/` directory, three
new workspace packages, and the new `apps/server` are the bulk of the
slice.

```
cad/
  .github/
    workflows/
      ci.yml                                 # EXTENDED: test-db, test-api, test-compose jobs

  deploy/                                    # NEW — on-prem deployment artifacts
    compose/
      docker-compose.yml                     # postgres + minio + migrator + server + web
      .env.example                           # documented variables, no real secrets
      postgres-init/
        01-extensions.sql                    # CREATE EXTENSION citext, pgcrypto, …
      minio-init/
        01-make-bucket.sh                    # mc alias + mc mb cad-artifacts
      server.Dockerfile                      # multi-stage: deps → build → runtime
      web.Dockerfile                         # nginx serving apps/web dist
      migrator.Dockerfile                    # tsx + drizzle-kit runner
      nginx.conf                             # served by the web container

  packages/
    protocol/                                # NEW — single source of truth for API shapes
      src/
        index.ts                             # barrel
        common.ts                            # PageParams, ErrorEnvelope, Timestamp, UlidSchema
        auth.ts                              # LoginRequest/Response, MeResponse, LogoutResponse
        projects.ts                          # Project, CreateProjectRequest, UpdateProjectRequest, …
        documents.ts                         # Document, CreateDocumentRequest, UpdateDocumentRequest, …
      package.json                           # @cad/protocol — no runtime deps beyond zod
      tsconfig.json

    db/                                      # NEW — Drizzle schema + migrations + repos
      src/
        index.ts                             # barrel: schema, createClient, repositories
        client.ts                            # createDbClient(env) → Drizzle pool
        ids.ts                               # ulid() + Ulid branded type
        schema/
          index.ts                           # re-exports every table
          workspaces.ts                      # id (ulid), name, created_at
          users.ts                           # id, workspace_id, email (citext), password_hash, role, created_at
          projects.ts                        # id, workspace_id, name, created_by, created_at, updated_at
          documents.ts                       # id, project_id, name, ts_source, head_version_id, created_by, created_at, updated_at
          document_versions.ts               # id, document_id, ts_source_at_version, message, created_by, created_at
          sessions.ts                        # id, user_id, expires_at — optional server-side revocation store
        repositories/
          projects.ts                        # ProjectRepo: list/get/create/update/delete with workspace scoping
          documents.ts                       # DocumentRepo
          users.ts                           # UserRepo — email lookup + password verification entry point
          sessions.ts                        # SessionRepo — revocation list
      drizzle/                               # drizzle-kit output, committed
        meta/                                # journal + per-migration meta
        0000_init_slice1.sql                 # single hand-reviewed SQL file for v1
      drizzle.config.ts                      # points at schema/ and drizzle/
      test/
        schema.int.test.ts                   # inserts into every table via Testcontainers pg
        repositories.int.test.ts             # repo happy + edge cases
      package.json                           # @cad/db — depends on drizzle-orm, pg
      tsconfig.json
      vitest.config.ts

  apps/
    server/                                  # NEW — Fastify on-prem API
      src/
        index.ts                             # bootstrap: load env → build app → listen
        app.ts                               # build(): returns a configured FastifyInstance (testable)
        config/
          env.ts                             # Zod-parsed process.env → typed Env object
        plugins/
          db.ts                              # registers @cad/db client on fastify instance
          storage.ts                         # registers S3 client for MinIO
          auth.ts                            # JWT + cookie + requireAuth decorator
          observability.ts                   # pino logger, request id, http metrics
          security.ts                        # helmet + cors + rate-limit + sensible
          openapi.ts                         # generate OpenAPI 3.1 from Zod schemas
        services/
          auth.ts                            # argon2 hash/verify, JWT issue/verify, seed admin
          oidc.ts                            # openid-client adapter stub — compiles, behind flag
          storage.ts                         # presigned PUT/GET, bucket bootstrap
          seeder.ts                          # first-boot workspace + admin creation
        routes/
          health.ts                          # GET /health, GET /ready
          auth/
            login.ts                         # POST /auth/login
            logout.ts                        # POST /auth/logout
            me.ts                            # GET /auth/me
          projects/
            list.ts                          # GET /projects
            create.ts                        # POST /projects
            get.ts                           # GET /projects/:id
            update.ts                        # PATCH /projects/:id
            delete.ts                        # DELETE /projects/:id
          documents/
            list.ts                          # GET /projects/:projectId/documents
            create.ts                        # POST /projects/:projectId/documents
            get.ts                           # GET /documents/:id
            update.ts                        # PATCH /documents/:id
            delete.ts                        # DELETE /documents/:id
            artifact-put-url.ts              # POST /documents/:id/artifacts:sign — presigned PUT
            artifact-get-url.ts              # GET /documents/:id/artifacts/:key:sign — presigned GET
        errors.ts                            # canonical ApiError class + ErrorEnvelope mapping
      test/
        auth.int.test.ts                     # login/logout/me happy + failure paths
        projects.int.test.ts                 # every project route
        documents.int.test.ts                # every document route
        storage.int.test.ts                  # presigned URL round-trip against MinIO
      Dockerfile                             # referenced by deploy/compose/server.Dockerfile
      package.json                           # @cad/server
      tsconfig.json
      vitest.config.ts

    web/                                     # EXTENDED
      src/
        main.tsx                             # EXTENDED: wraps in QueryClientProvider + RouterProvider
        App.tsx                              # EXTENDED: routing shell instead of direct <Viewport />
        routes/                              # NEW
          root.tsx                           # layout + auth guard
          login.tsx                          # login form → /auth/login → /projects redirect
          projects/
            index.tsx                        # list + new-project dialog
            new.tsx                          # (modal overlay)
            [id].tsx                         # project detail
            [id]/documents/
              [docId].tsx                    # viewport host for an opened document
        api/                                 # NEW — typed TanStack Query client
          client.ts                          # fetch wrapper with credentials + error envelope
          auth.ts                            # useLogin, useLogout, useMe
          projects.ts                        # useProjects, useCreateProject, useUpdateProject, useDeleteProject
          documents.ts                       # useDocuments, useCreateDocument, …
        auth/                                # NEW
          AuthContext.tsx                    # `me` from useMe() + login/logout helpers
          RequireAuth.tsx                    # route guard component
        components/                          # NEW — design-neutral Slice 1 widgets
          LoginForm.tsx
          ProjectList.tsx
          ProjectCard.tsx
          NewProjectDialog.tsx
          RenameProjectDialog.tsx
          ConfirmDeleteDialog.tsx
        viewport/                            # unchanged from Slice 0
        lib/                                 # unchanged from Slice 0
      test/
        AuthContext.test.tsx                 # NEW
        ProjectList.test.tsx                 # NEW
        LoginForm.test.tsx                   # NEW
      package.json                           # EXTENDED: adds @tanstack/react-query, react-router

  tests/
    api/                                     # EXTENDED — new suites for Slice 1 routes
      test/
        harness.test.ts                      # Slice 0 /health test, unchanged
        lifecycle.int.test.ts                # NEW — create project → create doc → read → update → delete
        auth.int.test.ts                     # NEW — login/logout/me + auth boundary cases
    e2e/
      src/
        box-renders.spec.ts                  # EXTENDED: renamed to lifecycle.spec.ts (log in → create → open → box)
    compose/                                 # NEW — docker compose integration test
      compose.int.test.ts                    # boots the compose stack, asserts /health + /ready + a round-trip
      package.json                           # @cad/tests-compose

  docs/
    slices/
      slice-1-project-lifecycle.md           # THIS FILE
    verification/
      slice-1.md                             # NEW — manual checklist including down/up cycle
```

## Work Items (ordered, each independently verifiable)

### W1. Docker Compose stack + Dockerfiles

**Files**

- `deploy/compose/docker-compose.yml` — services: `postgres` (postgres:16-alpine,
  healthcheck `pg_isready`, volume `cad-pg-data`), `minio` (quay.io/minio/minio,
  healthcheck against `/minio/health/ready`, volume `cad-minio-data`),
  `minio-init` (one-shot container using `mc` to create the `cad-artifacts`
  bucket idempotently), `migrator` (runs drizzle-kit + migrations on boot,
  exits 0 on success, depends_on postgres with `condition: service_healthy`),
  `server` (apps/server, depends_on migrator: `condition: service_completed_successfully`,
  healthcheck `/health`), `web` (nginx serving apps/web dist, depends_on server).
- `deploy/compose/.env.example` — documented list of every variable:
  `POSTGRES_PASSWORD`, `JWT_SECRET` (min 32 random bytes — example is
  clearly fake), `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`, `ADMIN_EMAIL`,
  `ADMIN_INITIAL_PASSWORD`, `PUBLIC_BASE_URL`, `SERVER_LOG_LEVEL`.
- `deploy/compose/server.Dockerfile` — multi-stage: `deps` (pnpm fetch),
  `build` (`pnpm -r build`), `runtime` (distroless node:22, copies only
  `apps/server/dist` + pruned `node_modules`, exposes 8080, runs
  `node apps/server/dist/index.js`).
- `deploy/compose/web.Dockerfile` — builds `apps/web`, copies `dist/`
  into an `nginx:alpine` image with a minimal config that proxies
  `/api/*` to the server and serves the SPA for every other route.
- `deploy/compose/migrator.Dockerfile` — tsx + drizzle-kit, entrypoint
  `tsx packages/db/scripts/migrate.ts`, exits 0 on success.
- `deploy/compose/nginx.conf` — SPA fallback + `/api` reverse proxy.
- `deploy/compose/postgres-init/01-extensions.sql` — creates `citext`
  and `pgcrypto` extensions (used for case-insensitive emails and
  `gen_random_uuid()` fallback if we ever need it).

**Dependencies**: none beyond docker + compose on the host.

**Acceptance**: `docker compose -f deploy/compose/docker-compose.yml up -d`
on a clean machine starts all five services healthy within 60 s; the
migrator exits 0 before the server starts; `curl http://localhost:8080/health`
returns 200 and `{ "ok": true, ... }`.

### W2. `@cad/protocol` — Zod schemas, error envelope, shared types

**Dependencies**: `zod` (already installed).

**Files**

- `packages/protocol/package.json` — `@cad/protocol`, `private`, `type: module`,
  exports map for `./common`, `./auth`, `./projects`, `./documents`, `./package.json`.
- `packages/protocol/src/common.ts` —

  ```ts
  export const UlidSchema = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/u);
  export type Ulid = z.infer<typeof UlidSchema>;

  export const TimestampSchema = z.string().datetime({ offset: true });
  export type Timestamp = z.infer<typeof TimestampSchema>;

  export const PageParamsSchema = z.object({
    limit: z.coerce.number().int().min(1).max(100).default(50),
    cursor: UlidSchema.optional(),
  });
  export type PageParams = z.infer<typeof PageParamsSchema>;

  export const ErrorEnvelopeSchema = z.object({
    error: z.object({
      code: z.string(), // e.g. 'unauthorized', 'validation.failed'
      message: z.string(), // English fallback — safe for logs + non-web clients
      // Optional i18n key the web client re-translates in the active locale.
      // Established by Slice 0b's @cad/i18n contract (see slice-0b-i18n-baseline.md).
      // Server sets it for every user-facing error; unset for generic / infra errors.
      i18nKey: z.string().optional(), // e.g. 'errors:auth.invalid_credentials'
      details: z.record(z.unknown()).optional(),
    }),
    requestId: z.string().optional(),
  });
  export type ErrorEnvelope = z.infer<typeof ErrorEnvelopeSchema>;
  ```

- `packages/protocol/src/auth.ts` — `LoginRequestSchema`, `LoginResponseSchema`,
  `MeResponseSchema`, `LogoutResponseSchema`; uses `EmailSchema = z.string().email()`.
- `packages/protocol/src/projects.ts` — `ProjectSchema`,
  `CreateProjectRequestSchema` (name 1..120, trimmed), `UpdateProjectRequestSchema`
  (partial), `ListProjectsResponseSchema` (items + next cursor).
- `packages/protocol/src/documents.ts` — `DocumentSchema` (includes
  `tsSource: z.string()`, `headVersionId: UlidSchema | null`),
  `CreateDocumentRequestSchema`, `UpdateDocumentRequestSchema`,
  `ArtifactPutUrlResponseSchema` (url + headers + expiresAt).
- `packages/protocol/src/index.ts` — re-exports every schema + inferred type.

**Acceptance**: `pnpm --filter @cad/protocol typecheck` is clean;
`apps/server` and `apps/web` both import types from `@cad/protocol` without
any duplicated schema definitions.

### W3. `@cad/db` — Drizzle schema + client factory + ULID helper

**Dependencies**: `drizzle-orm@^0.45.2`, `pg@^8.20.0`, `@types/pg@^8.20.0`.

**Files**

- `packages/db/src/ids.ts` — `ulid()` thin wrapper around the `ulid`
  package with a `Ulid` branded string type; exposes `isUlid(value)` type guard.
- `packages/db/src/client.ts` — `createDbClient(env: DbEnv)` builds a
  `pg.Pool` with TLS off (Postgres lives on the same Docker network),
  pool size configurable via env, returns a Drizzle instance bound to
  the schema. Exposes `close(pool)` for teardown.
- `packages/db/src/schema/workspaces.ts` —
  ```ts
  export const workspaces = pgTable('workspaces', {
    id: text('id').primaryKey(), // ULID
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  });
  ```
- `packages/db/src/schema/users.ts` — `id`, `workspaceId` (FK), `email`
  (citext, unique per workspace), `passwordHash` (argon2id), `role`
  (`'admin' | 'member'`), `createdAt`.
- `packages/db/src/schema/projects.ts` — `id`, `workspaceId`, `name`,
  `createdBy` (FK users), `createdAt`, `updatedAt`. Indexes: `(workspace_id, created_at desc)`.
- `packages/db/src/schema/documents.ts` — `id`, `projectId`, `name`,
  `tsSource` (text), `headVersionId` (FK document_versions, nullable
  for new docs), `createdBy`, `createdAt`, `updatedAt`.
- `packages/db/src/schema/document_versions.ts` — `id`, `documentId`,
  `tsSourceAtVersion` (text), `message` (text, optional), `createdBy`,
  `createdAt`. Indexes: `(document_id, created_at desc)`.
- `packages/db/src/schema/sessions.ts` — `id`, `userId`, `expiresAt`,
  `createdAt`. Used as an optional server-side revocation table: a
  logged-out session's id is inserted with a short TTL and the auth
  middleware rejects any JWT whose `jti` is in the table.
- `packages/db/src/schema/index.ts` — re-exports every table; this is
  the canonical module drizzle-kit points at.

**Acceptance**: `pnpm --filter @cad/db typecheck` is clean; every
schema file compiles; `drizzle-kit generate` against the schema emits
expected SQL.

### W4. `@cad/db` — Migrations + migrator script + Testcontainers integration

**Dependencies**: `drizzle-kit@^0.31.10`, `@cad/tests-containers` (workspace).

**Files**

- `packages/db/drizzle.config.ts` — points `schema: './src/schema/index.ts'`,
  `out: './drizzle'`, `dialect: 'postgresql'`, `dbCredentials` pulled
  from `DATABASE_URL`.
- `packages/db/scripts/migrate.ts` — tsx-runnable migrator: reads
  `DATABASE_URL` from the environment, opens a pg pool, calls
  Drizzle's `migrate()` against the bundled migrations, logs each
  applied step, exits 0 on success. This script is the entrypoint of
  the migrator container in W1.
- `packages/db/drizzle/0000_init_slice1.sql` — the first migration,
  emitted by `drizzle-kit generate` and **hand-reviewed before commit**:
  creates `workspaces`, `users`, `projects`, `documents`,
  `document_versions`, `sessions`; installs foreign keys; creates
  indexes. No `IF NOT EXISTS` — migrations are strict.
- `packages/db/drizzle/meta/_journal.json` — drizzle-kit journal,
  committed verbatim so downstream `migrate()` can replay.
- `packages/db/test/schema.int.test.ts` — boots a Postgres via
  `@cad/tests-containers`, runs the migration script against it,
  asserts every table exists and accepts valid inserts.

**Acceptance**: `INTEGRATION=1 pnpm --filter @cad/db test` boots a
postgres container, runs the migrator, verifies the schema is in place,
and exits 0.

### W5. `@cad/db` — Repositories + integration tests

**Files**

- `packages/db/src/repositories/projects.ts` —
  ```ts
  export interface ProjectRepo {
    list(opts: { workspaceId: Ulid; limit: number; cursor?: Ulid }): Promise<{ items: Project[]; nextCursor?: Ulid }>;
    get(opts: { workspaceId: Ulid; id: Ulid }): Promise<Project | null>;
    create(input: { workspaceId: Ulid; name: string; createdBy: Ulid }): Promise<Project>;
    update(opts: { workspaceId: Ulid; id: Ulid; name?: string }): Promise<Project | null>;
    delete(opts: { workspaceId: Ulid; id: Ulid }): Promise<boolean>;
  }
  export function createProjectRepo(db: DbClient): ProjectRepo { ... }
  ```
  Every query scopes on `workspace_id` so tenant isolation is enforced
  at the repo layer (not just at the route layer). Cursor pagination
  uses `(created_at, id)` ordering to avoid duplicate rows when
  timestamps tie.
- `packages/db/src/repositories/documents.ts` — parallel shape.
  `update()` supports `tsSource` updates and bumps `updatedAt`.
- `packages/db/src/repositories/users.ts` — `findByEmail`, `create`,
  `updatePasswordHash`. Every lookup is scoped by `workspaceId`.
- `packages/db/src/repositories/sessions.ts` — `revoke(jti, userId, expiresAt)`,
  `isRevoked(jti)`.
- `packages/db/test/repositories.int.test.ts` — 20+ cases covering every
  method, happy + edge (empty list, cursor exhaustion, not-found,
  cross-workspace isolation).

**Acceptance**: `INTEGRATION=1 pnpm --filter @cad/db test` passes every
repo test; coverage ≥90 lines / ≥85 branches on repository files.

### W6. `apps/server` — Fastify bootstrap + plugin architecture + env config

**Dependencies**: `fastify@^5.8.4`, `fastify-type-provider-zod@^6.1.0`
(already installed), `@fastify/cookie@^11.0.2`, `@fastify/helmet@^13.0.2`,
`@fastify/cors@^11.2.0`, `@fastify/rate-limit@^10.3.0`,
`@fastify/sensible@^6.0.4`, `pino@^10.3.1`, `pino-pretty@^13.1.3`
(dev only), `zod@^4.3.6`, `@cad/i18n` (workspace, landed in Slice 0b).

**Files**

- `apps/server/src/index.ts` — top-level entry: loads env, builds app
  via `buildApp(env)`, starts listening on `env.PORT`. Handles
  `SIGTERM` / `SIGINT` with a graceful shutdown (close Fastify → close
  db pool → close S3 client).
- `apps/server/src/app.ts` — `buildApp(env): Promise<FastifyInstance>`.
  Registers every plugin in dependency order: security → observability
  → **i18n** → db → storage → auth → openapi → routes. Returns the instance
  unbound (not listening) — tests call `buildApp()` directly and hand
  the raw `server` to Supertest.
- `apps/server/src/plugins/i18n.ts` — NEW: consumes
  `createServerI18n()` from `@cad/i18n` (landed in Slice 0b) and
  installs a Fastify `onRequest` hook that resolves the active locale
  per request (cookie `cad_locale` first → `Accept-Language` header
  fallback → `en`) and attaches `request.t: TFunction` +
  `request.locale: Locale` for every downstream handler. Every error
  envelope emitted through `errors.ts` uses `request.t` to populate the
  `message` field while also setting the `i18nKey` so the client can
  re-translate.
- `apps/server/src/config/env.ts` — single Zod schema that parses
  `process.env`. Required keys: `DATABASE_URL`, `JWT_SECRET`
  (min 32 chars), `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`,
  `MINIO_BUCKET`, `ADMIN_EMAIL`, `ADMIN_INITIAL_PASSWORD`,
  `PUBLIC_BASE_URL`. Optional: `PORT` (default 8080), `LOG_LEVEL`
  (default `info`), `CORS_ORIGINS` (comma-separated). The schema
  **throws on missing required keys at boot**; the error message lists
  every missing/malformed variable so startup failures are obvious.
- `apps/server/src/plugins/security.ts` — registers helmet, cors (strict
  origin list from env), rate-limit (100 req/min per IP).
- `apps/server/src/plugins/observability.ts` — wires pino with request
  id correlation, structured logs, redaction list (cookies, auth
  headers, passwords); exposes `app.log` through Fastify.
- `apps/server/src/plugins/openapi.ts` — generates OpenAPI 3.1 from the
  Zod schemas via `fastify-type-provider-zod`'s transformer, serves it
  at `/openapi.json` and swagger-ui at `/docs` (dev only, gated on env).

**Acceptance**: `pnpm --filter @cad/server dev` starts the server on
8080; hitting `GET /health` returns 200; missing env vars cause
startup to fail with a readable error listing every missing key.

### W7. `apps/server` — Auth service (argon2 + JWT + seeder + OIDC adapter stub)

**Dependencies**: `argon2@^0.44.0`, `@fastify/jwt@^10.0.0`,
`openid-client@^6.8.2`.

**Files**

- `apps/server/src/services/auth.ts` — pure functions:
  `hashPassword(plain)` → argon2id with tuned params (m=65536,
  t=3, p=4), `verifyPassword(plain, hash)` → boolean,
  `issueAccessToken({ userId, workspaceId, role })` → signed JWT with
  `jti` (ULID), `exp` 1 h, `verifyAccessToken(token)` →
  `{ payload, valid }`.
- `apps/server/src/services/seeder.ts` — `seedOnFirstBoot(db, env)`:
  inside a transaction, `SELECT count(*) FROM workspaces`; if 0, creates
  the default workspace and inserts the admin user with the password
  from `env.ADMIN_INITIAL_PASSWORD` (argon2 hashed). Logs
  `seeder: created workspace X and admin Y` or
  `seeder: workspace already exists, skipping`. Called once at startup
  from `buildApp`.
- `apps/server/src/services/oidc.ts` — `createOidcAdapter(env)` builds
  an `openid-client` Client from a discovery URL; exposes
  `beginLogin(state)`, `completeLogin(code)` → `{ email, externalId }`.
  **Gated behind `env.OIDC_ENABLED === 'true'`** — when the flag is off
  the adapter factory returns a no-op. Unit test verifies the adapter
  compiles, is exercised with a fake IdP from the openid-client test
  doubles, and fails closed when the flag is off.
- `apps/server/src/plugins/auth.ts` — Fastify plugin that decorates the
  instance with `requireAuth(request)` (throws 401 if no valid JWT in
  the `cad_session` cookie), `requireAdmin(request)` (requires
  `role === 'admin'`). Reads cookies via `@fastify/cookie`.

**Acceptance**: `pnpm --filter @cad/server test` runs unit tests for
`hashPassword`, `verifyPassword`, `issueAccessToken`, `verifyAccessToken`,
`seedOnFirstBoot` (against a Testcontainers Postgres) — all green.

### W8. `apps/server` — `/auth` routes (login, logout, me)

**Files**

- `apps/server/src/routes/auth/login.ts` — `POST /auth/login`. Body:
  `LoginRequestSchema` from `@cad/protocol`. Looks up user by email
  within the default workspace, verifies password, issues JWT, sets
  `cad_session` HTTP-only cookie with `Secure` (except `NODE_ENV=development`),
  `SameSite=Strict`, `Path=/`, `Max-Age=3600`. Returns
  `LoginResponseSchema`.
- `apps/server/src/routes/auth/logout.ts` — `POST /auth/logout`. Reads
  the JWT's `jti`, inserts into `sessions` with
  `expiresAt = jwt.exp`, clears the cookie, returns
  `LogoutResponseSchema`.
- `apps/server/src/routes/auth/me.ts` — `GET /auth/me`. `requireAuth`
  decorator; returns `MeResponseSchema` with `userId`, `email`, `role`,
  `workspaceId`.

**Acceptance**: `pnpm --filter @cad/server test test/auth.int.test.ts`
exercises login happy path, bad credentials (401), missing cookie (401),
logout clears cookie + marks session revoked, `/auth/me` returns the
seeded admin.

### W9. `apps/server` — `/projects` CRUD routes

**Files**

- `apps/server/src/routes/projects/list.ts` — `GET /projects`.
  `requireAuth`. Query params: `limit`, `cursor` (from `PageParamsSchema`).
  Delegates to `ProjectRepo.list({ workspaceId: user.workspaceId, ... })`.
  Returns `ListProjectsResponseSchema`.
- `apps/server/src/routes/projects/create.ts` — `POST /projects`.
  Body: `CreateProjectRequestSchema`. Inserts via `ProjectRepo.create`,
  returns the new project. 201 on success.
- `apps/server/src/routes/projects/get.ts` — `GET /projects/:id`.
  Validates `:id` against `UlidSchema`, 404 on missing, 200 with
  `ProjectSchema` on success.
- `apps/server/src/routes/projects/update.ts` — `PATCH /projects/:id`.
  Body: `UpdateProjectRequestSchema`. Returns the updated project or 404.
- `apps/server/src/routes/projects/delete.ts` — `DELETE /projects/:id`.
  Returns 204 on success, 404 on missing. Cascades to the project's
  documents at the database level via `ON DELETE CASCADE`.

**Acceptance**: `pnpm --filter @cad/server test test/projects.int.test.ts`
covers every method, every status code (200/201/204/400/401/404),
every workspace-isolation case (one user cannot see another workspace's
projects), cursor pagination correctness across 3 pages.

### W10. `apps/server` — `/documents` routes + storage service (MinIO/S3 pre-signed URLs)

**Dependencies**: `@aws-sdk/client-s3@^3.1029.0`,
`@aws-sdk/s3-request-presigner@^3.1029.0`.

**Files**

- `apps/server/src/services/storage.ts` — `createStorageService(env)`
  builds an S3 client pointed at MinIO (`forcePathStyle: true`,
  `endpoint: env.MINIO_ENDPOINT`, credentials from env). Exposes
  `ensureBucket(name)` (idempotent), `presignPut(key, contentType)` →
  `{ url, expiresAt }` (5 min TTL), `presignGet(key)` →
  `{ url, expiresAt }` (5 min TTL).
- `apps/server/src/plugins/storage.ts` — decorates Fastify with the
  storage service; `app.storage.presignPut(...)`. At boot, calls
  `ensureBucket(env.MINIO_BUCKET)` so the first `docker compose up`
  on a fresh volume auto-creates the bucket.
- `apps/server/src/routes/documents/list.ts` through `delete.ts` —
  parallel to the project routes. Every route scopes on
  `projectId` and verifies the project belongs to the user's workspace
  (404 otherwise, never 403, to avoid leaking existence).
- `apps/server/src/routes/documents/artifact-put-url.ts` —
  `POST /documents/:id/artifacts:sign`. Body: `{ filename, contentType }`.
  Composes a key `docs/<documentId>/<ulid>-<filename>`, calls
  `app.storage.presignPut(key, contentType)`, returns
  `ArtifactPutUrlResponseSchema`. The generated ULID avoids collisions
  across uploads of identically-named files.
- `apps/server/src/routes/documents/artifact-get-url.ts` —
  `GET /documents/:id/artifacts/:key:sign`. Validates the key belongs
  to the requesting document (prefix match), returns
  `{ url, expiresAt }`.

**Acceptance**: `pnpm --filter @cad/server test test/storage.int.test.ts`
spins up Postgres + MinIO via `@cad/tests-containers`, exercises a full
presigned-PUT-then-presigned-GET cycle with a real blob, and asserts
byte equality of upload vs download.

### W11. `apps/web` — React Router v7 + TanStack Query + typed API client

**Dependencies**: `react-router@^7.14.0` (data router mode),
`@tanstack/react-query@^5.99.0`,
`@tanstack/react-query-devtools@^5.99.0` (dev only), `@cad/protocol`.

**Files**

- `apps/web/src/api/client.ts` — `apiFetch<Schema>(path, { method, body, schema })`:
  wraps `fetch` with `credentials: 'include'` (cookies), JSON body
  handling, and response validation via the schema from `@cad/protocol`.
  Maps non-2xx responses into thrown `ApiClientError` instances carrying
  the parsed `ErrorEnvelope`.
- `apps/web/src/api/auth.ts` — `useLogin()`, `useLogout()`, `useMe()`
  hooks returning fully-typed data from `@cad/protocol` schemas.
  `useLogin` is a mutation that, on success, invalidates the `me`
  query key.
- `apps/web/src/api/projects.ts` — `useProjects()`, `useProject(id)`,
  `useCreateProject()`, `useUpdateProject()`, `useDeleteProject()`.
  Every mutation invalidates the `['projects']` query key on success.
- `apps/web/src/api/documents.ts` — same shape.
- `apps/web/src/main.tsx` — extended to wrap the tree in
  `<I18nProvider>` (from `@cad/i18n`, already installed in Slice 0b)
  **outside** `<QueryClientProvider>` (configured with 30 s
  staleTime, 5 min gcTime, `refetchOnWindowFocus: false`) and
  `<RouterProvider>` with the data router. The `apiFetch` helper
  reads `document.cookie`'s `cad_locale` and attaches it as the
  `Accept-Language` header so the server-rendered error envelopes
  come back pre-translated (belt-and-braces with the client-side
  `i18nKey` re-translation).
- `apps/web/src/App.tsx` — replaces the direct `<Viewport />` with the
  routing shell; every page is mounted under the root route.

**Acceptance**: `pnpm --filter @cad/web typecheck` is clean, no
`any` anywhere in the `api/` layer; `pnpm --filter @cad/web test`
covers at least one happy + one error path for each hook via a mocked
`fetch`.

### W12. `apps/web` — Auth flow (login page, AuthContext, route guards)

**Files**

- `apps/web/src/auth/AuthContext.tsx` — reads `useMe()`, exposes
  `{ me, isLoading, login, logout }`. `login(email, password)` calls
  the mutation and navigates to `/projects` on success. `logout()`
  invalidates every query key and navigates to `/login`.
- `apps/web/src/auth/RequireAuth.tsx` — React Router component guard:
  if `me` is loading, renders a spinner; if unauthenticated, redirects
  to `/login?next=<current>`; otherwise renders children.
- `apps/web/src/components/LoginForm.tsx` — single-form page with email
  - password fields, submit button, inline validation messages,
    wired to `AuthContext.login`. **Every string routes through
    `useT('auth')`** — labels, placeholders, submit button, validation
    errors — populating a new `auth` namespace in
    `packages/i18n/locales/<lang>/auth.json`. When the server returns
    an `ErrorEnvelope` with `i18nKey`, the form re-translates it in the
    active locale via `t(envelope.error.i18nKey)` and falls back to
    `envelope.error.message` if the key is missing from the client
    catalog.
- `apps/web/src/routes/login.tsx` — renders `<LoginForm />`. Reads
  `?next=` query param and passes it to the context so login success
  redirects back. If already authenticated, redirects to `/projects`
  without showing the form.
- `apps/web/src/routes/root.tsx` — layout route: provides
  `<AuthContext>`, renders `<Outlet />`, applies global CSS.

**Acceptance**: `pnpm --filter @cad/web test test/LoginForm.test.tsx`
renders the form in happy-dom, submits, asserts the login mutation is
called with the right payload; `AuthContext.test.tsx` verifies the
context reacts to successful login + logout.

### W13. `apps/web` — Project list + dialogs + document route

**Files**

- `apps/web/src/routes/projects/index.tsx` — `useProjects()`, renders
  `<ProjectList />`. Empty state with a big `New Project` button.
  Cursor-based pagination (load more button). Each card links to
  `/projects/:id`.
- `apps/web/src/routes/projects/[id].tsx` — `useProject(id)`. Shows
  project name, `<Rename>` + `<Delete>` buttons, a list of the
  project's documents, and a `New Document` button.
- `apps/web/src/routes/projects/[id]/documents/[docId].tsx` — Opens
  `<Viewport box={DEFAULT_BOX} />` (unchanged from Slice 0). The
  "still lands on the Slice 0 box" acceptance criterion is met here —
  this route is the first time the existing viewport is reached via a
  real URL and authenticated data path.
- `apps/web/src/components/ProjectList.tsx` — pure presentational list
  of project cards. Accepts `{ projects, onOpenProject }` as props.
- `apps/web/src/components/ProjectCard.tsx` — name, created date,
  "Open" action.
- `apps/web/src/components/NewProjectDialog.tsx` — modal with a name
  field; on submit, calls `useCreateProject()`, closes on success,
  toasts on failure.
- `apps/web/src/components/RenameProjectDialog.tsx` — pre-filled name;
  on submit, `useUpdateProject()`.
- `apps/web/src/components/ConfirmDeleteDialog.tsx` — generic
  "Type the name to confirm" dialog so delete isn't one-click.

Every new component in this work item routes its strings through
`useT('projects')` — list headers, card labels, dialog titles, button
labels, empty-state copy, toast messages — populating a new `projects`
namespace at `packages/i18n/locales/<lang>/projects.json`. No inline
English literal ships in `apps/web` source after this work item lands.
`pnpm i18n:check` enforces this at CI time.

**Acceptance**: `pnpm --filter @cad/web test test/ProjectList.test.tsx`
renders with fixture data, asserts the list + empty state + the
new-project button is present; RTL interaction test covers opening
the dialog and submitting.

### W14. API e2e suite (Testcontainers Postgres + MinIO)

**Files**

- `tests/api/test/lifecycle.int.test.ts` — single scenario test:
  - Spin up Postgres + MinIO via `@cad/tests-containers` (re-uses
    Slice 0 helpers — this is their first real consumer).
  - Run the migrator.
  - Build the server via `buildApp(testEnv)` — no docker.
  - Supertest: POST `/auth/login` as the seeded admin → expect 200 +
    cookie.
  - POST `/projects` → expect 201 + project id.
  - GET `/projects/:id` → matches what was created.
  - POST `/projects/:id/documents` → expect 201 + document id.
  - POST `/documents/:id/artifacts:sign` → expect 200 + a valid
    presigned URL.
  - PUT the presigned URL with a small payload → expect 200.
  - GET via a follow-up `artifacts/:key:sign` + the returned URL →
    expect the exact bytes back.
  - DELETE the project → 204; GET `/projects/:id` → 404.
- `tests/api/test/auth.int.test.ts` — negative paths: wrong password,
  missing cookie, revoked session (logout then reuse), expired JWT
  (forge a token with a past `exp`), workspace-isolation
  (seed a second admin in a second workspace, confirm they cannot see
  each other's projects). **Every failure-path assertion also checks
  that `body.error.i18nKey` is present and matches a key in the
  `en/errors.json` catalog** — this is the API-level guarantee that
  Slice 0b's i18n contract is honoured end-to-end. A second sub-test
  sets `cookie: cad_locale=de` on the request and asserts
  `body.error.message` is the German translation (proving the
  Fastify `request.t` + cookie detection round-trip).
- `tests/api/test/projects.int.test.ts` — exhaustive CRUD: every
  method, every status code.
- `tests/api/test/documents.int.test.ts` — same for documents.

Shared harness: extract `createApiTestContext()` that starts the
containers once per file and tears down in `afterAll`.

**Acceptance**: `INTEGRATION=1 pnpm test:api` runs in under 90 s and
passes every suite.

### W15. Extended Playwright golden journey (`lifecycle.spec.ts`)

**Files**

- `tests/e2e/src/lifecycle.spec.ts` — **renames and replaces**
  `box-renders.spec.ts`. The spec uses `test.describe.parallel`
  parameterized on **each supported locale (`en`, `de`)**, so the
  full journey runs once per language; each run sets
  `context.addCookies([{ name: 'cad_locale', value: locale, … }])`
  before navigation and asserts that at least one localized string
  from `packages/i18n/locales/<locale>/{common,auth,projects,viewport}.json`
  is rendered at the expected step. The Slice 1 Playwright test:
  1. Navigate to `http://localhost:4173/` → expect redirect to `/login`.
  2. Fill email + password from `process.env.ADMIN_EMAIL` /
     `ADMIN_INITIAL_PASSWORD` → click submit.
  3. Expect redirect to `/projects`, empty state visible.
  4. Click `New Project`, type a name, submit → expect the card to
     appear.
  5. Click the project → expect the project detail page.
  6. Click `New Document`, type a name, submit → expect to land on
     `/projects/:id/documents/:docId`.
  7. Wait for `[data-tessellation-hash]` to equal the committed
     kernel snapshot (the same `c3a9076d...` from Slice 0).
  8. Refresh the page → the project + document still load, the box
     still renders.
  9. Click `Logout` → expect redirect to `/login`; refresh → still on
     `/login` (cookie cleared, session revoked).
- `tests/e2e/playwright.config.ts` — extended `webServer` block:
  launches `pnpm --filter @cad/server dev` AND
  `pnpm --filter @cad/web preview --strictPort --port 4173`, waits
  for both to be reachable before starting tests.

**Acceptance**: `pnpm test:e2e` passes end-to-end in ≤60 s on a warm
machine, ≤120 s on a cold CI runner.

### W16. Dockerfiles + compose boot integration test

**Dependencies**: none beyond the docker CLI on the host.

**Files**

- `tests/compose/package.json` — `@cad/tests-compose`, private, runs
  with vitest (`node` preset, 300 s test timeout).
- `tests/compose/test/compose.int.test.ts` — single end-to-end test:
  1. `docker compose -f deploy/compose/docker-compose.yml --env-file
deploy/compose/.env.test up -d --build`
  2. Poll `http://localhost:8080/ready` until 200, with a 120 s cap.
  3. `POST /auth/login` with the test admin → expect 200 + cookie.
  4. `POST /projects` → expect 201.
  5. `docker compose down` (keeping volumes).
  6. `docker compose up -d` again.
  7. `POST /auth/login` → same credentials, same cookie behaviour.
  8. `GET /projects` → the project persists.
  9. `docker compose down -v` (remove volumes).
- `deploy/compose/.env.test` — secrets-free fixture env for the
  compose integration test; uses known short passwords and a fixed
  JWT secret so the test is deterministic.

Dockerfiles from W1 (`server.Dockerfile`, `web.Dockerfile`,
`migrator.Dockerfile`) must build cleanly and produce images ≤ 300 MB
server / ≤ 30 MB web / ≤ 150 MB migrator.

**Acceptance**: `pnpm --filter @cad/tests-compose test` exits zero in
CI and locally. Image sizes verified in the CI job log.

### W17. Slice 1 verification checklist

**Files**

- `docs/verification/slice-1.md` — manual checklist mirroring the
  Definition of Done, explicitly including the down/up persistence
  cycle from W16, the seeded admin first-boot behaviour, and
  screenshots of the login page + project list + viewport (inheriting
  Slice 0's rotating-box screenshot requirement).

**Acceptance**: Checklist runs green on one macOS laptop and one Linux
VM; every box ticked.

## Key Technical Decisions (locked for Slice 1)

| Concern                  | Choice                                                                                                 | Reason                                                                                                                                                                                                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ORM + schema**         | **Drizzle ORM + drizzle-kit**                                                                          | SQL-native, no decorators, TS-first, emits plain SQL migrations we can hand-review before commit. No Prisma binary runtime.                                                                                                                                             |
| **Database**             | **Postgres 16 (alpine)**                                                                               | Same major as production targets; `citext` + `pgcrypto` via init scripts.                                                                                                                                                                                               |
| **ID generation**        | **ULID**                                                                                               | Lexicographically sortable (good for `(created_at, id)` cursor pagination), timestamped, 26 chars, URL-safe. Better than UUIDv4 for DB indexes.                                                                                                                         |
| **Password hashing**     | **argon2id** via `argon2` (native binding)                                                             | Modern standard, resistant to GPU and side-channel attacks; tuned m/t/p for ~50 ms hash time on the Docker runtime.                                                                                                                                                     |
| **Session**              | **JWT in HTTP-only cookie** + server-side revocation table                                             | Stateless happy path, revocable on logout / password change / admin action via the `sessions` table keyed on JWT `jti`.                                                                                                                                                 |
| **Blob store**           | **MinIO (S3 API)**                                                                                     | Bundled for on-prem, swappable for AWS S3 / GCS / Azure via the same `@aws-sdk/client-s3` adapter.                                                                                                                                                                      |
| **Artifact URLs**        | **Short-TTL pre-signed URLs** (5 min)                                                                  | Never expose raw bucket URLs; every fetch goes through the server which owns the trust boundary.                                                                                                                                                                        |
| **Server framework**     | **Fastify 5 + `fastify-type-provider-zod`**                                                            | Already the harness target in Slice 0; the zod type provider gives us OpenAPI-by-default from schema.                                                                                                                                                                   |
| **Runtime validation**   | **Zod 4 (via `@cad/protocol`)**                                                                        | Single source of truth for every request/response shape; same schemas validate on server **and** type the web client.                                                                                                                                                   |
| **Web router**           | **React Router v7 (data router mode)**                                                                 | Current stable line with built-in loader/action support; needed for the auth-aware navigation flow.                                                                                                                                                                     |
| **Server-state cache**   | **TanStack Query v5**                                                                                  | De-facto standard for React 19 data fetching; mutation invalidation semantics match our REST shape.                                                                                                                                                                     |
| **Migration runtime**    | **Dedicated migrator container**                                                                       | Schema changes run exactly once per boot, before the server starts. `depends_on: condition: service_completed_successfully` enforces ordering.                                                                                                                          |
| **OIDC**                 | **Stub via `openid-client`, gated behind `OIDC_ENABLED` flag**                                         | Unit-tested compile, wired to Fastify, but never reached in Slice 1 — real IdP integration lives in Slice 12.                                                                                                                                                           |
| **Logger**               | **pino** + `pino-pretty` (dev)                                                                         | Structured JSON in production; request id correlation; redaction list for cookies / auth headers.                                                                                                                                                                       |
| **Config**               | **Zod-parsed `process.env`**                                                                           | Startup fails hard if any required variable is missing; config type is inferred from the schema, no duplicated types.                                                                                                                                                   |
| **Integration test DBs** | **Testcontainers** via the existing `@cad/tests-containers`                                            | First real consumer of the Slice 0 scaffolding.                                                                                                                                                                                                                         |
| **Secrets policy**       | **`.env.example` never contains real values**                                                          | `.env` is gitignored; real secrets live on the deploying machine; every required variable is documented in `.env.example` with a placeholder.                                                                                                                           |
| **i18n**                 | **`@cad/i18n` (react-i18next + i18next), cookie-based locale detection, `i18nKey` on error envelopes** | Slice 0b landed the runtime; Slice 1 is the first slice writing real user strings. Every `apps/web` string flows through `useT(namespace)`; every `apps/server` error envelope carries an `i18nKey` the web re-translates. See [Slice 0b](./slice-0b-i18n-baseline.md). |

**Not yet introduced** (avoid scope creep): assemblies, realtime
collaboration, OpenTelemetry, Prometheus, Helm, background job queue,
websocket broadcast of project changes, file upload for STEP/STL,
multi-tenant auth claims, SSO group mapping, admin UI. All land in the
slices that need them.

## Testing Strategy (specific to Slice 1)

| Layer                | What it exercises at Slice 1                                                                                             | File(s)                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------- |
| Unit (db)            | `ulid()` deterministic length + alphabet, `createDbClient` env parsing, repo method shapes via mocks                     | `packages/db/test/*.test.ts`             |
| Integration (db)     | Real Postgres via Testcontainers; migrator idempotency; every repo against a live schema; workspace isolation            | `packages/db/test/*.int.test.ts`         |
| Unit (server)        | `hashPassword` / `verifyPassword` round-trip, JWT issue/verify, `env.ts` schema (missing keys throw), error envelope map | `apps/server/test/*.test.ts`             |
| Integration (server) | `buildApp(testEnv)` end-to-end, every route against Supertest, seeder first-boot vs. subsequent-boot behaviour           | `apps/server/test/*.int.test.ts`         |
| API e2e              | Full lifecycle journey + auth negatives + workspace isolation + storage round-trip                                       | `tests/api/test/*.int.test.ts`           |
| Component (web)      | `LoginForm`, `ProjectList`, `NewProjectDialog`, `AuthContext` — React Testing Library against mocked fetch               | `apps/web/test/*.test.tsx`               |
| UI e2e               | **Single extended golden journey** — login → create project → open document → box renders → logout                       | `tests/e2e/src/lifecycle.spec.ts`        |
| Compose              | Boot the stack, down/up cycle, persistence, image size caps                                                              | `tests/compose/test/compose.int.test.ts` |

Coverage gates enforced in CI (lib preset unless noted):

- `packages/protocol`: ≥ 85% lines — pure types, mostly tested by
  consumers but has some runtime validation helpers
- `packages/db`: ≥ 90% lines / 85% branches on repositories (excluding
  migrations and scaffolding)
- `apps/server`: ≥ 85% lines / 80% branches (node preset)
- `apps/web`: ≥ 70% lines / 60% branches (browser preset — Playwright
  covers the rest end-to-end)
- `tests/compose`: excluded from coverage (it's an integration harness,
  not library code)

The Slice 0 Playwright budget of **≤10 tests, ≤3 min CI wall time**
still holds. Slice 1 consumes **two** test slots (the lifecycle journey
parameterized on `en` + `de`) and **replaces** the Slice 0 `box-renders`
test rather than adding alongside it — the new journey subsumes the
old assertion. Two slots (one per locale) is still well inside the
10-test budget; the German run catches regressions where a new string
shipped without a catalog entry would render the English fallback in
the German UI.

## CI Pipeline Specification

Extends the Slice 0 matrix with three new jobs and updates one:

```
name: ci
on: [push, pull_request]

jobs:
  setup:       # unchanged
  lint:        needs: [setup]
  typecheck:   needs: [setup]
  i18n-check:  needs: [setup]                         # inherited from Slice 0b — extended to scan new apps/web + apps/server sources
  test:        needs: [setup]                         # adds @cad/db + @cad/protocol + apps/server unit
  test-db:     needs: [setup]                         # NEW — INTEGRATION=1 db integration tests
  test-api:    needs: [setup]                         # EXTENDED — Slice 1 lifecycle suites
  test-compose: needs: [build]                        # NEW — @cad/tests-compose
  audit:       needs: [setup]                         # unchanged
  build:       needs: [typecheck]                     # EXTENDED — builds apps/server + Dockerfiles
  test-e2e:    needs: [build]                         # EXTENDED — lifecycle.spec.ts × (en + de)
```

Target: first-PR green run ≤ **15 minutes** end-to-end on GitHub-hosted
runners (Slice 0 was ≤10 minutes; the +5-minute budget covers image
builds + the compose integration test). If `test-compose` exceeds 5
minutes on warm runners we invest in pre-pulling the postgres + minio
images via a setup step.

GitHub Actions job-level changes:

- `test-db`: sets `INTEGRATION=1`, runs `pnpm --filter @cad/db test`
- `test-api`: sets `INTEGRATION=1`, runs `pnpm test:api`
- `test-compose`: caches docker layers via `docker buildx` with
  GitHub Actions cache; runs `pnpm --filter @cad/tests-compose test`
- `build`: adds `docker buildx build` for server, web, migrator
  Dockerfiles with the built artifacts pushed to the GitHub Container
  Registry on `main` only

## Risks & Mitigations

| Risk                                                               | Likelihood | Impact | Mitigation                                                                                                                                                               |
| ------------------------------------------------------------------ | ---------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Migrator drift between dev machines and CI                         | Med        | High   | Single source via `drizzle-kit generate`; migrations committed as plain SQL and hand-reviewed; migrator container runs before the server on every boot.                  |
| Pre-signed URL leakage (URL ends up in logs / shared Slack / etc.) | Low        | High   | ≤5 min TTL, never persisted, never logged (pino redaction list includes `url`, `presignedUrl`, `authorization`), per-document key prefix prevents cross-doc access.      |
| JWT revocation store (`sessions` table) grows unbounded            | Med        | Med    | Insert with `expiresAt`; nightly `DELETE FROM sessions WHERE expires_at < now()` via a pg_cron entry installed by the init script, capped at 10k rows per sweep.         |
| Auth design over-engineered for Slice 1's single-workspace scope   | Med        | Med    | OIDC stays a stub; one form, one user table, one claim; every workspace query is still implicitly scoped so adding multi-tenant later is additive, not a rewrite.        |
| Postgres volume not persisted across `docker compose down/up`      | Low        | High   | Named volume `cad-pg-data`, explicit verification test in `compose.int.test.ts` that rounds through a full down/up cycle.                                                |
| MinIO bucket not created on first boot                             | Med        | Med    | `minio-init` one-shot container uses `mc` to idempotently create the bucket; server-side `ensureBucket()` is the backup safety net and logs a warning if it fires.       |
| Slice 0 Playwright journey regresses while adapting to new routing | High       | Med    | Replace, don't parallel-run: `lifecycle.spec.ts` subsumes `box-renders.spec.ts` so there's only one golden journey and one contract for the web app's root URL.          |
| Docker-in-Docker tests flake on GitHub runners                     | Med        | Med    | `tests/compose` pins image digests, pre-pulls via setup step, retries once on flake; if flakiness exceeds 2 failures in a week the test is moved to a nightly job.       |
| Large `tsSource` documents bloat Postgres row width                | Low        | Med    | `tsSource` is `text` (not `jsonb`); a soft 256 KB limit enforced in the Zod schema returns 413 before the write; larger documents become an MinIO-backed blob (Slice 2). |
| OIDC adapter stub ships as dead code and rots before Slice 12      | Low        | Low    | Unit-tested against openid-client's fake IdP; if the test breaks on a dependency upgrade, fix it in the same PR as the upgrade, don't delete the stub.                   |

## Verification Runbook (`docs/verification/slice-1.md`)

1. `git clean -fdx` and `pnpm install`
2. `cp deploy/compose/.env.example deploy/compose/.env` (edit any local
   overrides)
3. `pnpm -r build`
4. `docker compose -f deploy/compose/docker-compose.yml up --build -d`
5. `curl -fsS http://localhost:8080/health` → 200
6. `curl -fsS http://localhost:8080/ready` → 200 (indicates migrator
   finished and db/minio are reachable)
7. Open `http://localhost:5173` → land on `/login`
8. Log in with the seeded admin from `.env`; land on `/projects` empty
   state
9. Create a project named "Smoke Test"; confirm card appears
10. Open the project; create a document named "Default"
11. Open the document; confirm the rotating box renders with the
    committed tessellation hash
12. Log out; refresh; confirm you land on `/login`
13. `docker compose -f deploy/compose/docker-compose.yml down`
14. `docker compose -f deploy/compose/docker-compose.yml up -d` (no
    rebuild, no `-v` — volumes intact)
15. Log in again; confirm "Smoke Test" project and its document
    persist; open the document; confirm the box still renders
16. **i18n round-trip**: open the language switcher (or manually set
    `document.cookie = 'cad_locale=de; path=/; max-age=31536000'`
    in devtools), reload. Confirm the login page, project list,
    dialogs, and viewport overlay all render in German. Log out
    and back in; confirm the cookie persists across the logout/login
    boundary (locale is a UI preference, not a session-bound claim).
    Force a 401 (delete the cookie mid-session and hit a protected
    route); confirm the error banner renders the German translation
    and the response body contains an `i18nKey` pointing at
    `errors:auth.*`
17. `docker compose -f deploy/compose/docker-compose.yml down -v` (clean
    teardown)
18. Push to a branch, open a PR, wait for CI green — every new job
    (`test-db`, `test-compose`, `i18n-check`) and every extended one
    (`test-api`, `test-e2e`) must pass
19. Screenshot the login page + project list + viewport, attach to PR
    description

Every step must pass before Slice 1 is called done.

## Exit Criteria → Gate into Slice 2

Slice 2 (SDK, Expression Engine, Authoring Layer, Runtime) may **begin
only after**:

- This plan's Definition of Done is met
- CI has been green on `main` for at least one PR cycle after Slice 1's
  merge commit
- `known-issues.md` has no P0 or P1 entries introduced by this slice
- `docs/verification/slice-1.md` checklist has been run green on
  macOS + Linux
- The Slice 0 retrospective note has been carried forward with the
  Slice 1 retrospective appended at the bottom of this file

## Retrospective (fill in after the slice lands)

### What landed clean

- _(fill in)_

### What needs follow-up

- _(fill in)_

### Discovered issues (file in `known-issues.md`)

- _(fill in; link to the issue entry)_
