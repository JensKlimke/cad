import type { AuthoringOp, DocumentAST, ScalarAstInput } from './types.js';

export function applyAuthoringOp(ast: DocumentAST, op: AuthoringOp): DocumentAST {
  switch (op.kind) {
    case 'parameter.add': {
      return {
        ...ast,
        parameters: [...ast.parameters, { name: op.name, definition: op.definition }],
      };
    }
    case 'parameter.update': {
      return {
        ...ast,
        parameters: ast.parameters.map((parameter) =>
          parameter.name === op.name ? { ...parameter, definition: op.definition } : parameter,
        ),
      };
    }
    case 'parameter.remove': {
      return {
        ...ast,
        parameters: ast.parameters.filter((parameter) => parameter.name !== op.name),
      };
    }
    case 'parameter.rename': {
      return {
        ...ast,
        parameters: ast.parameters.map((parameter) =>
          parameter.name === op.name ? { ...parameter, name: op.newName } : parameter,
        ),
        features: ast.features.map((feature) => renameFeatureReferences(feature, op.name, op.newName)),
      };
    }
    case 'feature.add': {
      const index = clampIndex(op.index ?? ast.features.length, ast.features.length + 1);
      return {
        ...ast,
        features: [...ast.features.slice(0, index), op.feature, ...ast.features.slice(index)],
      };
    }
    case 'feature.update': {
      return {
        ...ast,
        features: ast.features.map((feature) => (feature.id === op.id ? op.feature : feature)),
      };
    }
    case 'feature.remove': {
      return {
        ...ast,
        features: ast.features.filter((feature) => feature.id !== op.id),
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

function renameFeatureReferences<T extends DocumentAST['features'][number]>(
  feature: T,
  previousName: string,
  nextName: string,
): T {
  if (feature.kind !== 'pad') {
    return feature;
  }
  return {
    ...feature,
    width: renameScalar(feature.width, previousName, nextName),
    depth: renameScalar(feature.depth, previousName, nextName),
    height: renameScalar(feature.height, previousName, nextName),
  };
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
