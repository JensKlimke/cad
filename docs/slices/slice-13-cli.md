# Slice 13 — CLI

> Skeleton plan. Upgraded to Slice-0 depth when execution begins.
> Parent: [`PLAN.md`](../../PLAN.md) — Slice 13.

## Goal

Deliver a proper developer-facing CLI built on top of Slice 12's REST surface. `cad init` scaffolds a project, `cad build` executes a document, `cad export` writes models, `cad params set` tunes parameters, `cad diff` shows DAG differences, `cad run <script>` executes authoring scripts. Works transparently against a local runtime or a remote on-prem server. A CI pipeline should be able to build CAD models headlessly with zero extra tooling.

## Definition of Done

- `cad` binary exposes: `init`, `build`, `export`, `params`, `diff`, `run`, `docs`, `printer`, `version`
- Token auth via OS keychain (fallback to `$XDG_CONFIG_HOME/cad/token` with 0600 perms)
- `cad init` scaffolds a working `document.ts` + `cad.config.ts` + a minimal example
- `cad build` compiles + executes locally or against a remote server, identical output
- `cad export --format <fmt>` writes files to disk; format list matches Slice 10
- `cad params set key=value` rewrites the source through the authoring layer
- `cad diff <rev-a> <rev-b>` shows a human-readable DAG diff (renamed / added / removed / input-changed)
- `cad run script.ts` executes a TS authoring script with access to the `@cad/sdk` surface
- `cad printer list|send|status` wraps Slice 10c
- Exit codes are scriptable (0 success, 1 user error, 2 system error, 3 validation error)
- CI fixture: a small repo of `.ts` documents built and exported in a GitHub Actions workflow using the CLI end-to-end

## Out of Scope

- GUI for the CLI (explicit non-goal)
- Shell completions for fish/nushell (bash + zsh only in v1)
- Self-update mechanism — manual upgrades via pnpm for now
- Plugin system — deferred

## Dependencies

Slices 0, 2, 10, 10c, 12 (CLI is a thin client over the REST surface + a local runtime fallback).

## Work Items (high-level)

- **W1** CLI bootstrap in `apps/cli`: commander program, subcommand loader, consistent error handling, colourized output via `picocolors`
- **W2** Auth: token acquisition via `cad auth login`, stored in OS keychain (`keytar`) with a file fallback; token refresh on expiry
- **W3** Local/remote dispatch: each command detects `CAD_SERVER_URL`; falls back to spawning the in-process runtime if unset
- **W4** `cad init`: templated scaffolder with a working example + `cad.config.ts` + `.gitignore` additions
- **W5** `cad build`: runs the runtime, prints progress, emits tessellation artifact path or stdout JSON with `--json`
- **W6** `cad export`: wraps the `@cad/exporters` surface
- **W7** `cad params set|get|list`: uses the authoring codemods from Slice 2; round-trips the document
- **W8** `cad diff`: calls the server's version diff endpoint; falls back to local Git inspection
- **W9** `cad run <script>`: executes a user TS file against `@cad/sdk` in a worker; same sandbox as the runtime
- **W10** `cad printer list|send|status`: wraps the Slice 10c endpoints
- **W11** `cad docs search|get`: wraps the Slice 4b handbook API (already exists; this slice just adds colour + formatting polish)
- **W12** Shell completions for bash + zsh
- **W13** GitHub Actions example workflow in `examples/ci/` that exercises the full CLI
- **W14** `docs/verification/slice-13.md` checklist

## Key Decisions

| Concern             | Choice                                | Reason                                            |
| ------------------- | ------------------------------------- | ------------------------------------------------- |
| CLI framework       | Commander (already in Slice 0)        | Mature, predictable, no churn                     |
| Keychain            | `keytar` with file fallback           | Native on macOS/Windows; file for Linux headless  |
| Colour              | `picocolors`                          | Tiny, zero deps, works in CI and tty              |
| Config              | `cad.config.ts` next to `document.ts` | Consistent with how Vite/tsup approach configs    |
| Local/remote toggle | `CAD_SERVER_URL` env var              | Zero-config local default; explicit remote opt-in |

## Testing Strategy

- **Unit**: argument parsing, config loader, token store abstraction, diff formatter
- **Integration**: each command against Testcontainers server + local runtime mode
- **API e2e**: spawn the binary and drive it end-to-end via child process; assert exit codes
- **Component**: none (headless)
- **Example CI**: a GitHub Actions workflow in `examples/ci/` exercises `cad init → cad build → cad export` every PR

## Risks

| Risk                                                  | Likelihood | Impact | Mitigation                                                                         |
| ----------------------------------------------------- | ---------- | ------ | ---------------------------------------------------------------------------------- |
| `keytar` native-module build breakage on some distros | High       | Med    | File fallback from day one; document it as the supported path on Linux             |
| Local vs remote behavioural drift                     | Med        | High   | Same code path post-dispatch; integration tests cover both modes for every command |
| Diff output confusion                                 | Med        | Med    | Machine-readable `--json` mode in addition to human output                         |
| CLI API stability across future slices                | Med        | Med    | Versioned via `cad --version`; breaking changes tracked in `CHANGELOG.md`          |

## Exit Criteria → Gate into Slice 14

- DoD met, CI green on `main`
- GitHub Actions example workflow green
- `known-issues.md` has no new P0/P1 entries
- Retrospective note added
