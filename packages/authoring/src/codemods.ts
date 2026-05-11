import { parseSketchSvg } from '@cad/sketch';

import type {
  AuthoringOp,
  DocumentAST,
  FeatureAst,
  FeatureAstInput,
  ParameterAst,
  ScalarAstInput,
} from './types.js';

export function applyAuthoringOp(ast: DocumentAST, op: AuthoringOp): DocumentAST {
  switch (op.kind) {
    case 'parameter.add': {
      const index = clampIndex(op.index ?? ast.parameters.length, ast.parameters.length + 1);
      const parameter: ParameterAst = {
        id: op.parameter.id ?? `parameter_${index + 1}`,
        name: op.parameter.name,
        definition: normalizeParameterDefinition(op.parameter.definition),
      };
      return {
        ...ast,
        parameters: [...ast.parameters.slice(0, index), parameter, ...ast.parameters.slice(index)],
      };
    }
    case 'parameter.update': {
      return {
        ...ast,
        parameters: ast.parameters.map((parameter) =>
          parameter.id === op.id
            ? {
                ...parameter,
                id: op.parameter.id ?? parameter.id,
                name: op.parameter.name,
                definition: normalizeParameterDefinition(op.parameter.definition),
              }
            : parameter,
        ),
      };
    }
    case 'parameter.remove': {
      return {
        ...ast,
        parameters: ast.parameters.filter((parameter) => parameter.id !== op.id),
      };
    }
    case 'parameter.rename': {
      const parameter = ast.parameters.find((entry) => entry.id === op.id);
      if (parameter === undefined) {
        return ast;
      }
      return {
        ...ast,
        parameters: ast.parameters.map((entry) =>
          entry.id === op.id ? { ...entry, name: op.newName } : entry,
        ),
        features: ast.features.map((feature) =>
          renameFeatureReferences(feature, parameter.name, op.newName),
        ),
      };
    }
    case 'feature.add': {
      const index = clampIndex(op.index ?? ast.features.length, ast.features.length + 1);
      return {
        ...ast,
        features: [
          ...ast.features.slice(0, index),
          normalizeFeatureInput(op.feature),
          ...ast.features.slice(index),
        ],
      };
    }
    case 'feature.update': {
      const previous = ast.features.find((feature) => feature.id === op.id);
      const nextFeature =
        previous === undefined
          ? normalizeFeatureInput(op.feature)
          : normalizeFeatureInput(op.feature, previous.id);
      return {
        ...ast,
        features: ast.features.map((feature) => {
          if (feature.id === op.id) {
            return nextFeature;
          }
          if (
            previous?.kind === 'sketch' &&
            nextFeature.kind === 'sketch' &&
            feature.kind === 'pad' &&
            feature.sketch === previous.id &&
            previous.id !== nextFeature.id
          ) {
            return { ...feature, sketch: nextFeature.id };
          }
          return feature;
        }),
      };
    }
    case 'feature.remove': {
      return {
        ...ast,
        features: ast.features.filter(
          (feature) =>
            feature.id !== op.id && !(feature.kind === 'pad' && feature.sketch === op.id),
        ),
      };
    }
    case 'feature.reorder': {
      const current = ast.features.findIndex((feature) => feature.id === op.id);
      if (current === -1) {
        return ast;
      }
      const next = [...ast.features];
      const [feature] = next.splice(current, 1);
      if (feature === undefined) {
        return ast;
      }
      next.splice(clampIndex(op.index, next.length + 1), 0, feature);
      return {
        ...ast,
        features: next,
      };
    }
  }
}

function normalizeParameterDefinition(
  definition: DocumentAST['parameters'][number]['definition'],
): DocumentAST['parameters'][number]['definition'] {
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

function normalizeFeatureInput(feature: FeatureAstInput, fallbackId?: string): FeatureAst {
  if (feature.kind === 'sketch') {
    return {
      kind: 'sketch',
      id: feature.id ?? fallbackId ?? 'sketch_1',
      plane: feature.plane ?? 'xy',
      svg: feature.svg,
      geometry: feature.geometry ?? parseSketchSvg(feature.svg),
      constraints: feature.constraints,
    };
  }
  return {
    kind: 'pad',
    id: feature.id ?? fallbackId ?? 'pad_1',
    sketch: feature.sketch,
    length: feature.length,
    direction: feature.direction,
  };
}

function renameFeatureReferences<T extends DocumentAST['features'][number]>(
  feature: T,
  previousName: string,
  nextName: string,
): T {
  if (feature.kind === 'pad') {
    return {
      ...feature,
      length: renameScalar(feature.length, previousName, nextName),
    };
  }
  if (feature.constraints.kind === 'rectangle') {
    return {
      ...feature,
      constraints: {
        ...feature.constraints,
        width: renameScalar(feature.constraints.width, previousName, nextName),
        height: renameScalar(feature.constraints.height, previousName, nextName),
      },
    } as T;
  }
  return feature;
}

function renameScalar<T extends ScalarAstInput>(
  scalar: T,
  previousName: string,
  nextName: string,
): T {
  switch (scalar.kind) {
    case 'reference': {
      return (scalar.name === previousName ? { ...scalar, name: nextName } : scalar) as T;
    }
    case 'expression': {
      return {
        ...scalar,
        source: scalar.source.replaceAll(previousName, nextName),
      } as T;
    }
    case 'literal': {
      return scalar;
    }
  }
}

function clampIndex(index: number, length: number): number {
  return Math.max(0, Math.min(index, length));
}
