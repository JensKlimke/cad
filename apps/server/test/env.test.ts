/**
 * Unit tests for the env parser.
 *
 * Pure-function coverage on `src/config/env.ts`. Verifies the
 * happy path, every required field, sane defaults, and the
 * `formatEnvError` rendering used at boot.
 */

import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';

import { formatEnvError, parseEnv } from '../src/config/env.js';

const baseValid = {
  DATABASE_URL: 'postgresql://cad:cad@localhost:5432/cad',
  PUBLIC_BASE_URL: 'http://localhost:5173',
  MINIO_ENDPOINT: 'http://localhost:9000',
  MINIO_ACCESS_KEY: 'cadadmin',
  MINIO_SECRET_KEY: 'cadadminsecret',
  JWT_SECRET: 'a'.repeat(32),
  COOKIE_SECRET: 'b'.repeat(32),
  ADMIN_EMAIL: 'admin@example.test',
  ADMIN_INITIAL_PASSWORD: 'changeme123',
} as const;

describe('parseEnv — happy path', () => {
  it('parses a minimal valid env', () => {
    const env = parseEnv(baseValid);
    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(8080);
    expect(env.HOST).toBe('0.0.0.0');
    expect(env.LOG_LEVEL).toBe('info');
    expect(env.RATE_LIMIT_MAX).toBe(100);
    expect(env.RATE_LIMIT_TIME_WINDOW_SECONDS).toBe(60);
    expect(env.MINIO_BUCKET).toBe('cad-artifacts');
    expect(env.JWT_EXPIRES_SECONDS).toBe(3600);
    expect(env.OIDC_ENABLED).toBe(false);
    expect(env.CORS_ORIGINS).toEqual([]);
  });

  it('coerces PORT from a string', () => {
    const env = parseEnv({ ...baseValid, PORT: '9090' });
    expect(env.PORT).toBe(9090);
  });

  it('coerces rate limit settings from strings', () => {
    const env = parseEnv({ ...baseValid, RATE_LIMIT_MAX: '1000', RATE_LIMIT_TIME_WINDOW_SECONDS: '300' });
    expect(env.RATE_LIMIT_MAX).toBe(1000);
    expect(env.RATE_LIMIT_TIME_WINDOW_SECONDS).toBe(300);
  });

  it('parses CORS_ORIGINS as a comma-separated list', () => {
    const env = parseEnv({
      ...baseValid,
      CORS_ORIGINS: 'http://a.test, http://b.test , http://c.test',
    });
    expect(env.CORS_ORIGINS).toEqual(['http://a.test', 'http://b.test', 'http://c.test']);
  });

  it('treats OIDC_ENABLED=true as a boolean', () => {
    const env = parseEnv({ ...baseValid, OIDC_ENABLED: 'true' });
    expect(env.OIDC_ENABLED).toBe(true);
  });
});

describe('parseEnv — failure modes', () => {
  it('rejects a missing DATABASE_URL', () => {
    const { DATABASE_URL: _omit, ...rest } = baseValid;
    expect(() => parseEnv(rest)).toThrow(ZodError);
  });

  it('rejects a JWT_SECRET shorter than 32 chars', () => {
    expect(() => parseEnv({ ...baseValid, JWT_SECRET: 'too-short' })).toThrow(ZodError);
  });

  it('rejects a COOKIE_SECRET shorter than 32 chars', () => {
    expect(() => parseEnv({ ...baseValid, COOKIE_SECRET: 'short' })).toThrow(ZodError);
  });

  it('rejects an ADMIN_INITIAL_PASSWORD shorter than 8 chars', () => {
    expect(() => parseEnv({ ...baseValid, ADMIN_INITIAL_PASSWORD: 'short' })).toThrow(ZodError);
  });

  it('rejects a malformed ADMIN_EMAIL', () => {
    expect(() => parseEnv({ ...baseValid, ADMIN_EMAIL: 'not-an-email' })).toThrow(ZodError);
  });

  it('rejects a malformed PUBLIC_BASE_URL', () => {
    expect(() => parseEnv({ ...baseValid, PUBLIC_BASE_URL: 'not a url' })).toThrow(ZodError);
  });

  it('rejects a PORT outside 1..65535', () => {
    expect(() => parseEnv({ ...baseValid, PORT: '70000' })).toThrow(ZodError);
  });
});

describe('formatEnvError', () => {
  it('renders every issue on its own line with the field path', () => {
    // Capture the ZodError unconditionally so the assertions live
    // outside the try/catch (vitest forbids conditional expects).
    let captured: ZodError | undefined;
    try {
      parseEnv({ JWT_SECRET: 'short' });
    } catch (error: unknown) {
      if (error instanceof ZodError) {
        captured = error;
      }
    }
    expect(captured).toBeInstanceOf(ZodError);
    const formatted = formatEnvError(captured as ZodError);
    expect(formatted.startsWith('Invalid server environment:')).toBe(true);
    expect(formatted).toContain('DATABASE_URL');
    expect(formatted).toContain('JWT_SECRET');
  });
});
