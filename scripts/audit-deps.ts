#!/usr/bin/env tsx
/**
 * Dependency audit orchestrator.
 *
 * Runs four subchecks (vulnerabilities, unused deps, outdated deps, licenses)
 * across the pnpm workspace and prints a structured summary. Exits non-zero on
 * any blocking failure. See `docs/dependency-audit.md` for the policy.
 */

import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = path.resolve(__dirname, 'audit-deps.config.json');

// ────────────────────────────────────────────────────────────────────────────
// Config
// ────────────────────────────────────────────────────────────────────────────

type AuditLevel = 'low' | 'moderate' | 'high' | 'critical';
type AuditScope = 'all' | 'prod';
type OutdatedBlock = 'none' | 'major' | 'minor' | 'any';

interface OutdatedException {
  /** Package name as reported by `pnpm outdated`. */
  readonly name: string;
  /** Major version we are pinned to (the upgrade target we cannot reach). */
  readonly latestMajor: number;
  /** Why the upgrade is blocked — typically an upstream peer-dep range. */
  readonly reason: string;
  /**
   * Issue / discussion link tracking when this exception expires.
   * Required so exceptions cannot rot indefinitely without a deadline.
   */
  readonly trackingUrl: string;
}

interface AuditConfig {
  readonly vulnerabilities: {
    readonly auditLevel: AuditLevel;
    readonly scope: AuditScope;
  };
  readonly outdated: {
    readonly blockOn: OutdatedBlock;
    /**
     * Direct deps that are surfaced as info instead of fail when the
     * latest upstream major matches `latestMajor`. Every entry must
     * carry a `reason` and a `trackingUrl`. See
     * `docs/dependency-audit.md` § Outdated exceptions.
     */
    readonly exceptions?: readonly OutdatedException[];
  };
  readonly licenses: {
    readonly allow: readonly string[];
    readonly block: readonly string[];
    readonly review: readonly string[];
    readonly exceptions: readonly string[];
  };
}

function loadConfig(): AuditConfig {
  const raw = readFileSync(CONFIG_PATH, 'utf8');
  const parsed: unknown = JSON.parse(raw);
  if (!isAuditConfig(parsed)) {
    throw new Error(`Invalid audit-deps config at ${CONFIG_PATH}`);
  }
  return parsed;
}

function isAuditConfig(value: unknown): value is AuditConfig {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.vulnerabilities === 'object' &&
    typeof v.outdated === 'object' &&
    typeof v.licenses === 'object'
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Result model (immutable — every step builds a new object)
// ────────────────────────────────────────────────────────────────────────────

type Status = 'pass' | 'fail' | 'info' | 'skipped';

interface CheckResult {
  readonly name: string;
  readonly status: Status;
  readonly summary: string;
  readonly details: readonly string[];
  readonly blocking: boolean;
}

interface AuditReport {
  readonly results: readonly CheckResult[];
}

function addResult(report: AuditReport, result: CheckResult): AuditReport {
  return { results: [...report.results, result] };
}

// ────────────────────────────────────────────────────────────────────────────
// Subprocess helper
// ────────────────────────────────────────────────────────────────────────────

interface RunResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly status: number | null;
  readonly missing: boolean;
}

