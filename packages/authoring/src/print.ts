import prettier from 'prettier';

import type { DocumentAST, FeatureAst, ScalarAstInput } from './types.js';

export async function printDocument(ast: DocumentAST): Promise<string> {
  const imports = collectSdkImports(ast);
  const source = [
    `import { ${imports.join(', ')} } from '@cad/sdk';`,
    '',
    'export default defineDocument({',
    '  parameters: parameters({',
    ...ast.parameters.map((parameter) => `    ${parameter.name}: ${printParameterDefinition(parameter.definition)},`),
    '  }),',
    '  body: body([',
    ...ast.features.map((feature) => `    ${printFeature(feature)},`),
    '  ]),',
    '});',
    '',
  ].join('\n');
  return prettier.format(source, {
    parser: 'typescript',
    singleQuote: true,
    printWidth: 120,
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
    collectScalarImports(feature.width, imports);
    collectScalarImports(feature.depth, imports);
    collectScalarImports(feature.height, imports);
  }
  return ['body', 'defineDocument', 'expression', 'literal', 'pad', 'parameters', 'reference', 'sketch'].filter(
    (name) => imports.has(name),
  );
}

function printParameterDefinition(definition: DocumentAST['parameters'][number]['definition']): string {
  if ('value' in definition) {
    return `{ value: ${definition.value}, unit: '${definition.unit}' }`;
  }
  return `{ expression: ${JSON.stringify(definition.expression)}, unit: '${definition.unit}' }`;
}

function printFeature(feature: FeatureAst): string {
  if (feature.kind === 'sketch') {
    return feature.plane === undefined
      ? `sketch({ id: ${JSON.stringify(feature.id)} })`
      : `sketch({ id: ${JSON.stringify(feature.id)}, plane: '${feature.plane}' })`;
  }
  return `pad({ id: ${JSON.stringify(feature.id)}, width: ${printScalar(feature.width)}, depth: ${printScalar(feature.depth)}, height: ${printScalar(feature.height)} })`;
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
