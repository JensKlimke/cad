import type { AstNodeSelection, DocumentAST } from './types.js';

export function findNodeSelectionAtOffset(ast: DocumentAST, offset: number): AstNodeSelection | null {
  for (const parameter of ast.parameters) {
    if (parameter.range !== undefined && containsOffset(parameter.range, offset)) {
      return { kind: 'parameter', id: parameter.id };
    }
  }
  for (const feature of ast.features) {
    if (feature.range !== undefined && containsOffset(feature.range, offset)) {
      return { kind: 'feature', id: feature.id };
    }
  }
  return null;
}

export function getNodeRange(ast: DocumentAST, selection: AstNodeSelection | null) {
  if (selection === null) {
    return null;
  }
  if (selection.kind === 'parameter') {
    return ast.parameters.find((parameter) => parameter.id === selection.id)?.range ?? null;
  }
  return ast.features.find((feature) => feature.id === selection.id)?.range ?? null;
}

function containsOffset(range: { readonly start: number; readonly end: number }, offset: number): boolean {
  return offset >= range.start && offset <= range.end;
}
