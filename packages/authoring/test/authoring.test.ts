import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { applyAuthoringOp, parseDocument, printDocument } from '../src/index.js';

const FIXTURE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'tests', 'fixtures', 'slice-2');

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
      name: 'width',
      newName: 'plateWidth',
    });

    const printed = await printDocument(next);
    expect(printed).toContain('plateWidth');
    expect(printed).toContain("reference('plateWidth')");
  });

  it('applies feature insertion and reordering codemods while staying printable', async () => {
    const ast = parseDocument(await readFixture('valid-sketch-pad.document.ts'));
    const withFeature = applyAuthoringOp(ast, {
      kind: 'feature.add',
      index: 1,
      feature: {
        kind: 'pad',
        id: 'pad_1',
        width: { kind: 'literal', value: 4, unit: 'mm' },
        depth: { kind: 'literal', value: 5, unit: 'mm' },
        height: { kind: 'literal', value: 6, unit: 'mm' },
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

  it('covers the remaining parameter and feature codemods', async () => {
    const ast = parseDocument(await readFixture('valid-pad.document.ts'));
    const withAddedParameter = applyAuthoringOp(ast, {
      kind: 'parameter.add',
      name: 'depth',
      definition: { value: 20, unit: 'mm' },
    });
    const withUpdatedParameter = applyAuthoringOp(withAddedParameter, {
      kind: 'parameter.update',
      name: 'depth',
      definition: { expression: 'width * 2', unit: 'mm' },
    });
    const withRemovedParameter = applyAuthoringOp(withUpdatedParameter, {
      kind: 'parameter.remove',
      name: 'depth',
    });
    const withUpdatedFeature = applyAuthoringOp(withRemovedParameter, {
      kind: 'feature.update',
      id: 'pad_1',
      feature: {
        kind: 'pad',
        id: 'pad_1',
        width: { kind: 'literal', value: 12, unit: 'mm' },
        depth: { kind: 'reference', name: 'width' },
        height: { kind: 'expression', source: 'width / 2', unit: 'mm' },
      },
    });
    const withRemovedFeature = applyAuthoringOp(withUpdatedFeature, {
      kind: 'feature.remove',
      id: 'pad_1',
    });

    expect(withAddedParameter.parameters).toHaveLength(4);
    expect(withUpdatedParameter.parameters[3]).toMatchObject({
      name: 'depth',
      definition: { expression: 'width * 2', unit: 'mm' },
    });
    expect(withRemovedParameter.parameters).toHaveLength(2);
    expect(withUpdatedFeature.features[0]).toMatchObject({
      kind: 'pad',
      width: { kind: 'literal', value: 12, unit: 'mm' },
      depth: { kind: 'reference', name: 'width' },
      height: { kind: 'expression', source: 'width / 2', unit: 'mm' },
    });
    expect(withRemovedFeature.features).toHaveLength(0);
  });

  it('keeps no-op codemods stable and clamps feature insertion indexes', async () => {
    const ast = parseDocument(await readFixture('valid-sketch-pad.document.ts'));
    const appended = applyAuthoringOp(ast, {
      kind: 'feature.add',
      index: 99,
      feature: { kind: 'sketch', id: 'sketch_3' },
    });
    const prepended = applyAuthoringOp(ast, {
      kind: 'feature.add',
      index: -5,
      feature: { kind: 'sketch', id: 'sketch_0' },
    });
    const reorderMissing = applyAuthoringOp(ast, {
      kind: 'feature.reorder',
      id: 'missing_feature',
      index: 0,
    });
    const renameSketchParameter = applyAuthoringOp(ast, {
      kind: 'parameter.rename',
      name: 'width',
      newName: 'renamedWidth',
    });

    expect(appended.features.at(-1)).toMatchObject({ id: 'sketch_3', kind: 'sketch' });
    expect(prepended.features[0]).toMatchObject({ id: 'sketch_0', kind: 'sketch' });
    expect(reorderMissing).toEqual(ast);
    expect(renameSketchParameter.features[0]).toMatchObject({ id: 'sketch_1', kind: 'sketch' });
  });

  it('rejects unsupported top-level shapes during parse', async () => {
    await expect(readFixture('unsupported-import.document.ts').then(parseDocument)).rejects.toThrow(
      /expected `export default defineDocument/u,
    );
  });

  it('rejects invalid document and parameter shapes during parse', () => {
    expect(() => parseDocument('export default {};\n')).toThrow(/expected `export default defineDocument/u);
    expect(() =>
      parseDocument("export default defineDocument([]);\n"),
    ).toThrow(/defineDocument expects an object literal/u);
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
          body: body([pad({ width: 1, depth: 2 })]),
        });
      `),
    ).toThrow(/missing required property "height"/u);
  });

  it('parses supported scalar input forms and rejects unsupported ones', () => {
    const parsed = parseDocument(`
      export default defineDocument({
        parameters: parameters({}),
        body: body([
          sketch({}),
          pad({
            width: -2,
            depth: "width",
            height: expression("width / 2", "mm"),
          }),
          pad({
            id: "pad_3",
            width: literal(3, "mm"),
            depth: reference("width"),
            height: 4,
          }),
        ]),
      });
    `);

    expect(parsed.features).toEqual([
      { kind: 'sketch', id: 'sketch_1' },
      {
        kind: 'pad',
        id: 'pad_2',
        width: { kind: 'literal', value: -2, unit: 'mm' },
        depth: { kind: 'reference', name: 'width' },
        height: { kind: 'expression', source: 'width / 2', unit: 'mm' },
      },
      {
        kind: 'pad',
        id: 'pad_3',
        width: { kind: 'literal', value: 3, unit: 'mm' },
        depth: { kind: 'reference', name: 'width' },
        height: { kind: 'literal', value: 4, unit: 'mm' },
      },
    ]);

    expect(() =>
      parseDocument(`
        export default defineDocument({
          parameters: parameters({}),
          body: body([
            pad({
              width: true,
              depth: 2,
              height: 3,
            }),
          ]),
        });
      `),
    ).toThrow(/unsupported scalar input/u);
  });

  it('prints sketch features without a plane', async () => {
    const printed = await printDocument({
      parameters: [],
      features: [{ kind: 'sketch', id: 'sketch_1' }],
    });

    expect(printed).toContain("sketch({ id: 'sketch_1' })");
  });
});
