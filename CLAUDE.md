# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

An AI-ready, web-based, parametric CAD system. The design goal is to surpass FreeCAD 1.0 with a code-first parametric model, industrial B-rep kernel, and headless-controllable surfaces (UI, CLI, REST, MCP).

**`PLAN.md` is the authoritative roadmap.** It defines the architecture, package layout, delivery slices (0–15), testing pyramid, and golden demos. Read it before making structural decisions — do not improvise around it.

## Current state (important)

The repo is at **Slice 1 shipped**. Slices 0, 0b, and 1 are implemented; the next planned implementation slice is **Slice 2**. The current monorepo, compose stack, and test surface are green locally.

### What exists

```
packages/
  config/      — shared tsconfig, eslint, vitest presets
  db/          — Drizzle ORM schema, client, repositories, migrations (Postgres)
  i18n/        — i18next runtime, en/de catalogs, server + browser init
  kernel/      — replicad geometry kernel (browser worker + deterministic tessellation hash)
  protocol/    — Zod 4 schemas: auth, projects, documents, common (UlidSchema, ErrorEnvelope, PageParams)

apps/
  cli/         — placeholder (Slice 0 stub)
  server/      — Fastify 5 REST API: auth (argon2+JWT-in-cookie), projects CRUD, documents CRUD,
                  presigned artifact URLs (MinIO/S3), i18n error envelopes, Drizzle+Postgres
  web/         — React Router v7 + TanStack Query v5, auth flow (LoginForm, RequireAuth),
                  project list/detail, document host route, typed apiFetch client, Vite build

tests/
  api/         — Testcontainers-backed API e2e suite (24 int tests: lifecycle, auth, projects, documents)
  compose/     — Docker Compose integration test for stack boot + persistence cycle
  containers/  — Testcontainers helpers (startPostgres, startMinio)
  e2e/         — Playwright lifecycle journey (login → create project → open document) per locale
  mutation/    — Stryker scaffold (not yet active)

deploy/
  compose/     — full Slice 1 stack: postgres + minio + minio-init + migrator + server + web
```

### Slice 1 wave status

| Wave | Content | Status |
|------|---------|--------|
| A | Foundation — protocol schemas, db schema, Docker Compose infra | shipped (`9f6c94e`) |
| B1 | DB migrations + repositories + integration tests | shipped (`d981f23`) |
| B2 | Server bootstrap + plugins + auth service | shipped (`d027b2a`) |
| C | Server API surface — auth/projects/documents routes | shipped (`a19aad0`) |
| D | Web UI — React Router + auth flow + project list | shipped (`f9ec95a`) |
| E1 | API e2e suite + seedOnFirstBoot wiring + error handler fixes | shipped (`e101fde`) |
| E2 | Playwright lifecycle, Dockerfiles, compose integration test | shipped |
| F | Verification doc, retro, CI extensions | shipped |

Slice 1 is closed enough to treat as the working baseline. New implementation work should start from Slice 2 unless the task is explicitly a Slice 1 fixup.

### Key patterns established

