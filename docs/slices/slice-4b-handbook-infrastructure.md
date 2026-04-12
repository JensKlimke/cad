# Slice 4b — Handbook Infrastructure

> Skeleton plan. Upgraded to Slice-0 depth when execution begins.
> Parent: [`PLAN.md`](../../PLAN.md) — Slice 4b. Delivered in parallel with Slice 4.

## Goal

Ship the handbook as a **first-class feature**, not as documentation. Build the `@cad/handbook` package, the in-app MDX viewer, the CLI `cad docs` command, and — most importantly — turn on the CI gate that will block every future PR adding a user-visible SDK op without a handbook page. The handbook must be programmatically queryable so Slice 14's MCP server can expose it to AI agents.

## Definition of Done

- `@cad/handbook` package builds an MDX content tree, validates frontmatter with Zod, and emits a MiniSearch index
- In-app handbook viewer renders MDX pages with TOC, deep links, code-copy buttons, theme-aware styling
- Every feature dialog, inspector field, and command palette entry (placeholder in Slice 4) has a `?` button that deep-links to the right handbook anchor
- CLI `cad docs`, `cad docs search <query>`, `cad docs list` render MDX in the terminal
- Programmatic API exposed: `search(query, filters)`, `get(path)`, `list()`, `forSdkOp(opId)`
- CI gate (`lint:handbook`) replaces the Slice 0 stub and fails on any SDK op without a corresponding page
- Proof-of-gate test: deliberately breaking an op in CI fails the PR
- Initial content shipped: Concepts (document model, feature DAG, references, parameters, expressions, dual-write), Workflows (create project → sketch → pad), FAQ

## Out of Scope

- MCP handbook tools → Slice 14
- Semantic search via embeddings → future (lexical MiniSearch first)
- Full content coverage across every op → lands per-slice via DoD gate
- Versioned handbook history → handbook version = SDK version for v1

## Dependencies

Slices 0, 1, 2. Delivered in parallel with Slice 4 — no Slice 4 feature blocks on Slice 4b and vice versa.

## Work Items (high-level)

- **W1** `@cad/handbook` package scaffold: content directory (`content/`), frontmatter Zod schema, build script
- **W2** MDX content pipeline: compile-time MDX → JSX; shared MDX component set (callouts, code blocks, cross-references)
- **W3** MiniSearch index builder: tokenize title + body + tags; emit JSON blob shipped with the package
- **W4** Programmatic API: `search`, `get`, `list`, `forSdkOp`; framework-free, runnable in Node and browser
- **W5** In-app handbook viewer in `apps/web`: MDX renderer (`@mdx-js/react`), TOC, deep links, code copy, dark/light aware
- **W6** Contextual `?` buttons wired into Slice 4's feature tree and inspector; deep link by anchor
- **W7** Command palette stub (placeholder for Slice 11) surfaces handbook hits inline
- **W8** CLI `cad docs` subcommand: list, search, get; renders MDX in the terminal via a markdown-to-ANSI renderer
- **W9** `docMetadata` contract enforced at the SDK level: each op exports `{ id, title, shortDescription, params: ZodSchema, examples, handbookPath }`
- **W10** Codegen step: if an SDK op lacks a handbook page, emit a stub MDX file (developer must fill it in)
- **W11** Replace `scripts/lint-handbook.ts` no-op with the real gate: scan `@cad/sdk` exports, cross-reference with MDX frontmatter, fail on mismatch
- **W12** Initial content: Concepts, Workflows, FAQ; at least one op (`pad`, even if stubbed) has a real page to exercise the pipeline
- **W13** `docs/verification/slice-4b.md` checklist

## Key Decisions

| Concern          | Choice                       | Reason                                                    |
| ---------------- | ---------------------------- | --------------------------------------------------------- |
| Content format   | MDX                          | Mixes prose + live components; React-native               |
| Search           | MiniSearch (lexical)         | Zero runtime deps, offline-capable, fast enough           |
| Semantic search  | Deferred                     | Lexical solves 90% of discovery; semantic adds complexity |
| CLI renderer     | `marked-terminal` or similar | Proven, no custom rendering to maintain                   |
| Gate enforcement | Pre-build script in CI       | Runs before `pnpm test`; fails fast                       |

## Testing Strategy

- **Unit**: frontmatter validator, search index tokenizer, `forSdkOp` lookup, CLI renderer
- **Integration**: build full content tree; assert every op has a page; search returns expected hits
- **API e2e**: `GET /handbook/*` endpoints (so the web app can fetch without bundling the entire content tree)
- **Component**: MDX viewer renders headers/code/callouts correctly; deep-link resolver
- **Playwright**: no new journey yet; Slice 11 adds the "handbook access" golden journey

## Risks

| Risk                                        | Likelihood | Impact | Mitigation                                                          |
| ------------------------------------------- | ---------- | ------ | ------------------------------------------------------------------- |
| MDX bundler integration with Vite           | Med        | Med    | Use `@mdx-js/rollup` — well-supported; pinned version               |
| Gate false positives on legacy/stub ops     | Med        | Med    | Allowlist for explicitly-stubbed ops with `docMetadata.stub: true`  |
| CLI MDX rendering fidelity                  | Low        | Low    | Limit custom MDX components; fallback to plain markdown in terminal |
| Content rot (prose drifts from op behavior) | High       | Med    | Generate param tables from the op's Zod schema at build time        |

## Exit Criteria → Gate into Slice 5

- DoD met, CI green on `main`
- Gate demonstrably fails on a deliberate missing page
- `known-issues.md` has no new P0/P1 entries
- Retrospective note added
