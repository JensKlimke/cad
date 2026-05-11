import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  applyAuthoringOp,
  findNodeSelectionAtOffset,
  getNodeRange,
  parseDocument,
  printDocument,
} from '../src/index.js';

const FIXTURE_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'tests',
  'fixtures',
  'slice-2',
);
const DEFAULT_SKETCH = {
  kind: 'sketch' as const,
  id: 'sketch_1',
  plane: 'xy' as const,
  svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-20 -20 120 90" data-cad-plane="xy" data-cad-kind="rectangle">  <rect x="0" y="0" width="80" height="50" fill="none" stroke="currentColor" stroke-width="1" /></svg>',
  geometry: {
    kind: 'rectangle' as const,
    x: 0,
    y: 0,
    width: 80,
    height: 50,
  },
  constraints: {
    kind: 'rectangle' as const,
    anchor: 'origin' as const,
    width: { kind: 'literal' as const, value: 80, unit: 'mm' as const },
    height: { kind: 'literal' as const, value: 50, unit: 'mm' as const },
  },
};

async function readFixture(name: string): Promise<string> {
  return readFile(path.join(FIXTURE_DIR, name), 'utf8');
}

describe('@cad/authoring', () => {
  it('round-trips canonical fixture documents', async () => {
    for (const fixture of await Promise.all([
      readFixture('valid-pad.document.ts'),
      readFixture('valid-sketch-pad.document.ts'),
    ])) {
      const ast = parseDocument(fixture);
      const printed = await printDocument(ast);
      expect(printed).toBe(fixture);
    }
  });

  it('renames parameters and updates feature references', async () => {
    const ast = parseDocument(await readFixture('valid-pad.document.ts'));
    const next = applyAuthoringOp(ast, {
      kind: 'parameter.rename',
      id: ast.parameters[0]!.id,
      newName: 'plateWidth',
    });

    const printed = await printDocument(next);
    expect(printed).toContain('plateWidth');
    expect(printed).toContain("width: { kind: 'reference', name: 'plateWidth' }");
  });

  it('applies feature insertion and reordering codemods while staying printable', async () => {
    const ast = parseDocument(await readFixture('valid-sketch-pad.document.ts'));
    const withFeature = applyAuthoringOp(ast, {
      kind: 'feature.add',
      index: 1,
      feature: {
        kind: 'pad',
        id: 'pad_1',
        sketch: 'sketch_1',
        length: { kind: 'literal', value: 6, unit: 'mm' },
        direction: 'up',
      },
    });
    const reordered = applyAuthoringOp(withFeature, {
      kind: 'feature.reorder',
      id: 'pad_1',
      index: 0,
    });

    const printed = await printDocument(reordered);
    const reparsed = parseDocument(printed);
    expect(reparsed.features[0]).toMatchObject({ id: 'pad_1', kind: 'pad' });
    expect(reparsed.features).toHaveLength(3);
  });

  it('covers parameter and feature CRUD codemods with canonical definitions', async () => {
    const ast = parseDocument(await readFixture('valid-pad.document.ts'));
    const withAddedParameter = applyAuthoringOp(ast, {
      kind: 'parameter.add',
      parameter: {
        name: 'thickness',
        definition: { value: 20, unit: 'mm' },
      },
    });
    const addedParameter = withAddedParameter.parameters.at(-1)!;
    const withUpdatedParameter = applyAuthoringOp(withAddedParameter, {
      kind: 'parameter.update',
      id: addedParameter.id,
      parameter: {
        id: addedParameter.id,
        name: 'thickness',
        definition: { expression: 'width * 2', unit: 'mm' },
      },
    });
    const withRemovedParameter = applyAuthoringOp(withUpdatedParameter, {
      kind: 'parameter.remove',
      id: addedParameter.id,
    });
    const withUpdatedFeature = applyAuthoringOp(withRemovedParameter, {
      kind: 'feature.update',
      id: 'pad_1',
      feature: {
        kind: 'pad',
        id: 'pad_1',
        sketch: 'sketch_1',
        length: { kind: 'expression', source: 'width / 2', unit: 'mm' },
        direction: 'symmetric',
      },
    });
    const withRemovedFeature = applyAuthoringOp(withUpdatedFeature, {
      kind: 'feature.remove',
      id: 'pad_1',
    });

    expect(withAddedParameter.parameters).toHaveLength(4);
    expect(withUpdatedParameter.parameters.at(-1)).toMatchObject({
      name: 'thickness',
      definition: { kind: 'expression', expression: 'width * 2', unit: 'mm' },
    });
    const printedParameterUpdate = await printDocument(withUpdatedParameter);
    expect(printedParameterUpdate).toContain(
      "thickness: { kind: 'expression', expression: 'width * 2', unit: 'mm' }",
    );
    expect(withRemovedParameter.parameters).toHaveLength(3);
    expect(withUpdatedFeature.features[1]).toMatchObject({
      kind: 'pad',
      sketch: 'sketch_1',
      length: { kind: 'expression', source: 'width / 2', unit: 'mm' },
      direction: 'symmetric',
    });
    expect(withRemovedFeature.features).toHaveLength(1);
  });

  it('keeps no-op codemods stable and clamps feature insertion indexes', async () => {
    const ast = parseDocument(await readFixture('valid-sketch-pad.document.ts'));
    const appended = applyAuthoringOp(ast, {
      kind: 'feature.add',
      index: 99,
      feature: { ...DEFAULT_SKETCH, id: 'sketch_3' },
    });
    const prepended = applyAuthoringOp(ast, {
      kind: 'feature.add',
      index: -5,
      feature: { ...DEFAULT_SKETCH, id: 'sketch_0' },
    });
    const reorderMissing = applyAuthoringOp(ast, {
      kind: 'feature.reorder',
      id: 'missing_feature',
      index: 0,
    });
    const renameSketchParameter = applyAuthoringOp(ast, {
      kind: 'parameter.rename',
      id: ast.parameters[0]!.id,
      newName: 'renamedWidth',
    });

    expect(appended.features.at(-1)).toMatchObject({ id: 'sketch_3', kind: 'sketch' });
    expect(prepended.features[0]).toMatchObject({ id: 'sketch_0', kind: 'sketch' });
    expect(reorderMissing).toEqual(ast);
    expect(renameSketchParameter.features[0]).toMatchObject({ id: 'sketch_1', kind: 'sketch' });
  });

  it('finds parameter and feature selections from source offsets', async () => {
    const source = await readFixture('valid-pad.document.ts');
    const ast = parseDocument(source);

    expect(
      findNodeSelectionAtOffset(ast, source.indexOf("width: { kind: 'number', value")),
    ).toEqual({
      kind: 'parameter',
      id: ast.parameters[0]!.id,
    });
    expect(findNodeSelectionAtOffset(ast, source.indexOf("pad({ id: 'pad_1'"))).toEqual({
      kind: 'feature',
      id: 'pad_1',
    });
    expect(findNodeSelectionAtOffset(ast, -1)).toBeNull();
    expect(getNodeRange(ast, null)).toBeNull();
    expect(getNodeRange(ast, { kind: 'parameter', id: ast.parameters[0]!.id })).toEqual(
      ast.parameters[0]!.range,
    );
    expect(getNodeRange(ast, { kind: 'feature', id: 'pad_1' })).toEqual(
      ast.features.find((feature) => feature.id === 'pad_1')!.range,
    );
    expect(getNodeRange(ast, { kind: 'parameter', id: 'missing' })).toBeNull();
    expect(getNodeRange(ast, { kind: 'feature', id: 'missing' })).toBeNull();
  });

  it('rejects unsupported top-level shapes during parse', async () => {
    await expect(readFixture('unsupported-import.document.ts').then(parseDocument)).rejects.toThrow(
      /expected `export default defineDocument/u,
    );
  });

  it('rejects invalid document and parameter shapes during parse', () => {
    expect(() => parseDocument('export default {};\n')).toThrow(
      /expected `export default defineDocument/u,
    );
    expect(() => parseDocument('export default defineDocument([]);\n')).toThrow(
      /defineDocument expects an object literal/u,
    );
    expect(() =>
      parseDocument(`
        export default defineDocument({
          parameters: {},
          body: body([]),
        });
      `),
    ).toThrow(/property "parameters" must be a call expression/u);
    expect(() =>
      parseDocument(`
        export default defineDocument({
          parameters: parameters([]),
          body: body([]),
        });
      `),
    ).toThrow(/parameters\(\.\.\.\) expects an object literal/u);
    expect(() =>
      parseDocument(`
        export default defineDocument({
          parameters: parameters({
            width: { value: 1, expression: '2', unit: 'mm' },
          }),
          body: body([]),
        });
      `),
    ).toThrow(/cannot include both `value` and `expression`/u);
    expect(() =>
      parseDocument(`
        export default defineDocument({
          parameters: parameters({
            width: { kind: true, value: 1, unit: 'mm' },
          }),
          body: body([]),
        });
      `),
    ).toThrow(/`kind` must be a string literal/u);
    expect(() =>
      parseDocument(`
        export default defineDocument({
          parameters: parameters({
            width: { value: size, unit: 'mm' },
          }),
          body: body([]),
        });
      `),
    ).toThrow(/parameter `value` must be numeric/u);
    expect(() =>
      parseDocument(`
        export default defineDocument({
          parameters: parameters({
            width: { expression: width, unit: 'mm' },
          }),
          body: body([]),
        });
      `),
    ).toThrow(/must include `value` or string literal `expression`/u);
  });

  it('rejects invalid body and feature shapes during parse', () => {
    expect(() =>
      parseDocument(`
        export default defineDocument({
          parameters: parameters({}),
          body: body({}),
        });
      `),
    ).toThrow(/body\(\.\.\.\) expects an array literal/u);
    expect(() =>
      parseDocument(`
        export default defineDocument({
          parameters: parameters({}),
          body: body([width]),
        });
      `),
    ).toThrow(/body features must be call expressions/u);
    expect(() =>
      parseDocument(`
        export default defineDocument({
          parameters: parameters({}),
          body: body([extrude({})]),
        });
      `),
    ).toThrow(/only pad\(\.\.\.\) and sketch\(\.\.\.\) features are supported/u);
    expect(() =>
      parseDocument(`
        export default defineDocument({
          parameters: parameters({}),
          body: body([sketch('xy')]),
        });
      `),
    ).toThrow(/sketch config must be an object literal/u);
    expect(() =>
      parseDocument(`
        export default defineDocument({
          parameters: parameters({}),
          body: body([pad({ length: 2 })]),
        });
      `),
    ).toThrow(/missing required property "sketch"/u);
  });

  it('parses supported scalar input forms and rejects unsupported ones', () => {
    const parsed = parseDocument(`
      export default defineDocument({
        parameters: parameters({}),
        body: body([
          sketch({
            svg: '${DEFAULT_SKETCH.svg}',
            constraints: {
              kind: 'rectangle',
              anchor: 'origin',
              width: { kind: 'literal', value: 80, unit: 'mm' },
              height: { kind: 'literal', value: 50, unit: 'mm' },
            },
          }),
          pad({
            sketch: feature("sketch_1"),
            length: expression("width / 2", "mm"),
            direction: "up",
          }),
          pad({
            id: "pad_3",
            sketch: { kind: "feature", id: "sketch_1" },
            length: 4,
            direction: "down",
          }),
        ]),
      });
    `);

    expect(parsed.features).toMatchObject([
      { kind: 'sketch', id: 'sketch_1', plane: 'xy' },
      {
        kind: 'pad',
        id: 'pad_2',
        sketch: 'sketch_1',
        length: { kind: 'expression', source: 'width / 2', unit: 'mm' },
        direction: 'up',
      },
      {
        kind: 'pad',
        id: 'pad_3',
        sketch: 'sketch_1',
        length: { kind: 'literal', value: 4, unit: 'mm' },
        direction: 'down',
      },
    ]);

    expect(() =>
      parseDocument(`
        export default defineDocument({
          parameters: parameters({}),
          body: body([
            pad({
              sketch: feature('sketch_1'),
              length: { unit: 'mm' },
              direction: 'up',
            }),
          ]),
        });
      `),
    ).toThrow(/unsupported scalar input/u);
  });

  it('rejects malformed feature references, scalar helpers, and directions', () => {
    expect(() =>
      parseDocument(`
        export default defineDocument({
          parameters: parameters({}),
          body: body([
            pad({
              sketch: { kind: true, id: 'sketch_1' },
              length: 4,
              direction: 'up',
            }),
          ]),
        });
      `),
    ).toThrow(/feature reference kind must be a string literal/u);
    expect(() =>
      parseDocument(`
        export default defineDocument({
          parameters: parameters({}),
          body: body([
            pad({
              sketch: feature(),
              length: 4,
              direction: 'up',
            }),
          ]),
        });
      `),
    ).toThrow(/pad sketch reference must be/u);
    expect(() =>
      parseDocument(`
        export default defineDocument({
          parameters: parameters({}),
          body: body([
            pad({
              sketch: 'sketch_1',
              length: reference(),
              direction: 'up',
            }),
          ]),
        });
      `),
    ).toThrow(/unsupported scalar input/u);
    expect(() =>
      parseDocument(`
        export default defineDocument({
          parameters: parameters({}),
          body: body([
            pad({
              sketch: 'sketch_1',
              length: expression('width / 2'),
              direction: 'up',
            }),
          ]),
        });
      `),
    ).toThrow(/unsupported scalar input/u);
    expect(() =>
      parseDocument(`
        export default defineDocument({
          parameters: parameters({}),
          body: body([
            pad({
              sketch: 'sketch_1',
              length: literal(4),
              direction: 'up',
            }),
          ]),
        });
      `),
    ).toThrow(/unsupported scalar input/u);
    expect(() =>
      parseDocument(`
        export default defineDocument({
          parameters: parameters({}),
          body: body([
            pad({
              sketch: 'sketch_1',
              length: 4,
              direction: 'sideways',
            }),
          ]),
        });
      `),
    ).toThrow(/pad direction must be `up`, `down`, or `symmetric`/u);
    expect(() =>
      parseDocument(`
        export default defineDocument({
          parameters: parameters({}),
          body: body([
            pad({
              sketch: 'sketch_1',
              length: 4,
              direction: true,
            }),
          ]),
        });
      `),
    ).toThrow(/pad direction must be a string literal/u);
  });

  it('parses optional ids, planes, directions, and scalar helper variants', () => {
    const parsed = parseDocument(`
      export default defineDocument({
        parameters: parameters({
          width: { kind: 'number', value: -4, unit: 'mm' },
        }),
        body: body([
          sketch({
            id: 'sketch_explicit',
            plane: 'xz',
            svg: ${JSON.stringify(DEFAULT_SKETCH.svg)},
            constraints: {
              kind: 'rectangle',
              anchor: 'origin',
              width: 80,
              height: { kind: 'reference', name: 'width' },
            },
          }),
          pad({
            sketch: 'sketch_explicit',
            length: reference('width'),
          }),
          pad({
            sketch: 'sketch_explicit',
            length: 'width',
            direction: 'down',
          }),
          pad({
            sketch: feature('sketch_explicit'),
            length: literal(6, 'mm'),
            direction: 'symmetric',
          }),
        ]),
      });
    `);

    expect(parsed.parameters[0]).toMatchObject({
      definition: { kind: 'number', value: -4, unit: 'mm' },
    });
    expect(parsed.features[0]).toMatchObject({
      kind: 'sketch',
      id: 'sketch_explicit',
      plane: 'xz',
    });
    expect(parsed.features[1]).toMatchObject({
      kind: 'pad',
      id: 'pad_2',
      sketch: 'sketch_explicit',
      length: { kind: 'reference', name: 'width' },
      direction: 'up',
    });
    expect(parsed.features[2]).toMatchObject({
      kind: 'pad',
      id: 'pad_3',
      length: { kind: 'reference', name: 'width' },
      direction: 'down',
    });
    expect(parsed.features[3]).toMatchObject({
      kind: 'pad',
      id: 'pad_4',
      length: { kind: 'literal', value: 6, unit: 'mm' },
      direction: 'symmetric',
    });
  });

  it('prints persisted sketch features', async () => {
    const printed = await printDocument({
      parameters: [],
      features: [DEFAULT_SKETCH],
    });

    expect(printed).toContain('sketch({');
    expect(printed).toContain("plane: 'xy'");
    expect(printed).toContain('constraints:');
  });

  it('prints expression pad lengths and expression sketch constraints', async () => {
    const printed = await printDocument({
      parameters: [],
      features: [
        {
          ...DEFAULT_SKETCH,
          constraints: {
            kind: 'rectangle',
            anchor: 'origin',
            width: { kind: 'expression', source: 'width + 1', unit: 'mm' },
            height: { kind: 'reference', name: 'depth' },
          },
        },
        {
          kind: 'pad',
          id: 'pad_1',
          sketch: 'sketch_1',
          length: { kind: 'expression', source: 'height + 2', unit: 'mm' },
          direction: 'down',
        },
      ],
    });

    expect(printed).toContain('expression');
    expect(printed).toContain("length: expression('height + 2', 'mm')");
    expect(printed).toContain("source: 'width + 1'");
  });

  it('keeps missing rename/update/reorder operations stable', async () => {
    const ast = parseDocument(await readFixture('valid-sketch-pad.document.ts'));
    expect(
      applyAuthoringOp(ast, {
        kind: 'parameter.rename',
        id: 'missing',
        newName: 'ignored',
      }),
    ).toBe(ast);
    expect(
      applyAuthoringOp(ast, {
        kind: 'feature.reorder',
        id: 'missing',
        index: 0,
      }),
    ).toBe(ast);

    const withMissingFeatureUpdate = applyAuthoringOp(ast, {
      kind: 'feature.update',
      id: 'missing',
      feature: {
        kind: 'pad',
        id: 'pad_missing',
        sketch: 'sketch_1',
        length: { kind: 'literal', value: 3, unit: 'mm' },
        direction: 'up',
      },
    });
    expect(withMissingFeatureUpdate.features).toEqual(ast.features);
  });

  it('updates sketch ids and dependent pad references together', async () => {
    const ast = parseDocument(await readFixture('valid-sketch-pad.document.ts'));
    const updated = applyAuthoringOp(ast, {
      kind: 'feature.update',
      id: 'sketch_1',
      feature: {
        ...DEFAULT_SKETCH,
        id: 'sketch_renamed',
      },
    });

    expect(updated.features[0]).toMatchObject({ id: 'sketch_renamed' });
    expect(updated.features[1]).toMatchObject({ sketch: 'sketch_renamed' });
  });

  it('rejects invalid sketch constraint values during parse', () => {
    expect(() =>
      parseDocument(`
        export default defineDocument({
          parameters: parameters({}),
          body: body([
            sketch({
              id: 'sketch_1',
              svg: ${JSON.stringify(DEFAULT_SKETCH.svg)},
              constraints: {
                kind: 'rectangle',
                anchor: 'origin',
                width: { kind: 'literal', value: 'bad', unit: 'mm' },
                height: 10,
              },
            }),
          ]),
        });
      `),
    ).toThrow(/sketch literal value must be numeric/u);
    expect(() =>
      parseDocument(`
        export default defineDocument({
          parameters: parameters({}),
          body: body([
            sketch({
              id: 'sketch_1',
              svg: ${JSON.stringify(DEFAULT_SKETCH.svg)},
              constraints: {
                kind: 'rectangle',
                anchor: 'origin',
                width: { kind: 'unknown' },
                height: 10,
              },
            }),
          ]),
        });
      `),
    ).toThrow(/unsupported sketch constraint value/u);
    expect(() =>
      parseDocument(`
        export default defineDocument({
          parameters: parameters({}),
          body: body([
            sketch({
              id: 'sketch_1',
              svg: ${JSON.stringify(DEFAULT_SKETCH.svg)},
              constraints: {
                kind: 'circle',
                anchor: 'origin',
                width: 10,
                height: 10,
              },
            }),
          ]),
        });
      `),
    ).toThrow(/only rectangle sketch constraints/u);
    expect(() =>
      parseDocument(`
        export default defineDocument({
          parameters: parameters({}),
          body: body([
            sketch({
              id: 'sketch_1',
              svg: ${JSON.stringify(DEFAULT_SKETCH.svg)},
              constraints: {
                kind: 'rectangle',
                anchor: 'center',
                width: 10,
                height: 10,
              },
            }),
          ]),
        });
      `),
    ).toThrow(/only origin-anchored/u);
  });
});
