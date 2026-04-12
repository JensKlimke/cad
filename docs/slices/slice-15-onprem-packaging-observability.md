# Slice 15 — On-Prem Packaging & Observability

> Skeleton plan. Upgraded to Slice-0 depth when execution begins.
> Parent: [`PLAN.md`](../../PLAN.md) — Slice 15.

## Goal

Turn the accumulated code into a **production-grade on-prem product**: a hardened Docker Compose stack, an optional Helm chart for larger installations, OpenTelemetry tracing across every service, a Prometheus scrape endpoint, a documented upgrade story with migrations + rollback, and an install/admin/backup runbook a non-Claude human can follow.

## Definition of Done

- `docker compose up` on a clean machine yields a fully-working install in under 10 minutes
- Helm chart deploys cleanly to a test Kubernetes cluster (kind / minikube) and passes the same smoke tests
- OpenTelemetry traces emitted by `@cad/runtime`, `apps/server`, and `PrinterSupervisor` — OTLP exporter, customer-configurable endpoint
- Prometheus `/metrics` endpoint exposes: build time, kernel memory, cache hit rate, error rates, printer job counts
- Structured pino logging across every service with consistent field names
- Upgrade path: migrator container runs before server; failed migrations roll back atomically; documented rollback procedure
- Release images signed with cosign; signature verification documented
- Install guide, admin docs, backup/restore runbook published in the handbook under "Operations"
- Backup/restore tested end-to-end: snapshot Postgres + MinIO, destroy the stack, restore, verify a project survives

## Out of Scope

- SaaS offering (explicit non-goal)
- Multi-tenant isolation
- Automated cloud installers (Terraform, Pulumi) beyond the reference Helm chart
- SLO/SLA commitments (operator responsibility, not shipped)
- Live migration tooling for zero-downtime upgrades beyond the documented rollback

## Dependencies

All prior slices.

## Work Items (high-level)

- **W1** Harden Docker Compose: healthchecks for every service, volume definitions with retention, resource limits, restart policies, `.env.example` documented
- **W2** Backup hooks: sidecar service or scheduled job that dumps Postgres + MinIO to a host path; `cad admin backup` + `cad admin restore` commands
- **W3** Helm chart in `deploy/helm/cad`: values schema, rendering tests, CI deploy-to-kind smoke test
- **W4** OpenTelemetry instrumentation: `@opentelemetry/api` + OTLP exporter; spans around build, export, authoring ops, kernel boot, MQTT connect; customer provides the OTLP endpoint via env
- **W5** Prometheus exporter: `/metrics` endpoint on `apps/server`; metrics schema documented
- **W6** Pino log schema: trace id, user id, operation, duration, outcome — consistent across services
- **W7** Migrator container: dedicated image that runs drizzle migrations idempotently; exits non-zero on failure; server waits on healthcheck
- **W8** Rollback procedure: documented in the runbook; tested against a deliberate breaking migration
- **W9** Release pipeline: build signed images with cosign; publish tagged releases; keep the last N versions
- **W10** Install guide in the handbook: prerequisites, commands, first-boot walkthrough, common failures
- **W11** Admin docs: user management, printer management, audit log queries, log locations, metrics glossary
- **W12** Backup/restore runbook: step-by-step; verification test runs as part of CI nightly
- **W13** `docs/verification/slice-15.md` checklist

## Key Decisions

| Concern          | Choice                                              | Reason                                                                                |
| ---------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Tracing          | OpenTelemetry + OTLP                                | Vendor-neutral; every observability stack accepts it                                  |
| Metrics          | Prometheus scrape endpoint                          | De facto standard for on-prem                                                         |
| Logging          | pino structured JSON                                | Already used throughout; trivial to ship to Loki/ES                                   |
| Image signing    | cosign                                              | Modern, keyless-capable, CNCF project                                                 |
| Helm chart scope | Minimal (pg/minio/server/worker/web) — no operators | Keeps the install simple; users bring their own Postgres/MinIO operators if they want |
| Upgrade story    | Migrator-runs-first + documented rollback           | Simple, understandable, testable                                                      |

## Testing Strategy

- **Unit**: log field serializer, metrics label sanitizer
- **Integration**: migrator idempotency, backup+restore round-trip
- **API e2e**: `/health`, `/ready`, `/metrics` shapes asserted
- **Operational smoke test**: Docker Compose from scratch + Helm to kind — runs weekly on CI, not per-PR (cost management)
- **Component**: none (ops-focused slice)

## Risks

| Risk                                                         | Likelihood | Impact | Mitigation                                                                   |
| ------------------------------------------------------------ | ---------- | ------ | ---------------------------------------------------------------------------- |
| Upgrade + rollback not truly atomic                          | Med        | High   | Migrator transactional boundaries; rollback runbook exercised in CI          |
| Metrics cardinality explosion (user ids, document ids)       | Med        | High   | Allowlist of label keys; lint rule forbidding unbounded labels               |
| Helm chart drift from Compose feature parity                 | High       | Med    | Same integration smoke test runs on both paths                               |
| Observability overhead on small installs                     | Low        | Low    | Tracing sampled by default; opt-in to full fidelity                          |
| Backup/restore misses edge-case data (MinIO bucket policies) | Med        | High   | Restore verification test asserts a project loads, not just that files exist |

## Exit Criteria → Product v1 ready

- DoD met, CI green on `main`
- Operational smoke test green on both Compose and Helm paths
- Backup/restore runbook exercised end-to-end by a non-Claude human
- `known-issues.md` has no new P0/P1 entries
- Retrospective note added
- **This is the v1 cut.** Subsequent work lives in new roadmap slices tracked separately.