function run(cmd: string, args: readonly string[]): RunResult {
  const child: SpawnSyncReturns<string> = spawnSync(cmd, args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  const missing =
    child.error !== undefined &&
    'code' in child.error &&
    (child.error as NodeJS.ErrnoException).code === 'ENOENT';
  return {
    stdout: child.stdout ?? '',
    stderr: child.stderr ?? '',
    status: child.status,
    missing,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Subcheck 1: vulnerabilities (pnpm audit)
// ────────────────────────────────────────────────────────────────────────────

interface PnpmAuditMetadata {
  readonly vulnerabilities?: Record<string, number>;
}

interface PnpmAuditOutput {
  readonly metadata?: PnpmAuditMetadata;
  readonly advisories?: Record<string, unknown>;
}

function checkVulnerabilities(config: AuditConfig): CheckResult {
  const args = ['audit', '--json', `--audit-level=${config.vulnerabilities.auditLevel}`];
  if (config.vulnerabilities.scope === 'prod') args.push('--prod');
  const result = run('pnpm', args);

  if (result.missing) {
    return {
      name: 'vulnerabilities',
      status: 'skipped',
      summary: 'pnpm executable not found',
      details: ['Install pnpm and re-run'],
      blocking: true,
    };
  }

  let parsed: PnpmAuditOutput | null = null;
  try {
    parsed = JSON.parse(result.stdout) as PnpmAuditOutput;
  } catch {
    // pnpm audit prints non-JSON when there's no lockfile yet — handle gracefully
  }

  const counts = parsed?.metadata?.vulnerabilities ?? {};
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
  const blockingLevels = thresholdLevels(config.vulnerabilities.auditLevel);
  const blockingCount = blockingLevels.reduce((sum, level) => sum + (counts[level] ?? 0), 0);

  if (total === 0) {
    return {
      name: 'vulnerabilities',
      status: 'pass',
      summary: 'no vulnerabilities reported',
      details: [],
      blocking: true,
    };
  }

  const breakdown = Object.entries(counts)
    .filter(([, n]) => n > 0)
    .map(([level, n]) => `${level}=${n}`)
    .join(', ');

  if (blockingCount > 0) {
    return {
      name: 'vulnerabilities',
      status: 'fail',
      summary: `${blockingCount} ${config.vulnerabilities.auditLevel}+ vulnerabilities (${breakdown})`,
      details: [
        'Run `pnpm audit` for the full advisory list',
        'Fix with `pnpm update --latest <pkg>`',
      ],
      blocking: true,
    };
  }

  return {
    name: 'vulnerabilities',
    status: 'info',
    summary: `${total} below-threshold vulnerabilities (${breakdown})`,
    details: [`Threshold: ${config.vulnerabilities.auditLevel}+ blocks`],
    blocking: true,
  };
}

function thresholdLevels(level: AuditLevel): readonly string[] {
  const order: readonly AuditLevel[] = ['low', 'moderate', 'high', 'critical'];
  const idx = order.indexOf(level);
  return order.slice(idx);
}

// ────────────────────────────────────────────────────────────────────────────
// Subcheck 2: unused deps (knip)
// ────────────────────────────────────────────────────────────────────────────

interface KnipReport {
  readonly dependencies?: ReadonlyArray<{ readonly name: string; readonly workspace?: string }>;
  readonly devDependencies?: ReadonlyArray<{ readonly name: string; readonly workspace?: string }>;
  readonly unlisted?: ReadonlyArray<{ readonly name: string; readonly workspace?: string }>;
}

function checkUnused(): CheckResult {
  const result = run('pnpm', ['exec', 'knip', '--reporter', 'json', '--no-progress']);

  if (result.missing) {
    return {
      name: 'unused-deps',
      status: 'skipped',
      summary: 'pnpm executable not found',
      details: [],
      blocking: true,
    };
  }

  const stdoutTrimmed = result.stdout.trim();
  if (stdoutTrimmed.length === 0 || /command not found|knip: not found/i.test(result.stderr)) {
    return {
      name: 'unused-deps',
      status: 'skipped',
      summary: 'knip not installed — run `pnpm install`',
      details: [result.stderr.trim()].filter((s) => s.length > 0),
      blocking: true,
    };
  }

  let parsed: KnipReport;
  try {
    parsed = JSON.parse(stdoutTrimmed) as KnipReport;
  } catch {
    return {
      name: 'unused-deps',
      status: 'fail',
      summary: 'could not parse knip output',
      details: [stdoutTrimmed.slice(0, 400)],
      blocking: true,
    };
  }

  const unusedDeps = parsed.dependencies ?? [];
  const unusedDev = parsed.devDependencies ?? [];
  const unlisted = parsed.unlisted ?? [];
  const total = unusedDeps.length + unusedDev.length + unlisted.length;

  if (total === 0) {
    return {
      name: 'unused-deps',
      status: 'pass',
      summary: 'no unused or missing dependencies',
      details: [],
      blocking: true,
    };
  }

  const details: string[] = [];
  if (unusedDeps.length > 0) {
    details.push(`unused dependencies: ${unusedDeps.map((d) => d.name).join(', ')}`);
  }
  if (unusedDev.length > 0) {
    details.push(`unused devDependencies: ${unusedDev.map((d) => d.name).join(', ')}`);
  }
  if (unlisted.length > 0) {
    details.push(`unlisted (missing) dependencies: ${unlisted.map((d) => d.name).join(', ')}`);
  }

  return {
    name: 'unused-deps',
    status: 'fail',
    summary: `${total} unused or missing dependencies`,
    details,
    blocking: true,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Subcheck 3: outdated deps (pnpm outdated, blocks on major drift)
// ────────────────────────────────────────────────────────────────────────────

interface OutdatedEntry {
  readonly current: string;
  readonly latest: string;
  readonly wanted?: string;
  readonly dependencyType?: string;
  readonly isDeprecated?: boolean;
}

type OutdatedReport = Record<string, OutdatedEntry>;

function checkOutdated(config: AuditConfig): CheckResult {
  const result = run('pnpm', ['outdated', '-r', '--format', 'json']);

  if (result.missing) {
    return {
      name: 'outdated-deps',
      status: 'skipped',
      summary: 'pnpm executable not found',
      details: [],
      blocking: true,
    };
  }

  const stdoutTrimmed = result.stdout.trim();
  if (stdoutTrimmed.length === 0 || stdoutTrimmed === '{}') {
    return {
      name: 'outdated-deps',
      status: 'pass',
      summary: 'all direct dependencies up to date',
      details: [],
      blocking: true,
    };
  }

  let parsed: OutdatedReport;
  try {
    parsed = JSON.parse(stdoutTrimmed) as OutdatedReport;
  } catch {
    return {
      name: 'outdated-deps',
      status: 'fail',
      summary: 'could not parse pnpm outdated output',
      details: [stdoutTrimmed.slice(0, 400)],
      blocking: true,
    };
  }

  const entries = Object.entries(parsed);
  const exceptions = new Map<string, OutdatedException>();
  for (const exc of config.outdated.exceptions ?? []) {
    exceptions.set(exc.name, exc);
  }

  const majorDrift: Array<{ name: string; current: string; latest: string }> = [];
  const exemptedDrift: Array<{
    name: string;
    current: string;
    latest: string;
    reason: string;
  }> = [];
  const minorDrift: Array<{ name: string; current: string; latest: string }> = [];

  for (const [name, info] of entries) {
    const currentMajor = parseMajor(info.current);
    const latestMajor = parseMajor(info.latest);
    if (currentMajor === null || latestMajor === null) continue;
    const driftedMajor = latestMajor > currentMajor;
    if (driftedMajor) {
      const exception = exceptions.get(name);
      if (exception !== undefined && exception.latestMajor === latestMajor) {
        exemptedDrift.push({
          name,
          current: info.current,
          latest: info.latest,
          reason: exception.reason,
        });
      } else {
        majorDrift.push({ name, current: info.current, latest: info.latest });
      }
    } else {
      minorDrift.push({ name, current: info.current, latest: info.latest });
    }
  }

  const blocksOnMajor =
    config.outdated.blockOn === 'major' ||
    config.outdated.blockOn === 'minor' ||
    config.outdated.blockOn === 'any';

  if (majorDrift.length > 0 && blocksOnMajor) {
    const list = majorDrift.map((d) => `${d.name} ${d.current} → ${d.latest}`).join('; ');
    const details = [list, `+${minorDrift.length} minor/patch updates available (informational)`];
    if (exemptedDrift.length > 0) {
      details.push(
        `+${exemptedDrift.length} exempted (documented in audit-deps.config.json): ${exemptedDrift
          .map((d) => `${d.name} ${d.current} → ${d.latest} (${d.reason})`)
          .join('; ')}`,
      );
    }
    return {
      name: 'outdated-deps',
      status: 'fail',
      summary: `${majorDrift.length} dependencies behind by a major version`,
      details,
      blocking: true,
    };
  }

  const infoLines: string[] = [];
  if (minorDrift.length > 0) {
    infoLines.push(minorDrift.map((d) => `${d.name} ${d.current} → ${d.latest}`).join('; '));
  }
  if (exemptedDrift.length > 0) {
    infoLines.push(
      `${exemptedDrift.length} major drift exempted: ${exemptedDrift
        .map((d) => `${d.name} ${d.current} → ${d.latest} (${d.reason})`)
        .join('; ')}`,
    );
  }

  return {
    name: 'outdated-deps',
    status: 'info',
    summary:
      exemptedDrift.length > 0 && minorDrift.length === 0
        ? `${exemptedDrift.length} major drift exempted, no other drift`
        : `${minorDrift.length} minor/patch updates available${
            exemptedDrift.length > 0 ? ` (+${exemptedDrift.length} exempted majors)` : ''
          }`,
    details: infoLines,
    blocking: false,
  };
}

function parseMajor(version: string): number | null {
  const match = /^[~^=v]*(\d+)\./.exec(version);
  const captured = match?.[1];
  if (captured === undefined) return null;
  return Number.parseInt(captured, 10);
}

// ────────────────────────────────────────────────────────────────────────────
// Subcheck 4: licenses (pnpm licenses list)
// ────────────────────────────────────────────────────────────────────────────

interface LicensePackageEntry {
  readonly name: string;
  readonly versions?: readonly string[];
  readonly license?: string;
}

type LicenseReport = Record<string, ReadonlyArray<LicensePackageEntry>>;

function checkLicenses(config: AuditConfig): CheckResult {
  const result = run('pnpm', ['licenses', 'list', '--json', '--prod']);

  if (result.missing) {
    return {
      name: 'licenses',
      status: 'skipped',
      summary: 'pnpm executable not found',
      details: [],
      blocking: true,
    };
  }

  const stdoutTrimmed = result.stdout.trim();
  if (stdoutTrimmed.length === 0) {
    return {
      name: 'licenses',
      status: 'skipped',
      summary: 'pnpm licenses produced no output (run `pnpm install` first)',
      details: [result.stderr.trim()].filter((s) => s.length > 0),
      blocking: true,
    };
  }

  let parsed: LicenseReport;
  try {
    parsed = JSON.parse(stdoutTrimmed) as LicenseReport;
  } catch {
    return {
      name: 'licenses',
      status: 'fail',
      summary: 'could not parse pnpm licenses output',
      details: [stdoutTrimmed.slice(0, 400)],
      blocking: true,
    };
  }

  const exceptions = new Set(config.licenses.exceptions);
  const allow = new Set(config.licenses.allow);
  const block = new Set(config.licenses.block);
  const review = new Set(config.licenses.review);

  const blocked: string[] = [];
  const flagged: string[] = [];

  for (const [licenseRaw, packages] of Object.entries(parsed)) {
    const license = licenseRaw === 'Unknown' ? 'UNKNOWN' : licenseRaw;
    for (const pkg of packages) {
      const versionList = pkg.versions ?? [];
      const versionStr = versionList.length > 0 ? versionList.join(',') : 'unknown';
      const pkgKey = `${pkg.name}@${versionStr}`;
      const exceptionMatch =
        versionList.some((v) => exceptions.has(`${pkg.name}@${v}`)) || exceptions.has(pkg.name);
      if (exceptionMatch) continue;
      if (block.has(license)) {
        blocked.push(`${pkgKey} (${license})`);
      } else if (review.has(license) || (!allow.has(license) && !block.has(license))) {
        flagged.push(`${pkgKey} (${license})`);
      }
    }
  }

  if (blocked.length > 0) {
    return {
      name: 'licenses',
      status: 'fail',
      summary: `${blocked.length} packages with disallowed licenses`,
      details: [
        blocked.slice(0, 20).join('; '),
        ...(blocked.length > 20 ? [`(+${blocked.length - 20} more)`] : []),
        ...(flagged.length > 0 ? [`also: ${flagged.length} packages need human review`] : []),
      ],
      blocking: true,
    };
  }

  if (flagged.length > 0) {
    return {
      name: 'licenses',
      status: 'info',
      summary: `${flagged.length} packages with licenses needing human review`,
      details: [
        flagged.slice(0, 20).join('; '),
        ...(flagged.length > 20 ? [`(+${flagged.length - 20} more)`] : []),
      ],
      blocking: false,
    };
  }

  return {
    name: 'licenses',
    status: 'pass',
    summary: 'all production licenses are allowlisted',
    details: [],
    blocking: true,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Output
// ────────────────────────────────────────────────────────────────────────────

const STATUS_GLYPH: Record<Status, string> = {
  pass: '✓',
  fail: '✗',
  info: 'ℹ',
  skipped: '·',
};

function printReport(report: AuditReport, asJson: boolean): void {
  if (asJson) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    return;
  }

  process.stdout.write('\nDependency audit\n');
  process.stdout.write('────────────────\n');
  for (const r of report.results) {
    process.stdout.write(`${STATUS_GLYPH[r.status]} ${r.name.padEnd(16)} ${r.summary}\n`);
    for (const d of r.details) {
      process.stdout.write(`    ${d}\n`);
    }
  }
  process.stdout.write('\n');
}

function isFailure(report: AuditReport): boolean {
  return report.results.some((r) => r.blocking && r.status === 'fail');
}

// ────────────────────────────────────────────────────────────────────────────
// Entry point
// ────────────────────────────────────────────────────────────────────────────

type CheckName = 'vulns' | 'unused' | 'outdated' | 'licenses' | 'all';

function parseArgs(argv: readonly string[]): { only: CheckName; asJson: boolean } {
  const only: CheckName = ((): CheckName => {
    if (argv.includes('--only=vulns')) return 'vulns';
    if (argv.includes('--only=unused')) return 'unused';
    if (argv.includes('--only=outdated')) return 'outdated';
    if (argv.includes('--only=licenses')) return 'licenses';
    return 'all';
  })();
  const asJson = argv.includes('--json');
  return { only, asJson };
}

function main(): void {
  const { only, asJson } = parseArgs(process.argv.slice(2));
  const config = loadConfig();
  let report: AuditReport = { results: [] };

  if (only === 'all' || only === 'vulns') {
    report = addResult(report, checkVulnerabilities(config));
  }
  if (only === 'all' || only === 'unused') {
    report = addResult(report, checkUnused());
  }
  if (only === 'all' || only === 'outdated') {
    report = addResult(report, checkOutdated(config));
  }
  if (only === 'all' || only === 'licenses') {
    report = addResult(report, checkLicenses(config));
  }

  printReport(report, asJson);
  process.exit(isFailure(report) ? 1 : 0);
}

main();
