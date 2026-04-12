# AI-Ready Web CAD

A web-based, parametric CAD system designed to surpass FreeCAD 1.0 in workflow, reference stability, and AI/agent controllability. Every model is an executable TypeScript document; every operation is reachable from the UI, CLI, REST API, and MCP.

> **Status — pre-alpha.** Planning is complete; implementation is starting with Slice 0. See [`PLAN.md`](./PLAN.md) for the full roadmap.

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
```

Read [`PLAN.md`](./PLAN.md) for the architecture and delivery slices, and [`CLAUDE.md`](./CLAUDE.md) for the hard constraints and working agreements.

> The repository is currently pre–Slice-0: only a TypeScript scaffold is committed. Real `pnpm install` / `pnpm dev` / `docker compose up` commands land with Slice 0. Watch [`TODO.md`](./TODO.md) and the slice docs under [`docs/slices/`](./docs/slices/) for progress.

## Project docs

| File                                   | Purpose                                                     |
| -------------------------------------- | ----------------------------------------------------------- |
| [`PLAN.md`](./PLAN.md)                 | Authoritative roadmap, architecture, and delivery slices    |
| [`CLAUDE.md`](./CLAUDE.md)             | Working agreements and hard constraints for AI contributors |
| [`known-issues.md`](./known-issues.md) | Log of open issues discovered during development            |
| [`docs/slices/`](./docs/slices/)       | Per-slice acceptance and verification notes                 |

## License

To be determined.
