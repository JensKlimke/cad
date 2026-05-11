import {
  applyAuthoringOp,
  findNodeSelectionAtOffset,
  getNodeRange,
  parseDocument,
  printDocument,
  type AstNodeSelection,
  type AuthoringOp,
  type DocumentAST,
  type FeatureAst,
  type ParameterAst,
} from '@cad/authoring';
import { createRectangleSketch, serializeSketchSvg } from '@cad/sketch';

import type { ParameterDefinition } from '@cad/sdk';

export interface ParsedAuthoringState {
  readonly ast: DocumentAST | null;
  readonly error: string | null;
}

export function parseAuthoringSource(source: string): ParsedAuthoringState {
  try {
    return {
      ast: parseDocument(source),
      error: null,
    };
  } catch (error) {
    return {
      ast: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function applyAuthoringOperation(
  ast: DocumentAST,
  op: AuthoringOp,
): Promise<{ readonly ast: DocumentAST; readonly source: string }> {
  const nextAst = applyAuthoringOp(ast, op);
  const source = await printDocument(nextAst);
  return {
    ast: parseDocument(source),
    source,
  };
}

export function selectionFromOffset(
  ast: DocumentAST | null,
  offset: number,
): AstNodeSelection | null {
  if (ast === null) {
    return null;
  }
  return findNodeSelectionAtOffset(ast, offset);
}

export function rangeForSelection(ast: DocumentAST | null, selection: AstNodeSelection | null) {
  if (ast === null) {
    return null;
  }
  return getNodeRange(ast, selection);
}

export function defaultParameterName(ast: DocumentAST): string {
  const names = new Set(ast.parameters.map((parameter) => parameter.name));
  let index = ast.parameters.length + 1;
  while (names.has(`parameter${String(index)}`)) {
    index += 1;
  }
  return `parameter${String(index)}`;
}

export function createDefaultParameter(ast: DocumentAST): ParameterAst {
  return {
    id: `parameter_${String(ast.parameters.length + 1)}`,
    name: defaultParameterName(ast),
    definition: { kind: 'number', value: 10, unit: 'mm' },
  };
}

export function createDefaultFeature(ast: DocumentAST, kind: FeatureAst['kind']): FeatureAst {
  const nextIndex = ast.features.filter((feature) => feature.kind === kind).length + 1;
  if (kind === 'sketch') {
    const sketch = createRectangleSketch();
    return {
      kind: 'sketch',
      id: `sketch_${String(nextIndex)}`,
      plane: sketch.plane,
      svg: serializeSketchSvg(sketch),
      geometry: sketch.geometry,
      constraints: sketch.constraints,
    };
  }
  return {
    kind: 'pad',
    id: `pad_${String(nextIndex)}`,
    sketch: ast.features.find((feature) => feature.kind === 'sketch')?.id ?? 'sketch_1',
    length: { kind: 'literal', value: 30, unit: 'mm' },
    direction: 'up',
  };
}

export function defaultSelection(ast: DocumentAST | null): AstNodeSelection | null {
  if (ast === null) {
    return null;
  }
  const firstFeature = ast.features[0];
  if (firstFeature !== undefined) {
    return { kind: 'feature', id: firstFeature.id };
  }
  const firstParameter = ast.parameters[0];
  if (firstParameter !== undefined) {
    return { kind: 'parameter', id: firstParameter.id };
  }
  return null;
}

export function resolveSelection(
  ast: DocumentAST | null,
  selection: AstNodeSelection | null,
): AstNodeSelection | null {
  if (ast === null) {
    return null;
  }
  if (
    selection?.kind === 'feature' &&
    ast.features.some((feature) => feature.id === selection.id)
  ) {
    return selection;
  }
  if (
    selection?.kind === 'parameter' &&
    ast.parameters.some((parameter) => parameter.id === selection.id)
  ) {
    return selection;
  }
  return defaultSelection(ast);
}

export function findSelectedFeature(
  ast: DocumentAST | null,
  selection: AstNodeSelection | null,
): FeatureAst | null {
  if (ast === null || selection?.kind !== 'feature') {
    return null;
  }
  return ast.features.find((feature) => feature.id === selection.id) ?? null;
}

export function findSelectedParameter(
  ast: DocumentAST | null,
  selection: AstNodeSelection | null,
): ParameterAst | null {
  if (ast === null || selection?.kind !== 'parameter') {
    return null;
  }
  return ast.parameters.find((parameter) => parameter.id === selection.id) ?? null;
}

export function normalizeParameterDefinition(definition: ParameterDefinition): ParameterDefinition {
  if ('expression' in definition) {
    return {
      kind: 'expression',
      expression: definition.expression,
      unit: definition.unit,
    };
  }
  return {
    kind: 'number',
    value: definition.value,
    unit: definition.unit,
  };
}
