# Slice 2 — SDK, Expression Engine, Authoring Layer, Runtime

> Skeleton plan. Upgraded to Slice-0 depth when execution begins.
> Parent: [`PLAN.md`](../../PLAN.md) — Slice 2.

## Goal

Make the document IS executable TypeScript. This is the **biggest slice** and the core of the dual-write model. Ship the minimal SDK surface, the expression engine, the AST-based authoring layer, and the sandboxed runtime — end to end, with round-trip tests that prove the authoring layer preserves source fidelity.

## Definition of Done

- `cad build hello.ts` compiles and executes a document, emits deterministic tessellation JSON
- Parameter change in the source re-executes and produces updated tessellation
- Expression engine parses `2*height + 5`-style expressions with units, builds a dependency graph, detects cycles, reports dimensional mismatches
- Authoring round-trip corpus green: for ~50 fixture documents, `print(parse(src))` equals `src` (modulo formatting)
- Every planned codemod in the library applies cleanly and the resulting source parses and evaluates
- Sandboxed runtime enforces timeout + memory cap; escape attempts are blocked
- Server endpoint `POST /documents/:id/build` works end-to-end with a real document
- Coverage gates green on `@cad/expr`, `@cad/authoring`, `@cad/sdk`, `@cad/runtime`

## Out of Scope

- Viewport content updates on build (pull-based for now) → Slice 3
- Monaco editor & dual-write UI → Slice 4
- Sketch subsystem → Slice 5
- More feature ops beyond stubs for `pad` and `sketch` → Slice 6+

## Dependencies

Slices 0, 1.

## Work Items (high-level)

- **W1** `@cad/sdk` minimal API: `defineDocument`, `parameters`, `body`, `pad` (stub), `sketch` (stub); each op exports a `docMetadata` object with Zod-described params
- **W2** `@cad/expr`: Pratt parser, AST, evaluator, unit system (`mm`, `deg`, `rad`, `count`), dimensional checker, dependency-graph builder, topological eval, cycle detection, clear diagnostics
- **W3** `@cad/authoring` parser: `ts.createSourceFile` → typed `DocumentAST` (parameters, features, statements); pure data, no ts objects leaking out
- **W4** `@cad/authoring` codemod library: one pure function per authoring op `(ast, op) => ast`; covers every op planned for Slices 4–10c (stubs OK where execution isn't ready)
- **W5** `@cad/authoring` printer: ts-morph–based print, Prettier-formatted, comment- and ordering-preserving
- **W6** Round-trip test corpus: ~50 fixture `document.ts` files; assertion `print(parse(src)) === src`; applying each codemod produces valid source
- **W7** `@cad/runtime`: worker-based executor (`node:worker_threads` with `resourceLimits`), restricted `require`/`import`, timeout, memory cap, deterministic result object
- **W8** Feature DAG scheduler inside the runtime: topological eval, per-feature memoization keyed on stable input hash, cache eviction policy
- **W9** `cad build` CLI subcommand: reads a source file, executes in the runtime, prints JSON tessellation or writes to disk
- **W10** Server `POST /documents/:id/build`: pulls source from Postgres, runs it in a worker pool, persists tessellation artifact to MinIO, returns artifact URL
- **W11** Performance budgets: assert a reference document builds under a CI-enforced p95 threshold
- **W12** `docs/verification/slice-2.md` manual checklist

## Key Decisions

| Concern           | Choice                                                      | Reason                                                                |
| ----------------- | ----------------------------------------------------------- | --------------------------------------------------------------------- |
| Expression parser | Hand-written Pratt parser                                   | Small, testable, no runtime dep, explicit error model                 |
| AST printer       | ts-morph + Prettier                                         | ts-morph preserves trivia; Prettier normalizes style                  |
| Sandbox           | `node:worker_threads` + `resourceLimits` + module allowlist | Built-in, no native deps, adequate for trusted author code in on-prem |
| Feature hash      | Canonical JSON → SHA-256                                    | Deterministic, fast, collision-safe for our scale                     |
| Determinism       | Pin kernel version + rounded coordinate hashing             | Already used for tessellation snapshots in Slice 0                    |

## Testing Strategy

- **Unit**: expression parser/evaluator/unit checker, every codemod in isolation, Handle hashing, every SDK op's Zod validation
- **Integration**: real runtime + real kernel builds a fixture corpus; round-trip corpus; cache hit/miss paths
- **API e2e**: `POST /documents/:id/build` happy + validation + timeout + memory-cap paths
- **Playwright**: no new journey
- **Mutation**: Stryker expands to cover `@cad/expr` and `@cad/authoring` (per PLAN.md)

## Risks

| Risk                                                              | Likelihood | Impact | Mitigation                                                                                     |
| ----------------------------------------------------------------- | ---------- | ------ | ---------------------------------------------------------------------------------------------- |
| Sandbox escape via `worker_threads`                               | Med        | High   | Module allowlist; no native modules; review by security-reviewer; CI runs escape-attempt tests |
| Round-trip drift on edge-case syntax (decorators, complex trivia) | High       | Med    | Lock corpus early; every new codemod adds a fixture                                            |
| ts-morph performance on large documents                           | Med        | Med    | Incremental parse where possible; benchmark in CI with a 1000-feature fixture                  |
| Expression parser error UX                                        | Med        | Med    | Diagnostics carry source ranges; user-friendly messages; snapshot-tested                       |
| Determinism across OCCT patch versions                            | Low        | High   | Pin OCCT; tessellation hash snapshots already gated in CI                                      |

## Exit Criteria → Gate into Slice 3

- DoD met, CI green on `main` for one PR cycle
- Round-trip corpus is not a skipped/todo test anywhere
- `known-issues.md` has no new P0/P1 entries
- Retrospective note added
