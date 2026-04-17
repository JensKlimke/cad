import ts from 'typescript';

import type { DocumentAST, FeatureAst, ParameterAst, ScalarAstInput } from './types.js';

export function parseDocument(source: string): DocumentAST {
  const file = ts.createSourceFile('document.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const exportAssignment = file.statements.find((statement) => ts.isExportAssignment(statement));
  if (exportAssignment === undefined || !ts.isCallExpression(exportAssignment.expression)) {
    throw new Error('parseDocument: expected `export default defineDocument(...)`.');
  }

  const defineCall = exportAssignment.expression;
  if (renderExpression(defineCall.expression) !== 'defineDocument') {
    throw new Error('parseDocument: expected `defineDocument(...)` default export.');
  }
  const config = defineCall.arguments[0];
  if (config === undefined || !ts.isObjectLiteralExpression(config)) {
    throw new Error('parseDocument: defineDocument expects an object literal.');
  }

  const parametersCall = getCallProperty(config, 'parameters');
  const bodyCall = getCallProperty(config, 'body');

  return {
    parameters: parseParameters(parametersCall),
    features: parseBody(bodyCall),
  };
}

function parseParameters(call: ts.CallExpression): readonly ParameterAst[] {
  if (renderExpression(call.expression) !== 'parameters') {
    throw new Error('parseDocument: `parameters` property must call parameters(...).');
  }
  const argument = call.arguments[0];
  if (argument === undefined || !ts.isObjectLiteralExpression(argument)) {
    throw new Error('parseDocument: parameters(...) expects an object literal.');
  }
  return argument.properties.map((property) => {
    if (!ts.isPropertyAssignment(property) || !ts.isIdentifier(property.name)) {
      throw new Error('parseDocument: parameter entries must be simple property assignments.');
    }
    return {
      name: property.name.text,
      definition: parseParameterDefinition(property.initializer),
    };
  });
}

function parseParameterDefinition(node: ts.Expression) {
  if (!ts.isObjectLiteralExpression(node)) {
    throw new Error('parseDocument: parameter definition must be an object literal.');
  }
  const valueNode = getObjectProperty(node, 'value');
  const exprNode = getObjectProperty(node, 'expression');
  const unitNode = getObjectProperty(node, 'unit');
  if (unitNode === undefined || !ts.isStringLiteral(unitNode)) {
    throw new Error('parseDocument: parameter definition must include string literal `unit`.');
  }
  if (valueNode !== undefined && exprNode !== undefined) {
    throw new Error('parseDocument: parameter definition cannot include both `value` and `expression`.');
  }
  if (valueNode !== undefined) {
    if (!ts.isNumericLiteral(valueNode) && valueNode.kind !== ts.SyntaxKind.PrefixUnaryExpression) {
      throw new Error('parseDocument: parameter `value` must be numeric.');
    }
    return {
      kind: 'number' as const,
      value: Number(renderExpression(valueNode)),
      unit: unitNode.text as never,
    };
  }
  if (exprNode !== undefined && ts.isStringLiteral(exprNode)) {
    return {
      kind: 'expression' as const,
      expression: exprNode.text,
      unit: unitNode.text as never,
    };
  }
  throw new Error('parseDocument: parameter definition must include `value` or string literal `expression`.');
}

function parseBody(call: ts.CallExpression): readonly FeatureAst[] {
  if (renderExpression(call.expression) !== 'body') {
    throw new Error('parseDocument: `body` property must call body(...).');
  }
  const argument = call.arguments[0];
  if (argument === undefined || !ts.isArrayLiteralExpression(argument)) {
    throw new Error('parseDocument: body(...) expects an array literal.');
  }
  return argument.elements.map((element, index) => parseFeature(element, index));
}

function parseFeature(node: ts.Expression, index: number): FeatureAst {
  if (!ts.isCallExpression(node)) {
    throw new Error('parseDocument: body features must be call expressions.');
  }
  const featureKind = renderExpression(node.expression);
  const config = node.arguments[0];
  if (featureKind === 'sketch') {
    if (config !== undefined && !ts.isObjectLiteralExpression(config)) {
      throw new Error('parseDocument: sketch config must be an object literal.');
    }
    const id = config ? readId(config, `sketch_${index + 1}`) : `sketch_${index + 1}`;
    const planeNode = config ? getObjectProperty(config, 'plane') : undefined;
    return {
      kind: 'sketch',
      id,
      ...(planeNode !== undefined && ts.isStringLiteral(planeNode) ? { plane: planeNode.text as never } : {}),
    };
  }
  if (featureKind !== 'pad' || config === undefined || !ts.isObjectLiteralExpression(config)) {
    throw new Error('parseDocument: only pad(...) and sketch(...) features are supported in Slice 2.');
  }
  return {
    kind: 'pad',
    id: readId(config, `pad_${index + 1}`),
    width: parseScalarInput(expectProperty(config, 'width')),
    depth: parseScalarInput(expectProperty(config, 'depth')),
    height: parseScalarInput(expectProperty(config, 'height')),
  };
}

function parseScalarInput(node: ts.Expression): ScalarAstInput {
  if (ts.isNumericLiteral(node) || ts.isPrefixUnaryExpression(node)) {
    return {
      kind: 'literal',
      value: Number(renderExpression(node)),
      unit: 'mm',
    };
  }
  if (ts.isStringLiteral(node)) {
    return {
      kind: 'reference',
      name: node.text,
    };
  }
  if (ts.isCallExpression(node)) {
    const callee = renderExpression(node.expression);
    if (callee === 'reference') {
      const nameNode = node.arguments[0];
      if (nameNode !== undefined && ts.isStringLiteral(nameNode)) {
        return { kind: 'reference', name: nameNode.text };
      }
    }
    if (callee === 'expression') {
      const sourceNode = node.arguments[0];
      const unitNode = node.arguments[1];
      if (sourceNode !== undefined && unitNode !== undefined && ts.isStringLiteral(sourceNode) && ts.isStringLiteral(unitNode)) {
        return { kind: 'expression', source: sourceNode.text, unit: unitNode.text as never };
      }
    }
    if (callee === 'literal') {
      const valueNode = node.arguments[0];
      const unitNode = node.arguments[1];
      if (valueNode !== undefined && unitNode !== undefined && ts.isStringLiteral(unitNode)) {
        return { kind: 'literal', value: Number(renderExpression(valueNode)), unit: unitNode.text as never };
      }
    }
  }
  throw new Error('parseDocument: unsupported scalar input; use number, string reference, literal(...), expression(...), or reference(...).');
}

function getCallProperty(node: ts.ObjectLiteralExpression, name: string): ts.CallExpression {
  const property = expectProperty(node, name);
  if (!ts.isCallExpression(property)) {
    throw new Error(`parseDocument: property "${name}" must be a call expression.`);
  }
  return property;
}

function expectProperty(node: ts.ObjectLiteralExpression, name: string): ts.Expression {
  const value = getObjectProperty(node, name);
  if (value === undefined) {
    throw new Error(`parseDocument: missing required property "${name}".`);
  }
  return value;
}

function getObjectProperty(node: ts.ObjectLiteralExpression, name: string): ts.Expression | undefined {
  for (const property of node.properties) {
    if (ts.isPropertyAssignment(property) && ts.isIdentifier(property.name) && property.name.text === name) {
      return property.initializer;
    }
  }
  return undefined;
}

function readId(node: ts.ObjectLiteralExpression, fallback: string): string {
  const idNode = getObjectProperty(node, 'id');
  return idNode !== undefined && ts.isStringLiteral(idNode) ? idNode.text : fallback;
}

function renderExpression(node: ts.Node): string {
  return node.getText();
}
