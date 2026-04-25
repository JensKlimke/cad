# AI-Ready Web CAD

A web-based, parametric CAD system designed to surpass FreeCAD 1.0 in workflow, reference stability, and AI/agent controllability. Every model is an executable TypeScript document; every operation is reachable from the UI, CLI, REST API, and MCP.

> **Status — pre-alpha.** Slice 0 and Slice 0b are shipped; Slice 1 is implemented as the current on-prem baseline. See [`PLAN.md`](./PLAN.md) for the full roadmap.

## What makes it different

- **Code-first parametric model** — the document is versionable TypeScript, not an opaque binary.
- **Industrial B-rep kernel** — [`replicad`](https://replicad.xyz/) on top of OpenCascade, the same kernel that powers FreeCAD.
- **Strict dual-write** — the UI and the code editor stay in perfect lockstep via AST codemods; edit from either side.
- **Stable references** — a `finder → construction → hash` resolution chain eliminates the topological-naming problem from day one.
- **Headless-controllable** — UI, CLI, REST, and MCP all sit on the same Zod-validated command schema.
- **BambuLab printer integration** — one-click LAN direct print (MQTT + FTP).

## Getting started

```bash
git clone <this-repo>
cd cad
pnpm install
```

Read [`PLAN.md`](./PLAN.md) for the architecture and delivery slices, and [`CLAUDE.md`](./CLAUDE.md) for the hard constraints and working agreements.

> The repository now contains a working monorepo, a Fastify + Postgres + MinIO Slice 1 stack, and a compose-backed login → create project → open document flow. Watch [`TODO.md`](./TODO.md) and the slice docs under [`docs/slices/`](./docs/slices/) for progress on Slice 2+.

## Start the stack

Prerequisites:

- Node 22+
- pnpm 9+
- Docker running locally

Create the local compose env file, then boot the full stack:

```bash
cp deploy/compose/.env.example deploy/compose/.env
pnpm stack:up
```

This starts Postgres, MinIO, the database migrator, the API server, and the web app. To stop and remove the local stack state, run:

```bash
pnpm stack:down
```

## Access the platform

The web app is exposed on the `WEB_PORT` configured in [`deploy/compose/.env`](./deploy/compose/.env). With the default example values, open:

- `http://localhost:15173/login`

Log in with the seeded admin credentials from [`deploy/compose/.env`](./deploy/compose/.env):

- `ADMIN_EMAIL`
- `ADMIN_INITIAL_PASSWORD`

After login, create a project, open it, and create a document to enter the CAD workspace. The API health endpoints are exposed on the `SERVER_PORT` from the same env file; with the default example values these are:

- `http://localhost:18080/health`
- `http://localhost:18080/ready`

## Project docs

| File                                   | Purpose                                                     |
| -------------------------------------- | ----------------------------------------------------------- |
| [`PLAN.md`](./PLAN.md)                 | Authoritative roadmap, architecture, and delivery slices    |
| [`CLAUDE.md`](./CLAUDE.md)             | Working agreements and hard constraints for AI contributors |
| [`known-issues.md`](./known-issues.md) | Log of open issues discovered during development            |
| [`docs/testing-strategy.md`](./docs/testing-strategy.md) | Current test pyramid, suite ownership, and CI policy |
| [`docs/slices/`](./docs/slices/)       | Per-slice acceptance and verification notes                 |

## License

To be determined.
