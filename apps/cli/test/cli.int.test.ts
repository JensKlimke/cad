/**
 * Integration tests for the `cad` binary.
 *
 * Spawns the built launcher (`bin/cad.js`) as a subprocess and asserts on
 * its stdout/stderr/exit. Depends on a prior `pnpm build` — Turbo's
 * `^build` DAG in `turbo.json` guarantees this when the tests run through
 * `pnpm test` rather than `vitest` directly.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(HERE, '..');
const BIN_PATH = path.join(PACKAGE_ROOT, 'bin', 'cad.js');
const DIST_ENTRY = path.join(PACKAGE_ROOT, 'dist', 'index.js');

/** Preflight: fail loudly if the build artifact is missing. */
function requireBuild(): void {
  if (!existsSync(DIST_ENTRY)) {
    throw new Error(
      `@cad/cli integration tests require \`pnpm --filter @cad/cli build\` first; ` +
        `missing ${DIST_ENTRY}. Run \`pnpm test\` (via Turbo) so the build runs automatically.`,
    );
  }
}

function runCad(args: readonly string[]): string {
  requireBuild();
  return execFileSync(process.execPath, [BIN_PATH, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function runCadDetailed(args: readonly string[]): { readonly status: number | null; readonly stdout: string; readonly stderr: string } {
  requireBuild();
  const result = spawnSync(process.execPath, [BIN_PATH, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

describe('cad binary', () => {
  it('prints a human-readable version table with no arguments', () => {
    const stdout = runCad([]);
    expect(stdout).toMatch(/^cad\s+\d+\.\d+\.\d+/u);
    expect(stdout).toMatch(/@cad\/kernel\s+\d+\.\d+\.\d+/u);
    expect(stdout).toMatch(/occt\s+replicad-opencascadejs@\d+\.\d+\.\d+/u);
    expect(stdout).toMatch(/node\s+v\d+\.\d+\.\d+/u);
  });

  it('prints the same table for `cad version`', () => {
    const bare = runCad([]);
    const explicit = runCad(['version']);
    expect(explicit).toBe(bare);
  });

  it('prints parseable JSON for `cad version --json`', () => {
    const stdout = runCad(['version', '--json']);
    const parsed = JSON.parse(stdout) as Record<string, unknown>;
    expect(parsed['cad']).toMatch(/^\d+\.\d+\.\d+/u);
    expect(parsed['kernel']).toMatch(/^\d+\.\d+\.\d+/u);
    expect(parsed['occt']).toMatch(/^replicad-opencascadejs@/u);
    expect(parsed['node']).toBe(process.version);
  });

  it('prints only the CLI version when given `--version`', () => {
    const stdout = runCad(['--version']);
    expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+/u);
    expect(stdout).not.toContain('@cad/kernel');
  });

  it('builds a document.ts file and prints deterministic JSON', () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), 'cad-cli-build-'));
    const documentPath = path.join(tempDir, 'document.ts');
    writeFileSync(
      documentPath,
      `import { body, defineDocument, pad, parameters, reference } from '@cad/sdk';

export default defineDocument({
  parameters: parameters({
    width: { kind: 'number', value: 12, unit: 'mm' },
    depth: { kind: 'number', value: 18, unit: 'mm' },
    height: { kind: 'number', value: 24, unit: 'mm' },
  }),
  body: body([
    pad({ id: 'pad_1', width: reference('width'), depth: reference('depth'), height: reference('height') }),
  ]),
});
`,
      'utf8',
    );

    try {
      const stdout = runCad(['build', documentPath]);
      const parsed = JSON.parse(stdout) as {
        documentHash: string;
        parameterOrder: string[];
        features: Array<{ kind: string; id: string }>;
        tessellation: { metadata: { hash: string; triangleCount: number } };
      };
      expect(parsed.documentHash).toMatch(/^[a-f0-9]{64}$/u);
      expect(parsed.parameterOrder).toEqual(['width', 'depth', 'height']);
      expect(parsed.features).toEqual([
        expect.objectContaining({ id: 'pad_1', kind: 'pad' }),
      ]);
      expect(parsed.tessellation.metadata.hash).toMatch(/^[a-f0-9]{64}$/u);
      expect(parsed.tessellation.metadata.triangleCount).toBeGreaterThan(0);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('fails with exit code 1 for a missing build path', () => {
    const result = runCadDetailed(['build', '/definitely/missing/document.ts']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('cad:');
    expect(result.stderr).toContain('ENOENT');
  });

  it('fails with structured diagnostics for invalid source', () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), 'cad-cli-build-fail-'));
    const documentPath = path.join(tempDir, 'document.ts');
    writeFileSync(
      documentPath,
      `import fs from 'node:fs';

export default fs;
`,
      'utf8',
    );

    try {
      const result = runCadDetailed(['build', documentPath]);
      expect(result.status).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain('runtime.unsupported_import');
      expect(result.stderr).toContain('Only "@cad/sdk" imports are allowed');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
