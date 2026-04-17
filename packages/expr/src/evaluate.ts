import { ExprError } from './errors.js';
import { parseExpression } from './parser.js';

import type {
  ExprNode,
  ExpressionParameterDefinition,
  ParameterDefinition,
  ParameterEvaluationResult,
  NumberParameterDefinition,
  Quantity,
  ResolvedParameter,
  Unit,
} from './types.js';

type ParameterRecord = Readonly<Record<string, ParameterDefinition>>;

export function evaluateParameters(parameters: ParameterRecord): ParameterEvaluationResult {
  const order = topologicalOrder(parameters);
  const resolved = new Map<string, ResolvedParameter>();

  for (const name of order) {
    const definition = parameters[name];
    if (definition === undefined) {
      continue;
    }
    const parameter = normalizeParameterDefinition(definition);
    if (parameter.kind === 'number') {
      resolved.set(name, {
        name,
        value: parameter.value,
        unit: parameter.unit,
        source: parameter,
      });
      continue;
    }

    const quantity = evaluateParsedExpression(parseExpression(parameter.expression), {
      get(name_) {
        const value = resolved.get(name_);
        if (value === undefined) {
          throw new ExprError({
            code: 'expr.unknown_identifier',
            message: `Unknown parameter "${name_}" in expression.`,
          });
        }
        return { value: value.value, unit: value.unit };
      },
    });
    if (quantity.unit !== parameter.unit) {
      throw new ExprError({
        code: 'expr.unit_mismatch',
        message: `Expression for "${name}" evaluated to ${quantity.unit}, expected ${parameter.unit}.`,
      });
    }
    resolved.set(name, {
      name,
      value: quantity.value,
      unit: quantity.unit,
      source: parameter,
    });
  }

  return {
    values: Object.fromEntries([...resolved.entries()].map(([name, value]) => [name, value])),
    order,
  };
}

export function evaluateExpression(
  source: string,
  resolver: Readonly<Record<string, Quantity>>,
): Quantity {
  return evaluateParsedExpression(parseExpression(source), {
    get(name) {
      const value = resolver[name];
      if (value === undefined) {
        throw new ExprError({
          code: 'expr.unknown_identifier',
          message: `Unknown identifier "${name}".`,
        });
      }
      return value;
    },
  });
}

export function evaluateParsedExpression(
  node: ExprNode,
  scope: { readonly get: (name: string) => Quantity },
): Quantity {
  switch (node.kind) {
    case 'literal': {
      return { value: node.value, unit: 'count' };
    }
    case 'identifier': {
      return scope.get(node.name);
    }
    case 'unary': {
      const operand = evaluateParsedExpression(node.operand, scope);
      return {
        value: node.operator === '-' ? -operand.value : operand.value,
        unit: operand.unit,
      };
    }
    case 'binary': {
      const left = evaluateParsedExpression(node.left, scope);
      const right = evaluateParsedExpression(node.right, scope);
      switch (node.operator) {
        case '+':
        case '-': {
          assertSameUnit(node.operator, left.unit, right.unit);
          return {
            value: node.operator === '+' ? left.value + right.value : left.value - right.value,
            unit: left.unit,
          };
        }
        case '*': {
          return multiply(left, right);
        }
        case '/': {
          if (right.value === 0) {
            throw new ExprError({
              code: 'expr.divide_by_zero',
              message: 'Division by zero in expression.',
              range: node.right.range,
            });
          }
          return divide(left, right);
        }
      }
    }
  }
}

function topologicalOrder(parameters: ParameterRecord): readonly string[] {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const order: string[] = [];

  const visit = (name: string, path: readonly string[]): void => {
    if (visited.has(name)) {
      return;
    }
    if (visiting.has(name)) {
      throw new ExprError({
        code: 'expr.cycle',
        message: `Cycle detected while evaluating parameters: ${[...path, name].join(' -> ')}.`,
        path: [...path, name],
      });
    }

    const definition = parameters[name];
    if (definition === undefined) {
      throw new ExprError({
        code: 'expr.unknown_identifier',
        message: `Unknown parameter "${name}".`,
      });
    }
    const parameter = normalizeParameterDefinition(definition);

    visiting.add(name);
    if (parameter.kind === 'expression') {
      for (const dependency of collectIdentifiers(parseExpression(parameter.expression))) {
        visit(dependency, [...path, name]);
      }
    }
    visiting.delete(name);
    visited.add(name);
    order.push(name);
  };

  for (const name of Object.keys(parameters)) {
    visit(name, []);
  }
  return order;
}

function normalizeParameterDefinition(
  parameter: ParameterDefinition,
): NumberParameterDefinition | ExpressionParameterDefinition {
  if ('kind' in parameter) {
    return parameter;
  }
  if ('expression' in parameter) {
    return {
      kind: 'expression',
      expression: parameter.expression,
      unit: parameter.unit,
    };
  }
  return {
    kind: 'number',
    value: parameter.value,
    unit: parameter.unit,
  };
}

function collectIdentifiers(node: ExprNode): readonly string[] {
  const names = new Set<string>();
  const visit = (candidate: ExprNode): void => {
    switch (candidate.kind) {
      case 'identifier': {
        names.add(candidate.name);
        break;
      }
      case 'unary': {
        visit(candidate.operand);
        break;
      }
      case 'binary': {
        visit(candidate.left);
        visit(candidate.right);
        break;
      }
      case 'literal': {
        break;
      }
    }
  };
  visit(node);
  return [...names];
}

function assertSameUnit(operator: '+' | '-', left: Unit, right: Unit): void {
  if (left !== right) {
    throw new ExprError({
      code: 'expr.unit_mismatch',
      message: `Operator "${operator}" requires matching units, received ${left} and ${right}.`,
    });
  }
}

function multiply(left: Quantity, right: Quantity): Quantity {
  if (left.unit === 'count') {
    return { value: left.value * right.value, unit: right.unit };
  }
  if (right.unit === 'count') {
    return { value: left.value * right.value, unit: left.unit };
  }
  throw new ExprError({
    code: 'expr.unit_mismatch',
    message: `Operator "*" only supports multiplying a dimensional value by count, received ${left.unit} and ${right.unit}.`,
  });
}

function divide(left: Quantity, right: Quantity): Quantity {
  if (right.unit === 'count') {
    return { value: left.value / right.value, unit: left.unit };
  }
  if (left.unit === right.unit) {
    return { value: left.value / right.value, unit: 'count' };
  }
  throw new ExprError({
    code: 'expr.unit_mismatch',
    message: `Operator "/" requires a count divisor or matching units, received ${left.unit} and ${right.unit}.`,
  });
}