- **`buildApp({ env, logger })` factory** — returns a ready-but-not-listening Fastify instance. Tests pass `{ logger: false }`. The factory calls `seedOnFirstBoot(app.db, env)` to create the default workspace + admin user on first boot (idempotent).
- **Module augmentation** — Fastify decorators (`db`, `storage`, `config`, `requireAuth`, `oidc`, `request.user`, `request.t`, `request.locale`) are declared via `declare module 'fastify'` in each plugin file. These augmentations do NOT propagate through `@cad/server` subpath exports. External consumers (like tests/api) use a separate `createDbClient` for introspection.
- **`@cad/server` subpath exports** — `./app` (buildApp), `./config/env` (parseEnv), `./services/seeder` (seedOnFirstBoot). Consumer packages import via these subpaths, never via dist/ paths.
- **`INTEGRATION=1` gating** — `*.int.test.ts` files are excluded by default. Set `INTEGRATION=1` to include them. Vitest config uses `passWithNoTests: true` for suites that are entirely integration-tier.
- **Error handler** — `statusCodeFor(error)` honours Fastify's own statusCode on non-ApiError (Zod validation → 400, not 500). `toErrorEnvelope` produces `validation.failed` / `request.rejected` / `internal` envelopes with i18nKey.
- **Artifact presigned URLs** — `POST /documents/:id/artifacts:sign` mints PUT URLs; `GET /documents/:id/artifacts:sign?key=…` mints GET URLs. Key is passed via querystring because find-my-way cannot parse `:param:literal` suffix patterns.
- **Cookie-based JWT** — `cad_session` cookie, HTTP-only, SameSite=Strict, Secure only in production. `cad_locale` cookie for i18n. Server revocation table in `sessions` table, checked on every `requireAuth`.
- **Testcontainers harness** — `tests/api/src/createApiTestContext.ts` boots Postgres + MinIO, installs citext+pgcrypto extensions, runs migrations, builds app, queries seeded workspace+admin. ~4s per context. Each spec file owns its own context; teardown is reverse-order with try/catch.
- **Compose-backed system verification** — `tests/compose` boots the full Docker Compose stack on isolated host ports, verifies `/health` + `/ready`, creates a project/document, restarts the stack, and confirms persistence.
- **Playwright lifecycle harness** — `tests/e2e` boots the compose stack in global setup, runs the login → create project → open document flow in `en` and `de`, and asserts the viewport tessellation hash on the document route.

## Hard architectural constraints

These override any default instinct. They are the result of explicit decisions recorded in PLAN.md; do not relitigate them without the user's agreement.

1. **Geometry kernel = `replicad`** (wrapping `opencascade.js`). Industrial B-rep, same OCCT as FreeCAD. Runs in Node and browser Web Worker. `replicad`'s **finder** system is the primary reference-resolution mechanism — do not introduce brittle index-based edge/face references.

2. **Strict dual-write UI ↔ code.** The document IS an executable TypeScript module. Both Monaco and the UI feature tree read and write the **same canonical source**. Every UI action must be an AST codemod through `packages/authoring`; every Monaco edit re-parses and patches the UI. Never bypass the AST — not in tests, not in quick fixes, not for "just this one thing." If you find yourself wanting to, stop and re-read PLAN.md § "Authoring Model — Strict Dual-Write".

3. **Stable Handles, not indices.** Every addressable entity (face, edge, vertex, feature, parameter) is referenced via a `Handle` whose `Selector` chain is `finder → construction → hash`. This is the toponaming solution. Formalized from day one, not bolted on later.

4. **Expressions from day one.** Parameters are typed expressions with units and a dependency graph (`packages/expr`). Never ship a "plain values now, expressions later" compromise — the SDK public API would have to change.

5. **Single source of truth for commands.** Every action — SDK op, REST endpoint, CLI subcommand, MCP tool, authoring codemod — is defined **once** as a Zod-validated schema in `packages/protocol` and reused across every surface. No drift.

6. **Self-hosted on-prem only for v1.** No multi-tenant SaaS, no tenant isolation, no cloud-only dependencies. Docker Compose is the baseline deployment. BambuLab integration is **LAN-only** (MQTT + FTP, server-side persistent connection) — no BambuLab Cloud API in v1.

7. **Handbook is a feature, not documentation.** Every user-visible SDK op must ship a handbook page in the same PR (`packages/handbook`). There is a CI gate (`lint:handbook`) enforcing this from Slice 4b onward. The handbook has a programmatic API (`search`, `get`, `forSdkOp`) queryable by the UI, CLI, **and the MCP server** — so AI agents can self-educate before issuing authoring ops. See `feedback_handbook_is_a_feature.md` in auto memory.

## Testing pyramid (first-class)

Deliberately asymmetric — **wide at unit + integration + API e2e, narrow at Playwright**:

- **Unit (Vitest)** — pure functions, ≥90% lines / ≥85% branches on `expr`, `authoring`, `references`, `geometry`, `sketch`, `sdk`, `protocol`.
- **Integration (Vitest)** — real kernel WASM, real authoring round-trips (~50 fixtures: `print(parse(src)) === src`), real PlaneGCS, real handbook index.
- **API e2e (Vitest + Supertest + Testcontainers)** — this is where most system-level coverage lives. Every REST endpoint, every MCP tool, every CLI command. Reference-model library with STEP round-trip + tessellation snapshots.
- **UI e2e (Playwright)** — **strictly ≤10 tests, ≤3 min CI wall time**. Golden journeys only. Everything else goes into component tests (React Testing Library). Flake policy: retry once, auto-quarantine on two consecutive flakes, quarantined tests block — never silently linger.
- **Mutation testing (Stryker)** — weekly on `expr`, `authoring`, `references`.

**Per-slice Definition of Done**: unit + integration + API e2e for new code; Playwright **only** if a new golden journey is introduced; handbook pages for new SDK ops; reference-model library updated if kernel output changes; manual checklist in `docs/verification/slice-N.md`.

## Known issues workflow

`known-issues.md` is the canonical log for issues discovered during development that are **unrelated to the current task**. The file has a documented format (priority P0–P3, Observed / Where / Affects / Symptom / Root cause / Workaround). When you hit something orthogonal to what you're working on, **log it there** — do not silently ignore and do not derail the current task to fix it. Remove the entry when fixed.

## Common commands

```bash
# Install / link
pnpm install

# Full pipeline (what CI runs)
pnpm typecheck
pnpm test
pnpm lint               # eslint + lint:handbook
pnpm format:check       # prettier
pnpm i18n:check         # i18next-cli extract --dry-run --ci
pnpm audit:deps         # vulns + unused + licences

# Integration tier (requires Docker)
INTEGRATION=1 pnpm --filter @cad/db test              # repositories against real Postgres
INTEGRATION=1 pnpm --filter @cad/tests-api test        # API e2e (24 specs, ~6s)
pnpm test:compose                                     # full compose stack + persistence cycle

# Per-package
pnpm --filter @cad/server build         # tsc → dist/
pnpm --filter @cad/server dev           # tsx watch
pnpm --filter @cad/web dev              # Vite dev server
pnpm --filter @cad/web build            # Vite production build

# Docker Compose (full Slice 1 stack)
cp deploy/compose/.env.example deploy/compose/.env
docker compose --env-file deploy/compose/.env -f deploy/compose/docker-compose.yml up --build -d
docker compose -f deploy/compose/docker-compose.yml down

# Migrations (after Postgres is running)
DATABASE_URL=postgresql://cad:cad@localhost:5432/cad pnpm --filter @cad/db migrate
```

## Golden demos (acceptance evidence)

- **Slice 6** ships `examples/spacer.ts` — a parametric mounting spacer (sketch → pad). Printable as-is.
- **Slice 8** upgrades it into `examples/raspberry-pi-mount.ts` — a parametric Raspberry Pi 4 mounting plate on the standard 58×49 mm hole pattern. Exercises every Slice 8 feature and the expression engine.
- **Slice 10c** upgrades the Slice 8 acceptance evidence from "manual print" to "one-click LAN direct print to a BambuLab printer".

These are the user-facing proof points; do not quietly swap them for simpler ones.

## Conventions that override defaults

- **Units**: mm / deg defaults. Imperial is deferred; parameters already carry a unit tag so it's a later config, not a migration.
- **Package manager**: pnpm. Do not introduce `npm install` or `yarn` into new scripts.
- **TypeScript**: strict mode, no `any` in application code, `unknown` + narrow for external input.
- **No `console.log`** in committed code — use a real logger (pino on the server; a thin wrapper on the client).
- **Don't create new `.md` files for planning, status, or decisions** unless the user asks — PLAN.md and known-issues.md are the only source-of-truth files we maintain.
