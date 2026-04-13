# Dependency audit

Authoritative reference for the dependency audit that protects this repo from vulnerable, unused, abandoned, and license-incompatible packages. The audit is **runnable** (`pnpm audit:deps`), **gated** (`/quality` step 10 delegates to it), and **documented** (this file). It is not a soft recommendation.

## Why we audit

- `CLAUDE.md` § Quality bar mandates production-grade software. Dep hygiene is a pre-condition for that, not an afterthought.
- `PLAN.md` § CI Enforcement defines hard quality gates (lint, typecheck, test, coverage, handbook). This audit is the dependency-layer gate of that same set.
- `CLAUDE.md` § Hard architectural constraints — point 6 — pins v1 to **on-prem only**. We cannot rely on a SaaS scanner (Snyk, Socket.dev, GitHub Advanced Security) as the source of truth, because operators must be able to run the full quality gate offline. The audit uses tools that ship in the repo or in the pnpm CLI.
- Self-hosted operators inherit the supply chain we ship with. A vulnerable transitive at moderate severity is **their** vulnerability, not ours-to-defer. Slipping moderate+ vulns into a release is a direct breach of the trust model.

## What we audit

| #   | Concern                       | Question answered                                                                                                        | Blocking?                           |
| --- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------- |
| 1   | Vulnerabilities               | "Does any production dep ship a known CVE at moderate or higher severity?"                                               | Yes                                 |
| 2   | Unused / missing dependencies | "Are we paying install/install-time/audit-surface cost for code we don't import? Is anything imported but not declared?" | Yes                                 |
| 3   | Outdated dependencies         | "Is any direct dep at least one major version behind upstream?"                                                          | Yes (major drift only)              |
| 4   | Licenses                      | "Does every production dep ship a license we accept?"                                                                    | Yes (blocklist), info (review list) |

The four subchecks live in `scripts/audit-deps.ts`, are configured by `scripts/audit-deps.config.json`, and are exposed as `pnpm audit:vulns`, `pnpm audit:unused`, `pnpm audit:outdated`, `pnpm audit:licenses`, plus the orchestrator `pnpm audit:deps`.

## Tool choices and rationale

