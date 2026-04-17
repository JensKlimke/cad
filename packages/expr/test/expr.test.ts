import { describe, expect, it } from 'vitest';

import {
  ExprError,
  evaluateExpression,
  evaluateParameters,
  evaluateParsedExpression,
  parseExpression,
} from '../src/index.js';

describe('@cad/expr', () => {
  it('parses binary precedence correctly', () => {
    const parsed = parseExpression('2 + 3 * 4');
    expect(parsed.kind).toBe('binary');
    if (parsed.kind !== 'binary') {
      return;
    }
    expect(parsed.operator).toBe('+');
    expect(parsed.right.kind).toBe('binary');
  });

  it('parses unary operators and parentheses', () => {
    const parsed = parseExpression('-(width + 2)');
    expect(parsed.kind).toBe('unary');
    if (parsed.kind !== 'unary') {
      return;
    }
    expect(parsed.operand.kind).toBe('binary');
  });

  it('parses bare literals and identifiers', () => {
    const literal = parseExpression('42');
    expect(literal).toMatchObject({
      kind: 'literal',
      value: 42,
      range: { start: 0, end: 2 },
    });

    const identifier = parseExpression('width');
    expect(identifier).toMatchObject({
      kind: 'identifier',
      name: 'width',
      range: { start: 0, end: 5 },
    });
  });

  it('keeps operator ranges spanning the full infix expression', () => {
    const parsed = parseExpression('2 + 3');
    expect(parsed).toMatchObject({
      kind: 'binary',
      range: { start: 0, end: 5 },
    });
  });

  it('evaluates parameter dependencies in topological order', () => {
    const result = evaluateParameters({
      width: { kind: 'number', value: 10, unit: 'mm' },
      depth: { kind: 'number', value: 20, unit: 'mm' },
      height: { kind: 'expression', expression: '2 * width + depth / 2', unit: 'mm' },
    });

    expect(result.order).toEqual(['width', 'depth', 'height']);
    expect(result.values.height).toMatchObject({ value: 30, unit: 'mm' });
  });

  it('reuses already-visited dependencies without duplicating the order', () => {
    const result = evaluateParameters({
      width: { value: 10, unit: 'mm' },
      depth: { expression: 'width', unit: 'mm' },
      height: { expression: 'width + depth', unit: 'mm' },
    });

    expect(result.order).toEqual(['width', 'depth', 'height']);
    expect(result.values.height).toMatchObject({ value: 20, unit: 'mm' });
  });

  it('accepts shorthand parameter definitions', () => {
    const result = evaluateParameters({
      width: { value: 10, unit: 'mm' },
      height: { expression: '2 * width', unit: 'mm' },
    });
    expect(result.values.height).toMatchObject({ value: 20, unit: 'mm' });
  });

  it('supports dimensional division to count', () => {
    const result = evaluateExpression('width / depth', {
      width: { value: 10, unit: 'mm' },
      depth: { value: 2, unit: 'mm' },
    });
    expect(result).toEqual({ value: 5, unit: 'count' });
  });

  it('supports multiplying by count and dividing by count', () => {
    expect(
      evaluateExpression('2 * width', {
        width: { value: 10, unit: 'mm' },
      }),
    ).toEqual({ value: 20, unit: 'mm' });
    expect(
      evaluateExpression('width / 2', {
        width: { value: 10, unit: 'mm' },
      }),
    ).toEqual({ value: 5, unit: 'mm' });
  });

  it('evaluates parsed literals, identifiers, and unary operators', () => {
    expect(
      evaluateParsedExpression(parseExpression('7'), {
        get(name) {
          throw new Error(`Unexpected identifier lookup for ${name}`);
        },
      }),
    ).toEqual({ value: 7, unit: 'count' });

    expect(
      evaluateParsedExpression(parseExpression('width'), {
        get(name) {
          expect(name).toBe('width');
          return { value: 10, unit: 'mm' };
        },
      }),
    ).toEqual({ value: 10, unit: 'mm' });

    expect(
      evaluateParsedExpression(parseExpression('+width'), {
        get() {
          return { value: 10, unit: 'mm' };
        },
      }),
    ).toEqual({ value: 10, unit: 'mm' });

    expect(
      evaluateParsedExpression(parseExpression('-width'), {
        get() {
          return { value: 10, unit: 'mm' };
        },
      }),
    ).toEqual({ value: -10, unit: 'mm' });
  });

  it('rejects parameter cycles', () => {
    expect(() =>
      evaluateParameters({
        a: { kind: 'expression', expression: 'b', unit: 'count' },
        b: { kind: 'expression', expression: 'a', unit: 'count' },
      }),
    ).toThrow(ExprError);
  });

  it('rejects unknown identifiers and divide-by-zero', () => {
    expect(() => evaluateExpression('missing', {})).toThrow(ExprError);
    expect(() =>
      evaluateParameters({
        width: { expression: 'missing', unit: 'mm' },
      }),
    ).toThrow(ExprError);
    expect(() =>
      evaluateExpression('width / zero', {
        width: { value: 10, unit: 'mm' },
        zero: { value: 0, unit: 'count' },
      }),
    ).toThrow(ExprError);
  });

  it('rejects unit mismatches', () => {
    expect(() =>
      evaluateExpression('length + angle', {
        length: { value: 10, unit: 'mm' },
        angle: { value: 45, unit: 'deg' },
      }),
    ).toThrow(ExprError);
    expect(() =>
      evaluateExpression('length * angle', {
        length: { value: 10, unit: 'mm' },
        angle: { value: 45, unit: 'deg' },
      }),
    ).toThrow(ExprError);
    expect(() =>
      evaluateExpression('length / angle', {
        length: { value: 10, unit: 'mm' },
        angle: { value: 45, unit: 'deg' },
      }),
    ).toThrow(ExprError);
  });

  it('rejects invalid syntax', () => {
    expect(() => parseExpression('2 + )')).toThrow(ExprError);
    expect(() => parseExpression('@bad')).toThrow(ExprError);
    expect(() => parseExpression('(2 + 3')).toThrow(ExprError);
    expect(() => parseExpression('2 3')).toThrow(ExprError);
  });
});
