import prettier from 'prettier';
import estreePlugin from 'prettier/plugins/estree';
import typescriptPlugin from 'prettier/plugins/typescript';

import type { DocumentAST, FeatureAst, ScalarAstInput } from './types.js';
import type { RectangleSketchConstraints, SketchConstraintValue } from '@cad/sketch';

export async function printDocument(ast: DocumentAST): Promise<string> {
  const imports = collectSdkImports(ast);
  const source = [
    `import { ${imports.join(', ')} } from '@cad/sdk';`,
    '',
    'export default defineDocument({',
    '  parameters: parameters({',
    ...ast.parameters.map(
      (parameter) => `    ${parameter.name}: ${printParameterDefinition(parameter.definition)},`,
    ),
    '  }),',
    '  body: body([',
    ...ast.features.map((feature) => `    ${printFeature(feature)},`),
    '  ]),',
    '});',
    '',
  ].join('\n');
  return prettier.format(source, {
    parser: 'typescript',
    plugins: [typescriptPlugin, estreePlugin],
    singleQuote: true,
    printWidth: 100,
  });
}

function collectSdkImports(ast: DocumentAST): readonly string[] {
  const imports = new Set<string>(['body', 'defineDocument', 'parameters']);
  for (const feature of ast.features) {
    if (feature.kind === 'sketch') {
      imports.add('sketch');
      continue;
    }
    imports.add('pad');
    imports.add('feature');
    collectScalarImports(feature.length, imports);
  }
  return [
    'body',
    'defineDocument',
    'expression',
    'feature',
    'literal',
    'pad',
    'parameters',
    'reference',
    'sketch',
  ].filter((name) => imports.has(name));
}

function printParameterDefinition(
  definition: DocumentAST['parameters'][number]['definition'],
): string {
  if ('expression' in definition) {
    return `{ kind: 'expression', expression: ${JSON.stringify(definition.expression)}, unit: '${definition.unit}' }`;
  }
  return `{ kind: 'number', value: ${definition.value}, unit: '${definition.unit}' }`;
}

function printFeature(feature: FeatureAst): string {
  if (feature.kind === 'sketch') {
    return [
      'sketch({',
      `  id: ${JSON.stringify(feature.id)},`,
      `  plane: '${feature.plane}',`,
      `  svg: ${JSON.stringify(feature.svg)},`,
      `  constraints: ${printSketchConstraints(feature.constraints)},`,
      '})',
    ].join(' ');
  }
  return [
    'pad({',
    `  id: ${JSON.stringify(feature.id)},`,
    `  sketch: feature(${JSON.stringify(feature.sketch)}),`,
    `  length: ${printScalar(feature.length)},`,
    `  direction: '${feature.direction}',`,
    '})',
  ].join(' ');
}

function printSketchConstraints(constraints: RectangleSketchConstraints): string {
  return [
    '{',
    `  kind: '${constraints.kind}',`,
    `  anchor: '${constraints.anchor}',`,
    `  width: ${printSketchConstraintValue(constraints.width)},`,
    `  height: ${printSketchConstraintValue(constraints.height)},`,
    '}',
  ].join(' ');
}

function printSketchConstraintValue(value: SketchConstraintValue): string {
  switch (value.kind) {
    case 'literal': {
      return `{ kind: 'literal', value: ${value.value}, unit: '${value.unit}' }`;
    }
    case 'reference': {
      return `{ kind: 'reference', name: ${JSON.stringify(value.name)} }`;
    }
    case 'expression': {
      return `{ kind: 'expression', source: ${JSON.stringify(value.source)}, unit: '${value.unit}' }`;
    }
  }
  return assertNever(value);
}

function printScalar(scalar: ScalarAstInput): string {
  switch (scalar.kind) {
    case 'literal': {
      return `literal(${scalar.value}, '${scalar.unit}')`;
    }
    case 'reference': {
      return `reference(${JSON.stringify(scalar.name)})`;
    }
    case 'expression': {
      return `expression(${JSON.stringify(scalar.source)}, '${scalar.unit}')`;
    }
  }
}

function collectScalarImports(scalar: ScalarAstInput, imports: Set<string>): void {
  switch (scalar.kind) {
    case 'literal': {
      imports.add('literal');
      break;
    }
    case 'reference': {
      imports.add('reference');
      break;
    }
    case 'expression': {
      imports.add('expression');
      break;
    }
  }
}

function assertNever(value: never): never {
  throw new Error(`Unexpected sketch constraint value: ${JSON.stringify(value)}`);
}
