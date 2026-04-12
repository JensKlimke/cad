# Slice 12 — Server API Surface

> Skeleton plan. Upgraded to Slice-0 depth when execution begins.
> Parent: [`PLAN.md`](../../PLAN.md) — Slice 12.

## Goal

Expose the system as a proper, OpenAPI-documented, Zod-typed REST API so any integration — CI scripts, external automation, enterprise middleware — can drive CAD workflows headlessly. Auth is hardened from the Slice 1 baseline. Authoring ops become first-class REST operations that run the same codemods the UI and MCP use. Everything in `@cad/protocol` becomes the single source of truth.

## Definition of Done

- OpenAPI spec generated from the Zod schemas in `@cad/protocol`
- Contract tests ensure the generated spec matches what the server actually accepts/returns
- Auth hardened: JWT rotation on sensitive ops, rate limiting, lockout on brute force, OIDC adapter wired (not just a stub) with one verified IdP
- Full lifecycle covered by endpoints: projects, documents, versions, parameters, builds, exports, authoring ops
- `curl` can: create a project, upload a document, apply an authoring op, build, download STEP — documented in a runbook
- Rate limiting + request tracing active on every route
- Playwright: no new journey (this slice is headless)

## Out of Scope

- CLI that wraps the API → Slice 13
- MCP server wrapping the API → Slice 14
- Multi-tenant or API-key management (enterprise add-on) — deferred
- GraphQL surface (explicit non-goal)
- Webhooks / server-sent events beyond what Slice 3's WebSocket channel already carries

## Dependencies

Slices 0–11 — authoring codemods (Slice 2), printer routes (Slice 10c), command registry (Slice 11) all feed into the REST surface here.

## Work Items (high-level)

- **W1** OpenAPI generation pipeline: Zod → OpenAPI 3.1 via `@asteasolutions/zod-to-openapi` (or similar); spec committed and served at `/api/openapi.json`
- **W2** Contract test suite: round-trip every endpoint through its schema; drift between request/response types and the spec fails CI
- **W3** Auth hardening: rotate JWT on password change and on privilege escalation; `@fastify/rate-limit` per-IP + per-user; argon2 timing-safe compare; login lockout after N failures
- **W4** OIDC adapter wired via `openid-client`: config accepts a discovery URL, client id, client secret; one integration test against a locally-hosted Keycloak Testcontainer
- **W5** Endpoint coverage: projects, documents, versions, parameters, builds, exports, authoring ops, printers — organized by resource, consistent conventions
- **W6** Authoring ops route (`POST /documents/:id/authoring`): accepts a list of `AuthoringOp` values; validates; applies through `@cad/authoring`; returns new source + new AST
- **W7** Build + export routes already exist from earlier slices; this slice formalizes them under the generated spec
- **W8** Request tracing: pino logger emits a trace id; trace id surfaces in every error response; Slice 15 sends it to OTel
- **W9** API runbook in the handbook: copy-pasteable curl examples for every critical workflow
- **W10** `docs/verification/slice-12.md` manual checklist including a full `curl` walkthrough

## Key Decisions

| Concern           | Choice                               | Reason                                                      |
| ----------------- | ------------------------------------ | ----------------------------------------------------------- |
| OpenAPI generator | `@asteasolutions/zod-to-openapi`     | Mature, active, supports 3.1, integrates with Fastify       |
| Rate limiter      | `@fastify/rate-limit`                | First-party plugin, Redis-optional for multi-instance later |
| OIDC              | `openid-client`                      | Reference library; supports every flow we need              |
| Tracing ID        | Pino serializer + header propagation | Slice 15 attaches OTel; Slice 12 just carries the id        |
| API style         | REST + JSON                          | No drivers for anything else in v1                          |

## Testing Strategy

- **Unit**: auth helpers, rate limiter config, OpenAPI generator post-processing
- **Integration**: Testcontainers Keycloak for OIDC flow
- **API e2e**: every endpoint happy + 400 + 401 + 403 + 404 + rate-limit + idempotency paths
- **Contract**: auto-generated tests iterating over the OpenAPI spec
- **Component**: none (headless slice)

## Risks

| Risk                                          | Likelihood | Impact | Mitigation                                                         |
| --------------------------------------------- | ---------- | ------ | ------------------------------------------------------------------ |
| Generated spec drifting from actual behaviour | High       | High   | Contract test suite runs on every PR; mismatches fail CI           |
| OIDC integration brittleness across IdPs      | High       | Med    | Keycloak Testcontainer is the reference; document tested providers |
| Rate limit false positives hurting real users | Med        | Med    | Per-user + per-IP; generous defaults; admin-tunable                |
| Authoring op security (escaping the worker)   | Low        | High   | Reuses Slice 2's sandbox; same tests apply                         |

## Exit Criteria → Gate into Slice 13

- DoD met, CI green on `main`
- `curl` runbook executable by a new user in under 10 minutes
- Contract test suite green
- `known-issues.md` has no new P0/P1 entries
- Retrospective note added
