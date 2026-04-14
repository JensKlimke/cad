/**
 * Unit tests for the OIDC stub adapter.
 *
 * The stub itself never reaches a real IdP — Slice 12 wires that.
 * What we lock in here is the env contract: enabled vs disabled,
 * required-vars-when-enabled, and the failure modes downstream
 * code can rely on.
 */

import { describe, expect, it } from 'vitest';

import { parseEnv } from '../src/config/env.js';
import { createOidcAdapter } from '../src/services/oidc.js';

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

describe('createOidcAdapter — disabled (default)', () => {
  it('returns a no-op adapter when OIDC_ENABLED is false', () => {
    const env = parseEnv(baseValid);
    const adapter = createOidcAdapter(env);
    expect(adapter.enabled).toBe(false);
  });

  it('throws on beginLogin when disabled', async () => {
    const adapter = createOidcAdapter(parseEnv(baseValid));
    await expect(adapter.beginLogin('state-1')).rejects.toThrow(/not enabled/);
  });

  it('throws on completeLogin when disabled', async () => {
    const adapter = createOidcAdapter(parseEnv(baseValid));
    await expect(adapter.completeLogin('code-1', 'state-1')).rejects.toThrow(/not enabled/);
  });
});

describe('createOidcAdapter — enabled stub', () => {
  const enabledEnv = {
    ...baseValid,
    OIDC_ENABLED: 'true',
    OIDC_DISCOVERY_URL: 'https://idp.example.test/.well-known/openid-configuration',
    OIDC_CLIENT_ID: 'cad',
    OIDC_CLIENT_SECRET: 'super-secret',
    OIDC_REDIRECT_URI: 'http://localhost:8080/auth/oidc/callback',
  } as const;

  it('builds a stub adapter when every required var is set', () => {
    const env = parseEnv(enabledEnv);
    const adapter = createOidcAdapter(env);
    expect(adapter.enabled).toBe(true);
  });

  it('throws when OIDC_DISCOVERY_URL is missing', () => {
    const { OIDC_DISCOVERY_URL: _omit, ...rest } = enabledEnv;
    const env = parseEnv(rest);
    expect(() => createOidcAdapter(env)).toThrow(/OIDC_DISCOVERY_URL/);
  });

  it('throws when OIDC_CLIENT_ID is missing', () => {
    const { OIDC_CLIENT_ID: _omit, ...rest } = enabledEnv;
    const env = parseEnv(rest);
    expect(() => createOidcAdapter(env)).toThrow(/OIDC_CLIENT_ID/);
  });

  it('beginLogin throws "not yet implemented" with diagnostic context', async () => {
    const adapter = createOidcAdapter(parseEnv(enabledEnv));
    await expect(adapter.beginLogin('state-2')).rejects.toThrow(/not yet implemented/);
  });

  it('completeLogin throws "not yet implemented" with diagnostic context', async () => {
    const adapter = createOidcAdapter(parseEnv(enabledEnv));
    await expect(adapter.completeLogin('code-2', 'state-2')).rejects.toThrow(/not yet implemented/);
  });
});
