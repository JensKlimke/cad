# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

An AI-ready, web-based, parametric CAD system. The design goal is to surpass FreeCAD 1.0 with a code-first parametric model, industrial B-rep kernel, and headless-controllable surfaces (UI, CLI, REST, MCP).

**`PLAN.md` is the authoritative roadmap.** It defines the architecture, package layout, delivery slices (0–15), testing pyramid, and golden demos. Read it before making structural decisions — do not improvise around it.

## Current state (important)

The repo is at **pre-Slice-0**: only a placeholder `src/index.ts`, a minimal `package.json`, and `tsconfig.json` exist. The monorepo structure described in PLAN.md (`packages/*`, `apps/*`, `deploy/*`) has **not been created yet**.

This means:

- There is no `pnpm-workspace.yaml`, no Turborepo config, no `packages/kernel`, no `packages/authoring`, no server, no tests.
- The only working command is `npm run build` (which runs `tsc` on the stub file).
- When asked to "start Slice 0", follow PLAN.md § Slice 0 literally — create the monorepo layout, wire up the testing pyramid scaffold, and prove every CI layer runs green before adding features.

Do not assume any file or package exists just because PLAN.md names it. Verify with `ls` / `glob` first.

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

Only the scaffold command exists today. Everything else will be added in Slice 0.

```bash
npm run build   # tsc → dist/
```

When Slice 0 lands, this section should be updated with: `pnpm install`, `pnpm dev`, `pnpm test`, `pnpm test:e2e`, `pnpm typecheck`, `docker compose up`, etc. Until then, prefer `pnpm` in any new scripts (PLAN.md mandates pnpm + Turborepo).

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