| Concern          | Tool                                              | Why this, not the alternatives                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Vulnerabilities  | `pnpm audit --prod --audit-level=moderate --json` | Built into the package manager we already use. Reads the same advisory feed as the npm registry. `--prod` excludes devDeps from the blocking set (devDep vulns are reported as info — they don't ship to production). No external service, no API key, runs offline once the registry is reachable. Rejected: `npm audit` (wrong package manager), `snyk`/`socket.dev` (SaaS, breaks the on-prem-only constraint). |
| Unused / missing | `knip`                                            | TS- and pnpm-workspace-aware, single root config, detects unused files / exports / dependencies / devDependencies / unlisted (missing) dependencies in one pass. Actively maintained. Rejected: `depcheck` (older, weaker TS support, no first-class workspace handling); running both adds noise without adding signal.                                                                                           |
| Outdated         | `pnpm outdated -r --format json`                  | Built-in, recursive across workspaces, machine-readable output. Compares against the registry, semver-aware. Rejected: `npm-check-updates` (npm-centric, less workspace-friendly), `renovate` (PR-bot, not a local audit).                                                                                                                                                                                         |
| Licenses         | `pnpm licenses list --prod --json`                | Built-in, walks the resolved tree, no extra dep. We parse it against the allow / block / review lists in `audit-deps.config.json` ourselves so policy lives in the repo, not the tool. Rejected: `license-checker-rseidelsohn` and similar (extra dependency for what pnpm already does).                                                                                                                          |

## Thresholds

| Subcheck         | Pass                                                                     | Info                                   | Block                                              |
| ---------------- | ------------------------------------------------------------------------ | -------------------------------------- | -------------------------------------------------- |
| Vulnerabilities  | 0 vulns                                                                  | `low` only in prod, or any vuln in dev | **`moderate`+ in prod**                            |
| Unused / missing | 0 findings                                                               | —                                      | **any unused dep, devDep, or unlisted import**     |
| Outdated         | all current                                                              | minor / patch drift                    | **major-version drift on any direct dep**          |
| Licenses         | every prod dep on the allowlist (permissive or file-level weak copyleft) | `UNKNOWN` license appears              | **blocklist license appears** (GPL/AGPL/LGPL/SSPL) |

The thresholds are encoded in `scripts/audit-deps.config.json`. Do not change them in a feature PR — threshold changes are policy changes and need their own review.

## License policy

Lists are stored in `scripts/audit-deps.config.json` so they are reviewable in git. The defaults at time of writing:

### Allowlist (auto-accepted)

Permissive: `0BSD`, `Apache-2.0`, `BlueOak-1.0.0`, `BSD-2-Clause`, `BSD-3-Clause`, `CC-BY-3.0`, `CC-BY-4.0`, `CC0-1.0`, `ISC`, `MIT`, `MIT-0`, `Python-2.0`, `Unlicense`, `WTFPL`.

File-level weak copyleft (accepted): `MPL-2.0`, `EPL-1.0`, `EPL-2.0`, `CDDL-1.0`, `CDDL-1.1`. These licenses scope copyleft obligations to the modified file only — they do not propagate to the rest of the application or impose linking obligations on the binary we ship. They are compatible with a closed-source build provided we honor file-level redistribution requirements (which apply only if we modify the file itself).

The combined allowlist is compatible with shipping a closed-source build of the CAD application without per-customer license-disclosure friction.

### Blocklist (rejected)

`AGPL-1.0`, `AGPL-3.0`, `GPL-1.0`, `GPL-2.0`, `GPL-3.0`, `LGPL-2.0`, `LGPL-2.1`, `LGPL-3.0`, `SSPL-1.0`.

GPL/AGPL propagate copyleft obligations through the linked binary. LGPL imposes linking and relink obligations we do not want to take on for a desktop/server application that is partially compiled into the bundled output. SSPL has its own well-known commercial-use issues. A blocked license is a blocked license; replace the dep, do not whitelist.

### Review list (human decision required)

`UNKNOWN` — packages where pnpm could not determine the license. The audit surfaces them as info, not failure. To accept one of them:

1. Make the call in writing: which package, which version, which license, why the obligations are acceptable for this codebase.
2. Append the package + version to the `licenses.exceptions` array in `scripts/audit-deps.config.json` (format: `name@version`).
3. Add a one-line entry to the **Exceptions** section below explaining the decision.

### Exceptions

_(none yet)_

## How to fix each failure class

### Vulnerability fail

```bash
pnpm audit                              # see the full advisory list
pnpm update --latest <vulnerable-pkg>   # try the latest version first
pnpm install                            # re-resolve the lockfile
pnpm audit:vulns                        # confirm fix
```

If the vulnerable dep is transitive and the direct parent has not yet upgraded, escalate to the upstream maintainer (issue + PR) and pin via `pnpm.overrides` in the root `package.json` as a temporary measure. Document the override in `known-issues.md` so we remove it once upstream catches up.

### Unused / missing fail

```bash
pnpm audit:unused                       # see the offending packages and workspaces
pnpm remove <unused-pkg> --filter <ws>  # remove from the workspace that flagged it
# or, for a missing dep:
pnpm add <missing-pkg> --filter <ws>
pnpm audit:unused                       # confirm fix
```

If knip is wrong (the dep is referenced via dynamic import, plugin discovery, or a side-effect import that knip cannot trace), add the package name to `knip.json` § `ignoreDependencies` **with a comment explaining why**. Never silence without justification — silenced findings rot.

### Outdated fail (major drift)

1. Read the upstream changelog for the major bump. **Do not** auto-upgrade.
2. Decide: upgrade now (focused PR), wait until a downstream dep also catches up, or replace the package.
3. If upgrading: `pnpm update --latest <pkg>`, run the full `/quality` flow, ship in its own PR (never bundled with feature work).
4. If waiting because **upstream peer ranges or runtime constraints make the upgrade impossible**: add the package to `outdated.exceptions` in `scripts/audit-deps.config.json`. Every entry **must** include `name`, `latestMajor` (the version we cannot reach), `reason` (the upstream blocker — peer-dep range, engine constraint, etc.), and `trackingUrl` (issue / discussion link or in-repo anchor). The exception only suppresses the block while `latestMajor` matches; the moment upstream ships a new major, the audit re-fails and forces a fresh decision. Exempted majors are surfaced as `info` so they remain visible in every audit run — they are not silenced.

#### Outdated exceptions (when to use, when not to)

| When                                                                                                                                                  | Action                                                                                                                                                                                           |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| You can upgrade now (no peer-dep blocker, no engine blocker, no API break)                                                                            | Upgrade. Do not add an exception.                                                                                                                                                                |
| You could upgrade but want to defer for review                                                                                                        | Open a tracking issue, log a P2 in `known-issues.md`, **do not** add an exception. The audit must keep failing until the work is done.                                                           |
| Upstream peer-dep range explicitly excludes the new major (e.g., a plugin still pinned to the old major) **and** runtime is broken on the new version | Add an exception. Reason must name the blocker package + version. The exception expires automatically when upstream releases a compatible version (a different `latestMajor` re-trips the gate). |
| You disagree with the new major's API direction                                                                                                       | Not an exception. Either pin via `pnpm.overrides` and replace later, or replace the package now.                                                                                                 |

### License fail (blocklist)

Replace the package. There is no whitelist path for GPL/AGPL/LGPL/SSPL in this repo. If you cannot find an allowlisted alternative, escalate the requirement — the right answer might be to write the functionality ourselves rather than ship a dep we cannot relicense.

### License info (review list)

Make the call (see § License policy → Review list above), add the exception, document it.

## How this plugs into the rest of the gates

- **`/quality` step 10** delegates to `pnpm audit:deps`. That is the only place quality and the audit are wired together — keeping the seam narrow means policy changes happen here, not in five places.
- **CI** — Slice 0 § Foundations adds the GitHub Actions / GitLab CI workflow. The workflow runs `pnpm audit:deps` as a parallel job alongside `lint`, `typecheck`, and `test`. Until then, the audit is a local-and-slash-command-only gate.
- **`/audit-deps` slash command** — `.claude/commands/audit-deps.md` walks an agent through the audit step by step, including pre-checks, summary template, and known-issues logging rules.
- **`security-analysis.md`** is the human-narrative document for security-sensitive surfaces (auth, validation, secrets, file I/O, network). The dependency audit and `security-analysis.md` are complementary, not redundant: the audit is mechanical, the analysis is human judgment about the surfaces we expose. Both are required.

## When to run the audit

| Trigger                                      | What to run                                                                            |
| -------------------------------------------- | -------------------------------------------------------------------------------------- |
| You added or upgraded a dep                  | `pnpm audit:deps` (full pass)                                                          |
| You removed a dep                            | `pnpm audit:unused` is enough; `pnpm audit:deps` is safer                              |
| You hit a vulnerability advisory in the wild | `pnpm audit:vulns`, then act                                                           |
| Pre-merge / pre-deploy                       | `/quality` (which includes `pnpm audit:deps` at step 10)                               |
| Periodic upkeep (weekly)                     | `pnpm audit:deps` from a clean checkout — catches drift you did not introduce yourself |

## What the audit does **not** cover

Explicit out-of-scope, so you know what to add later, not what to assume:

- **Auto-fix**. The audit reports; humans decide. A `--fix` flag is future work.
- **SBOM generation / Sigstore / npm provenance attestations**. Nice-to-haves; not in v1.
- **Runtime supply-chain monitoring** (Socket.dev, Phylum). Out by the on-prem-only rule.
- **Container image scanning** (Trivy, Grype). That belongs in the deploy pipeline, not in the dep audit. Slice 15 (on-prem packaging) wires it up.
- **Mutation testing of the audit script itself**. Stryker (per `PLAN.md`) is scoped to `expr` / `authoring` / `references`, not tooling scripts.
- **Per-package audit tasks in `turbo.json`**. The audit is root-level today because most workspace packages do not exist yet. Revisit when `packages/*` is populated and a per-package audit has independent meaning.
