import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ExprError } from '@cad/expr';
import { createHandleFromEntity, resolveHandle } from '@cad/references';
import {
  body,
  defineDocument,
  feature,
  literal,
  pad,
  parameters,
  reference,
  sketch,
} from '@cad/sdk';
import { describe, expect, it } from 'vitest';

import { buildDocument } from '../src/build.js';
import { normalizeRuntimeError, runtimeError } from '../src/errors.js';
import { executeDocument, readSlice2Fixture } from '../src/index.js';
import { assertSourceSafe, executeInSandbox } from '../src/sandbox.js';

import type { RuntimeBuildError } from '../src/errors.js';
import type { RuntimeOptions } from '../src/index.js';
import type { WorkerRequest } from '../src/sandbox.js';

const FIXTURE_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'tests',
  'fixtures',
  'slice-2',
);
const DEFAULT_SKETCH_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-20 -20 120 90" data-cad-plane="xy" data-cad-kind="rectangle">  <rect x="0" y="0" width="80" height="50" fill="none" stroke="currentColor" stroke-width="1" /></svg>';
const DEFAULT_SKETCH_CONSTRAINTS = {
  kind: 'rectangle' as const,
  anchor: 'origin' as const,
  width: { kind: 'literal' as const, value: 80, unit: 'mm' as const },
  height: { kind: 'literal' as const, value: 50, unit: 'mm' as const },
};

async function readFixture(name: string): Promise<string> {
  return readFile(path.join(FIXTURE_DIR, name), 'utf8');
}

function sandboxRequest(source: string, options: RuntimeOptions = {}): WorkerRequest {
  return {
    source,
    options: {
      timeoutMs: options.timeoutMs ?? 5000,
      memoryMb: options.memoryMb ?? 128,
    },
  };
}

