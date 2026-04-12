# @cad/cli

`cad` — command-line interface for the CAD monorepo.

## Slice 0 surface

Slice 0 ships a single command: `version`. It reports the CLI version, the
kernel version, the pinned `replicad-opencascadejs` package version, and the
Node runtime. All version lookups are synchronous — the CLI does **not** boot
the ~40 MB OpenCascade.js WASM kernel just to print version strings. For the
runtime-queried OCCT C++ macro version, use `@cad/kernel/getOccVersion()`
from Node or browser code.

## Usage

```bash
cad                 # same as `cad version`
cad --version       # commander-style short flag
cad version         # explicit subcommand
cad version --json  # machine-readable JSON
```

Example output:

```
cad           0.0.1
@cad/kernel   0.0.1
occt          replicad-opencascadejs@0.23.0
node          v22.11.0
```

## Scripts

| Script               | Purpose                                            |
| -------------------- | -------------------------------------------------- |
| `pnpm build`         | Regenerate `src/version.ts`, then `tsc` to `dist/` |
| `pnpm typecheck`     | `tsc --noEmit` over source + tests                 |
| `pnpm test`          | Vitest — unit + integration (spawns compiled bin)  |
| `pnpm test:coverage` | Vitest with v8 coverage; gate is 80/75             |
| `pnpm lint`          | ESLint (root config via `@cad/config`)             |
| `pnpm clean`         | Remove `dist/`                                     |

## Layout

```
bin/
  cad.js                 # shebang + launcher → dist/index.js
src/
  index.ts               # commander program entrypoint
  version.ts             # AUTO-GENERATED CLI_VERSION
  commands/
    version.ts           # getVersionInfo, formatHuman, formatJson
test/
  version-command.test.ts # unit — pure formatters
  cli.int.test.ts         # integration — spawn built binary, assert stdout
```
