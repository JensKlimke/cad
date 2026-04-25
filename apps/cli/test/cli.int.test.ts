/**
 * Integration tests for the `cad` binary.
 *
 * Spawns the built launcher (`bin/cad.js`) as a subprocess and asserts on
 * its stdout/stderr/exit. Depends on a prior `pnpm build` — Turbo's
 * `^build` DAG in `turbo.json` guarantees this when the tests run through
 * `pnpm test` rather than `vitest` directly.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
      `import { body, defineDocument, feature, pad, parameters, reference, sketch } from '@cad/sdk';

export default defineDocument({
  parameters: parameters({
    width: { kind: 'number', value: 12, unit: 'mm' },
    depth: { kind: 'number', value: 18, unit: 'mm' },
    height: { kind: 'number', value: 24, unit: 'mm' },
  }),
  body: body([
    sketch({
      id: 'sketch_1',
      plane: 'xy',
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-20 -20 120 90" data-cad-plane="xy" data-cad-kind="rectangle">  <rect x="0" y="0" width="12" height="18" fill="none" stroke="currentColor" stroke-width="1" /></svg>',
      constraints: {
        kind: 'rectangle',
        anchor: 'origin',
        width: { kind: 'reference', name: 'width' },
        height: { kind: 'reference', name: 'depth' },
      },
    }),
    pad({ id: 'pad_1', sketch: feature('sketch_1'), length: reference('height'), direction: 'up' }),
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
        expect.objectContaining({ id: 'sketch_1', kind: 'sketch' }),
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

  it('exports a built document as STL', () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), 'cad-cli-export-'));
    const documentPath = path.join(tempDir, 'document.ts');
    const outputPath = path.join(tempDir, 'spacer.stl');
    writeFileSync(
      documentPath,
      `import { body, defineDocument, feature, pad, parameters, reference, sketch } from '@cad/sdk';

export default defineDocument({
  parameters: parameters({
    width: { kind: 'number', value: 12, unit: 'mm' },
    depth: { kind: 'number', value: 18, unit: 'mm' },
    height: { kind: 'number', value: 24, unit: 'mm' },
  }),
  body: body([
    sketch({
      id: 'sketch_1',
      plane: 'xy',
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-20 -20 120 90" data-cad-plane="xy" data-cad-kind="rectangle">  <rect x="0" y="0" width="12" height="18" fill="none" stroke="currentColor" stroke-width="1" /></svg>',
      constraints: {
        kind: 'rectangle',
        anchor: 'origin',
        width: { kind: 'reference', name: 'width' },
        height: { kind: 'reference', name: 'depth' },
      },
    }),
    pad({ id: 'pad_1', sketch: feature('sketch_1'), length: reference('height'), direction: 'up' }),
  ]),
});
`,
      'utf8',
    );

    try {
      const stdout = runCad(['export', documentPath, '--output', outputPath]);
      expect(stdout.trim()).toBe(outputPath);
      expect(existsSync(outputPath)).toBe(true);
      const stl = readFileSync(outputPath);
      expect(stl.byteLength).toBeGreaterThan(84);
      expect(stl.subarray(0, 5).toString('ascii')).not.toBe('solid');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('lists handbook topics from the terminal', () => {
    const stdout = runCad(['docs', 'list']);
    expect(stdout).toContain('/handbook/features/pad');
    expect(stdout).toContain('/handbook/faq/getting-help');
  });

  it('searches handbook topics from the terminal', () => {
    const stdout = runCad(['docs', 'search', 'pad']);
    expect(stdout).toContain('/handbook/features/pad');
  });

  it('renders a handbook topic in the terminal', () => {
    const stdout = runCad(['docs', '/handbook/features/pad']);
    expect(stdout).toContain('Pad');
    expect(stdout).toContain('Dual-write behavior');
  });
});