describe('@cad/runtime', () => {
  it('executes a valid document and returns tessellation', async () => {
    const validDocument = await readFixture('valid-pad.document.ts');
    const result = await executeDocument(validDocument);
    expect(result.parameters.width).toMatchObject({ value: 10, unit: 'mm' });
    expect(result.tessellation?.metadata.hash).toHaveLength(64);
    expect(result.features).toEqual([
      expect.objectContaining({ id: 'sketch_1', kind: 'sketch' }),
      expect.objectContaining({ id: 'pad_1', kind: 'pad' }),
    ]);
    expect(result.topology.entities.map((entity) => entity.constructionPath)).toEqual([
      'sketch_1.sketch.plane',
      'pad_1.face.bottom',
      'pad_1.face.top',
      'pad_1.face.xMin',
      'pad_1.face.xMax',
      'pad_1.face.yMin',
      'pad_1.face.yMax',
    ]);
    expect(
      result.topology.entities.find((entity) => entity.constructionPath === 'pad_1.face.top'),
    ).toMatchObject({
      kind: 'face',
      featureId: 'pad_1',
      label: 'Top face',
    });
  });

  it('produces the same hashes for repeated builds of the same source', async () => {
    const validDocument = await readFixture('valid-pad.document.ts');
    const first = await executeDocument(validDocument);
    const second = await executeDocument(validDocument);

    expect(second.documentHash).toBe(first.documentHash);
    expect(second.tessellation?.metadata.hash).toBe(first.tessellation?.metadata.hash);
    expect(second.features).toEqual(first.features);
    expect(second.topology).toEqual(first.topology);
  });

  it('keeps semantic face handles resolvable across upstream dimension edits', async () => {
    const validDocument = await readFixture('valid-pad.document.ts');
    const first = await executeDocument(validDocument);
    const topFace = first.topology.entities.find(
      (entity) => entity.constructionPath === 'pad_1.face.top',
    );
    expect(topFace).toBeDefined();
    if (topFace === undefined) {
      throw new Error('Expected pad_1.face.top topology entity.');
    }
    const handle = createHandleFromEntity(topFace);

    const edited = await executeDocument(
      validDocument.replace(
        "width: { kind: 'number', value: 10, unit: 'mm' }",
        "width: { kind: 'number', value: 16, unit: 'mm' }",
      ),
    );
    const resolved = resolveHandle(handle, edited.topology);

    expect(resolved.ok).toBe(true);
    expect(resolved.layer).toBe('construction');
    expect(resolved.entity?.constructionPath).toBe('pad_1.face.top');
  });

  it('supports fixture documents with sketches plus pads', async () => {
    const source = await readFixture('valid-sketch-pad.document.ts');
    const result = await executeDocument(source);

    expect(result.features).toEqual([
      expect.objectContaining({ id: 'sketch_1', kind: 'sketch' }),
      expect.objectContaining({ id: 'pad_2', kind: 'pad' }),
    ]);
  });

  it('rejects unsupported imports', async () => {
    const source = await readFixture('unsupported-import.document.ts');
    await expect(executeDocument(source)).rejects.toMatchObject({
      code: 'runtime.unsupported_import',
    } satisfies Partial<RuntimeBuildError>);
  });

  it('supports sketch-only documents without tessellation', async () => {
    const source = await readFixture('sketch-only.document.ts');
    const result = await executeDocument(source);
    expect(result.tessellation).toBeNull();
    expect(result.features[0]).toMatchObject({
      kind: 'sketch',
      sketch: {
        status: 'fully_constrained',
      },
    });
  });

  it('enforces timeouts', async () => {
    const source = await readFixture('timeout.document.ts');
    await expect(executeDocument(source, { timeoutMs: 50 })).rejects.toMatchObject({
      code: 'runtime.timeout',
    } satisfies Partial<RuntimeBuildError>);
  });

  it('surfaces expression cycles as structured diagnostics', async () => {
    const source = await readFixture('expr-cycle.document.ts');
    await expect(executeDocument(source)).rejects.toMatchObject({
      code: 'expr.cycle',
      diagnostics: [expect.objectContaining({ code: 'expr.cycle' })],
    });
  });

  it('surfaces unit mismatches as structured diagnostics', async () => {
    const source = await readFixture('expr-unit-mismatch.document.ts');
    await expect(executeDocument(source)).rejects.toMatchObject({
      code: 'expr.unit_mismatch',
      diagnostics: [expect.objectContaining({ code: 'expr.unit_mismatch' })],
    });
  });

  it('builds sketch and pad features directly without the worker wrapper', async () => {
    const document = defineDocument({
      parameters: parameters({
        width: { value: 10, unit: 'mm' },
        height: { expression: 'width / 2', unit: 'mm' },
      }),
      body: body([
        sketch({
          id: 'sketch_1',
          plane: 'yz',
          svg: DEFAULT_SKETCH_SVG,
          constraints: DEFAULT_SKETCH_CONSTRAINTS,
        }),
        pad({
          id: 'pad_1',
          sketch: feature('sketch_1'),
          length: literal(6, 'mm'),
          direction: 'down',
        }),
      ]),
    });

    const result = await buildDocument(document);

    expect(result.parameterOrder).toEqual(['width', 'height']);
    expect(result.features).toEqual([
      expect.objectContaining({ id: 'sketch_1', kind: 'sketch', cached: false }),
      expect.objectContaining({
        id: 'pad_1',
        kind: 'pad',
        cached: false,
        pad: expect.objectContaining({ sketch: 'sketch_1', length: 6, direction: 'down' }),
      }),
    ]);
    expect(result.tessellation?.metadata.vertexCount).toBeGreaterThan(0);
  });

  it('rejects missing feature parameters and non-millimetre geometry units', async () => {
    await expect(
      buildDocument(
        defineDocument({
          parameters: parameters({}),
          body: body([
            sketch({
              id: 'sketch_1',
              plane: 'xy',
              svg: DEFAULT_SKETCH_SVG,
              constraints: DEFAULT_SKETCH_CONSTRAINTS,
            }),
            pad({
              sketch: feature('sketch_1'),
              length: reference('missing'),
              direction: 'up',
            }),
          ]),
        }),
      ),
    ).rejects.toMatchObject({
      code: 'runtime.unknown_parameter',
      diagnostics: [expect.objectContaining({ code: 'runtime.unknown_parameter' })],
    } satisfies Partial<RuntimeBuildError>);

    await expect(
      buildDocument(
        defineDocument({
          parameters: parameters({ angle: { value: 90, unit: 'deg' } }),
          body: body([
            sketch({
              id: 'sketch_1',
              plane: 'xy',
              svg: DEFAULT_SKETCH_SVG,
              constraints: DEFAULT_SKETCH_CONSTRAINTS,
            }),
            pad({
              sketch: feature('sketch_1'),
              length: reference('angle'),
              direction: 'up',
            }),
          ]),
        }),
      ),
    ).rejects.toMatchObject({
      code: 'runtime.invalid_geometry_unit',
      diagnostics: [expect.objectContaining({ context: { unit: 'deg' } })],
    } satisfies Partial<RuntimeBuildError>);
  });

  it('normalizes runtime, expression, error, and primitive failures', () => {
    const existing = runtimeError('runtime.timeout', 'timed out', [
      { code: 'runtime.timeout', message: 'timed out' },
    ]);
    expect(normalizeRuntimeError(existing)).toBe(existing);

    const fromExpr = normalizeRuntimeError(
      new ExprError({
        code: 'expr.syntax',
        message: 'bad expression',
        range: { start: 1, end: 2 },
        path: ['width'],
      }),
    );
    expect(fromExpr).toMatchObject({
      code: 'expr.syntax',
      diagnostics: [{ code: 'expr.syntax', range: { start: 1, end: 2 }, path: ['width'] }],
    });

    expect(normalizeRuntimeError(new Error('boom'))).toMatchObject({
      code: 'runtime.execution_failed',
      diagnostics: [{ code: 'runtime.execution_failed', message: 'boom' }],
    });
    expect(normalizeRuntimeError('boom')).toMatchObject({
      code: 'runtime.execution_failed',
      diagnostics: [{ code: 'runtime.execution_failed', message: 'boom' }],
    });
  });

  it('reads the committed Slice 2 fixture corpus', async () => {
    await expect(readSlice2Fixture('valid-pad.document.ts')).resolves.toContain('defineDocument');
  });

  it('rejects unsupported imports and top-level declarations before compilation', () => {
    expect(() => assertSourceSafe("import fs from 'node:fs';\nexport default {};\n")).toThrowError(
      expect.objectContaining({ code: 'runtime.unsupported_import' }),
    );
    expect(() =>
      assertSourceSafe(`
        import { defineDocument } from '@cad/sdk';
        class Disallowed {}
        export default defineDocument({ parameters: { kind: 'parameters', entries: {} }, body: { kind: 'body', features: [] } });
      `),
    ).toThrowError(expect.objectContaining({ code: 'runtime.unsupported_toplevel' }));
  });

  it('returns structured compile and export errors from the sandbox module', async () => {
    await expect(
      executeInSandbox(
        sandboxRequest(`
          import { defineDocument } from '@cad/sdk';
          export default defineDocument(
        `),
      ),
    ).resolves.toMatchObject({
      ok: false,
      error: {
        code: 'build.compile_failed',
        diagnostics: [expect.objectContaining({ code: 'build.compile_failed' })],
      },
    });

    await expect(
      executeInSandbox(
        sandboxRequest(`
          import { body, parameters } from '@cad/sdk';
          export default {
            kind: 'not-a-document',
            parameters: parameters({}),
            body: body([]),
          };
        `),
      ),
    ).resolves.toMatchObject({
      ok: false,
      error: {
        code: 'runtime.execution_failed',
        diagnostics: [expect.objectContaining({ code: 'runtime.execution_failed' })],
      },
    });
  });
});
