/**
 * Round-trip tests for `@cad/protocol/auth` schemas.
 */

import { describe, expect, it } from 'vitest';

import {
  LoginRequestSchema,
  LoginResponseSchema,
  LogoutResponseSchema,
  MeResponseSchema,
  UserRoleSchema,
} from '../src/auth.js';

const VALID_ULID = '01HQ8K3VBRZ8XGRGY5T0WJD8AB';

describe('UserRoleSchema', () => {
  it.each(['admin', 'member'] as const)('accepts %s', (role) => {
    expect(UserRoleSchema.parse(role)).toBe(role);
  });

  it('rejects an unknown role', () => {
    expect(() => UserRoleSchema.parse('superuser')).toThrow();
  });
});

describe('LoginRequestSchema', () => {
  it('parses a happy path login', () => {
    const result = LoginRequestSchema.parse({
      email: 'admin@example.test',
      password: 'correct horse battery staple',
    });
    expect(result.email).toBe('admin@example.test');
    expect(result.password).toBe('correct horse battery staple');
  });

  it('rejects an empty password', () => {
    expect(() => LoginRequestSchema.parse({ email: 'admin@example.test', password: '' })).toThrow();
  });

  it('rejects an absurdly long password', () => {
    expect(() =>
      LoginRequestSchema.parse({
        email: 'admin@example.test',
        password: 'x'.repeat(257),
      }),
    ).toThrow();
  });

  it('rejects a malformed email', () => {
    expect(() => LoginRequestSchema.parse({ email: 'not-an-email', password: 'pw' })).toThrow();
  });
});

describe('LoginResponseSchema', () => {
  it('parses a complete login response', () => {
    const result = LoginResponseSchema.parse({
      userId: VALID_ULID,
      email: 'admin@example.test',
      role: 'admin',
      workspaceId: VALID_ULID,
    });
    expect(result.userId).toBe(VALID_ULID);
    expect(result.role).toBe('admin');
  });

  it('rejects a response with a malformed user id', () => {
    expect(() =>
      LoginResponseSchema.parse({
        userId: 'not-a-ulid',
        email: 'admin@example.test',
        role: 'admin',
        workspaceId: VALID_ULID,
      }),
    ).toThrow();
  });
});

describe('LogoutResponseSchema', () => {
  it('parses { ok: true }', () => {
    expect(LogoutResponseSchema.parse({ ok: true })).toEqual({ ok: true });
  });

  it('rejects { ok: false }', () => {
    expect(() => LogoutResponseSchema.parse({ ok: false })).toThrow();
  });
});

describe('MeResponseSchema', () => {
  it('parses a complete me response', () => {
    const result = MeResponseSchema.parse({
      userId: VALID_ULID,
      email: 'admin@example.test',
      role: 'member',
      workspaceId: VALID_ULID,
      createdAt: '2026-04-14T10:30:00Z',
    });
    expect(result.role).toBe('member');
  });
});
