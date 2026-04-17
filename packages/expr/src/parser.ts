import { ExprError } from './errors.js';

import type { BinaryOperator, ExprNode, SourceRange } from './types.js';

const IDENTIFIER = /[A-Za-z_][A-Za-z0-9_]*/uy;
const NUMBER = /(?:\d+(?:\.\d+)?|\.\d+)/uy;

interface Token {
  readonly kind: 'number' | 'identifier' | 'operator' | 'paren' | 'eof';
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

class Tokenizer {
  #cursor = 0;

  constructor(private readonly source: string) {}

  next(): Token {
    this.skipWhitespace();
    if (this.#cursor >= this.source.length) {
      return { kind: 'eof', text: '', start: this.#cursor, end: this.#cursor };
    }

    const start = this.#cursor;
    IDENTIFIER.lastIndex = start;
    const identifier = IDENTIFIER.exec(this.source);
    if (identifier?.index === start) {
      this.#cursor = IDENTIFIER.lastIndex;
      return { kind: 'identifier', text: identifier[0], start, end: this.#cursor };
    }

    NUMBER.lastIndex = start;
    const number = NUMBER.exec(this.source);
    if (number?.index === start) {
      this.#cursor = NUMBER.lastIndex;
      return { kind: 'number', text: number[0], start, end: this.#cursor };
    }

    const char = this.source[start];
    if (char === undefined) {
      throw new ExprError({
        code: 'expr.syntax',
        message: 'Unexpected end of input in expression.',
        range: { start, end: this.#cursor },
      });
    }
    this.#cursor += 1;
    if ('+-*/'.includes(char)) {
      return { kind: 'operator', text: char, start, end: this.#cursor };
    }
    if (char === '(' || char === ')') {
      return { kind: 'paren', text: char, start, end: this.#cursor };
    }
    throw new ExprError({
      code: 'expr.syntax',
      message: `Unexpected token "${char}" in expression.`,
      range: { start, end: this.#cursor },
    });
  }

  private skipWhitespace(): void {
    while (this.#cursor < this.source.length) {
      const candidate = this.source[this.#cursor];
      if (candidate === undefined || !/\s/u.test(candidate)) {
        break;
      }
      this.#cursor += 1;
    }
  }
}

const PRECEDENCE: Record<BinaryOperator, number> = {
  '+': 10,
  '-': 10,
  '*': 20,
  '/': 20,
};

export function parseExpression(source: string): ExprNode {
  const tokenizer = new Tokenizer(source);
  let current = tokenizer.next();

  const consume = (): Token => {
    const token = current;
    current = tokenizer.next();
    return token;
  };

  const expect = (kind: Token['kind'], text?: string): Token => {
    if (current.kind !== kind || (text !== undefined && current.text !== text)) {
      throw new ExprError({
        code: 'expr.syntax',
        message:
          text === undefined
            ? `Expected ${kind} but found "${current.text || 'end of input'}".`
            : `Expected "${text}" but found "${current.text || 'end of input'}".`,
        range: { start: current.start, end: current.end },
      });
    }
    return consume();
  };

  const parsePrefix = (): ExprNode => {
    if (current.kind === 'number') {
      const token = consume();
      return {
        kind: 'literal',
        value: Number(token.text),
        range: { start: token.start, end: token.end },
      };
    }
    if (current.kind === 'identifier') {
      const token = consume();
      return {
        kind: 'identifier',
        name: token.text,
        range: { start: token.start, end: token.end },
      };
    }
    if (current.kind === 'operator' && (current.text === '+' || current.text === '-')) {
      const operator = consume();
      const operand = parseExpressionWithPrecedence(PRECEDENCE['*']);
      return {
        kind: 'unary',
        operator: operator.text as '+' | '-',
        operand,
        range: { start: operator.start, end: operand.range.end },
      };
    }
    if (current.kind === 'paren' && current.text === '(') {
      const open = consume();
      const expr = parseExpressionWithPrecedence(0);
      const close = expect('paren', ')');
      return {
        ...expr,
        range: { start: open.start, end: close.end },
      };
    }
    throw new ExprError({
      code: 'expr.syntax',
      message: `Unexpected token "${current.text || 'end of input'}" in expression.`,
      range: { start: current.start, end: current.end },
    });
  };

  const parseExpressionWithPrecedence = (minPrecedence: number): ExprNode => {
    let left = parsePrefix();

    while (current.kind === 'operator') {
      const operator = current.text as BinaryOperator;
      const precedence = PRECEDENCE[operator];
      if (precedence < minPrecedence) {
        break;
      }
      const token = consume();
      const right = parseExpressionWithPrecedence(precedence + 1);
      left = {
        kind: 'binary',
        operator,
        left,
        right,
        range: makeRange(left.range, right.range),
      };
      if (token.start < left.range.start) {
        left = { ...left, range: { start: token.start, end: left.range.end } };
      }
    }

    return left;
  };

  const expression = parseExpressionWithPrecedence(0);
  if (current.kind !== 'eof') {
    throw new ExprError({
      code: 'expr.syntax',
      message: `Unexpected trailing token "${current.text}".`,
      range: { start: current.start, end: current.end },
    });
  }
  return expression;
}

function makeRange(left: SourceRange, right: SourceRange): SourceRange {
  return { start: Math.min(left.start, right.start), end: Math.max(left.end, right.end) };
}
