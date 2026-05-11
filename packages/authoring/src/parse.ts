import { parseSketchSvg } from '@cad/sketch';
import ts from 'typescript';

import type { DocumentAST, FeatureAst, ParameterAst, ScalarAstInput } from './types.js';
import type { SourceRange } from '@cad/expr';
import type { RectangleSketchConstraints, SketchConstraintValue } from '@cad/sketch';

export function parseDocument(source: string): DocumentAST {
  const file = ts.createSourceFile(
    'document.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
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
  const parametersRange = getRange(parametersCall.arguments[0]);
  const bodyRange = getRange(bodyCall.arguments[0]);

  return {
    parameters: parseParameters(parametersCall),
    features: parseBody(bodyCall),
    sections: {
      ...(parametersRange === undefined ? {} : { parameters: parametersRange }),
      ...(bodyRange === undefined ? {} : { body: bodyRange }),
    },
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
  return argument.properties.map((property, index) => {
    if (!ts.isPropertyAssignment(property) || !ts.isIdentifier(property.name)) {
      throw new Error('parseDocument: parameter entries must be simple property assignments.');
    }
    const range = getRange(property);
    const nameRange = getRange(property.name);
    const definitionRange = getRange(property.initializer);
    return {
      id: `parameter_${index + 1}`,
      name: property.name.text,
      definition: parseParameterDefinition(property.initializer),
      ...(range === undefined ? {} : { range }),
      ...(nameRange === undefined ? {} : { nameRange }),
      ...(definitionRange === undefined ? {} : { definitionRange }),
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
  const kindNode = getObjectProperty(node, 'kind');
  if (unitNode === undefined || !ts.isStringLiteral(unitNode)) {
    throw new Error('parseDocument: parameter definition must include string literal `unit`.');
  }
  if (valueNode !== undefined && exprNode !== undefined) {
    throw new Error(
      'parseDocument: parameter definition cannot include both `value` and `expression`.',
    );
  }
  if (kindNode !== undefined && !ts.isStringLiteral(kindNode)) {
    throw new Error(
      'parseDocument: parameter definition `kind` must be a string literal when provided.',
    );
  }
  if (kindNode !== undefined && !['number', 'expression'].includes(kindNode.text)) {
    throw new Error('parseDocument: parameter definition `kind` must be `number` or `expression`.');
  }
  if (valueNode !== undefined) {
    if (!isNumericNode(valueNode)) {
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
  throw new Error(
    'parseDocument: parameter definition must include `value` or string literal `expression`.',
  );
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
    const idNode = config ? getObjectProperty(config, 'id') : undefined;
    const planeNode = config ? getObjectProperty(config, 'plane') : undefined;
    const svgNode = config ? getObjectProperty(config, 'svg') : undefined;
    const constraintsNode = config ? getObjectProperty(config, 'constraints') : undefined;
    if (svgNode === undefined) {
      throw new Error('parseDocument: sketch config must include string literal `svg`.');
    }
    if (constraintsNode === undefined || !ts.isObjectLiteralExpression(constraintsNode)) {
      throw new Error('parseDocument: sketch config must include object literal `constraints`.');
    }
    const svg = readStringLiteral(svgNode, 'parseDocument: sketch `svg` must be a string literal.');
    const constraints = parseSketchConstraints(constraintsNode);
    const range = getRange(node);
    const idRange = idNode === undefined ? undefined : getRange(idNode);
    const planeRange = planeNode === undefined ? undefined : getRange(planeNode);
    const svgRange = getRange(svgNode);
    const constraintsRange = getRange(constraintsNode);
    return {
      kind: 'sketch',
      id: readId(config, `sketch_${index + 1}`),
      plane:
        planeNode !== undefined && ts.isStringLiteral(planeNode) ? (planeNode.text as never) : 'xy',
      svg,
      geometry: parseSketchSvg(svg),
      constraints,
      ...(range === undefined ? {} : { range }),
      fieldRanges: {
        ...(idRange === undefined ? {} : { id: idRange }),
        ...(planeRange === undefined ? {} : { plane: planeRange }),
        ...(svgRange === undefined ? {} : { svg: svgRange }),
        ...(constraintsRange === undefined ? {} : { constraints: constraintsRange }),
      },
    };
  }
  if (featureKind !== 'pad' || config === undefined || !ts.isObjectLiteralExpression(config)) {
    throw new Error('parseDocument: only pad(...) and sketch(...) features are supported.');
  }
  const idNode = getObjectProperty(config, 'id');
  const sketchNode = expectProperty(config, 'sketch');
  const lengthNode = expectProperty(config, 'length');
  const directionNode = getObjectProperty(config, 'direction');
  const range = getRange(node);
  const idRange = idNode === undefined ? undefined : getRange(idNode);
  const sketchRange = getRange(sketchNode);
  const lengthRange = getRange(lengthNode);
  const directionRange = directionNode === undefined ? undefined : getRange(directionNode);
  return {
    kind: 'pad',
    id: readId(config, `pad_${index + 1}`),
    sketch: parseFeatureReference(sketchNode),
    length: parseScalarInput(lengthNode),
    direction: parsePadDirection(directionNode),
    ...(range === undefined ? {} : { range }),
    fieldRanges: {
      ...(idRange === undefined ? {} : { id: idRange }),
      ...(sketchRange === undefined ? {} : { sketch: sketchRange }),
      ...(lengthRange === undefined ? {} : { length: lengthRange }),
      ...(directionRange === undefined ? {} : { direction: directionRange }),
    },
  };
}

function parseFeatureReference(node: ts.Expression): string {
  if (ts.isStringLiteral(node)) {
    return node.text;
  }
  if (ts.isCallExpression(node) && renderExpression(node.expression) === 'feature') {
    const idNode = node.arguments[0];
    if (idNode !== undefined && ts.isStringLiteral(idNode)) {
      return idNode.text;
    }
  }
  if (ts.isObjectLiteralExpression(node)) {
    const kindNode = getObjectProperty(node, 'kind');
    const idNode = getObjectProperty(node, 'id');
    if (
      kindNode !== undefined &&
      idNode !== undefined &&
      readStringLiteral(
        kindNode,
        'parseDocument: feature reference kind must be a string literal.',
      ) === 'feature' &&
      ts.isStringLiteral(idNode)
    ) {
      return idNode.text;
    }
  }
  throw new Error(
    'parseDocument: pad sketch reference must be a string literal, feature(...), or feature object.',
  );
}

function parsePadDirection(node: ts.Expression | undefined): 'up' | 'down' | 'symmetric' {
  if (node === undefined) {
    return 'up';
  }
  const direction = readStringLiteral(
    node,
    'parseDocument: pad direction must be a string literal.',
  );
  if (direction === 'up' || direction === 'down' || direction === 'symmetric') {
    return direction;
  }
  throw new Error('parseDocument: pad direction must be `up`, `down`, or `symmetric`.');
}

function parseScalarInput(node: ts.Expression): ScalarAstInput {
  if (isNumericNode(node)) {
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
      if (
        sourceNode !== undefined &&
        unitNode !== undefined &&
        ts.isStringLiteral(sourceNode) &&
        ts.isStringLiteral(unitNode)
      ) {
        return { kind: 'expression', source: sourceNode.text, unit: unitNode.text as never };
      }
    }
    if (callee === 'literal') {
      const valueNode = node.arguments[0];
      const unitNode = node.arguments[1];
      if (valueNode !== undefined && unitNode !== undefined && ts.isStringLiteral(unitNode)) {
        return {
          kind: 'literal',
          value: Number(renderExpression(valueNode)),
          unit: unitNode.text as never,
        };
      }
    }
  }
  throw new Error(
    'parseDocument: unsupported scalar input; use number, string reference, literal(...), expression(...), or reference(...).',
  );
}

function parseSketchConstraints(node: ts.ObjectLiteralExpression): RectangleSketchConstraints {
  const kindNode = expectProperty(node, 'kind');
  const anchorNode = expectProperty(node, 'anchor');
  const widthNode = expectProperty(node, 'width');
  const heightNode = expectProperty(node, 'height');
  const kind = readStringLiteral(
    kindNode,
    'parseDocument: sketch constraint kind must be a string literal.',
  );
  const anchor = readStringLiteral(
    anchorNode,
    'parseDocument: sketch constraint anchor must be a string literal.',
  );
  if (kind !== 'rectangle') {
    throw new Error('parseDocument: only rectangle sketch constraints are supported.');
  }
  if (anchor !== 'origin') {
    throw new Error('parseDocument: only origin-anchored rectangle sketches are supported.');
  }
  return {
    kind: 'rectangle',
    anchor: 'origin',
    width: parseSketchConstraintValue(widthNode),
    height: parseSketchConstraintValue(heightNode),
  };
}

function parseSketchConstraintValue(node: ts.Expression): SketchConstraintValue {
  if (isNumericNode(node)) {
    return {
      kind: 'literal',
      value: Number(renderExpression(node)),
      unit: 'mm',
    };
  }
  if (ts.isObjectLiteralExpression(node)) {
    const kindNode = expectProperty(node, 'kind');
    const kind = readStringLiteral(
      kindNode,
      'parseDocument: sketch constraint value kind must be a string literal.',
    );
    if (kind === 'literal') {
      const valueNode = expectProperty(node, 'value');
      const unitNode = expectProperty(node, 'unit');
      if (!isNumericNode(valueNode)) {
        throw new Error('parseDocument: sketch literal value must be numeric.');
      }
      return {
        kind: 'literal',
        value: Number(renderExpression(valueNode)),
        unit: readStringLiteral(
          unitNode,
          'parseDocument: sketch literal unit must be a string literal.',
        ) as 'mm',
      };
    }
    if (kind === 'reference') {
      return {
        kind: 'reference',
        name: readStringLiteral(
          expectProperty(node, 'name'),
          'parseDocument: sketch reference name must be a string literal.',
        ),
      };
    }
    if (kind === 'expression') {
      return {
        kind: 'expression',
        source: readStringLiteral(
          expectProperty(node, 'source'),
          'parseDocument: sketch expression source must be a string literal.',
        ),
        unit: readStringLiteral(
          expectProperty(node, 'unit'),
          'parseDocument: sketch expression unit must be a string literal.',
        ) as 'mm',
      };
    }
  }
  throw new Error('parseDocument: unsupported sketch constraint value.');
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

function getObjectProperty(
  node: ts.ObjectLiteralExpression,
  name: string,
): ts.Expression | undefined {
  for (const property of node.properties) {
    if (
      ts.isPropertyAssignment(property) &&
      ts.isIdentifier(property.name) &&
      property.name.text === name
    ) {
      return property.initializer;
    }
  }
  return undefined;
}

function readId(node: ts.ObjectLiteralExpression | undefined, fallback: string): string {
  if (node === undefined) {
    return fallback;
  }
  const idNode = getObjectProperty(node, 'id');
  return idNode !== undefined && ts.isStringLiteral(idNode) ? idNode.text : fallback;
}

function readStringLiteral(node: ts.Expression, message: string): string {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  throw new Error(message);
}

function getRange(node: ts.Node | undefined): SourceRange | undefined {
  if (node === undefined) {
    return undefined;
  }
  return {
    start: node.getStart(),
    end: node.getEnd(),
  };
}

function isNumericNode(node: ts.Node): node is ts.NumericLiteral | ts.PrefixUnaryExpression {
  return ts.isNumericLiteral(node) || ts.isPrefixUnaryExpression(node);
}

function renderExpression(node: ts.Node): string {
  return node.getText();
}
