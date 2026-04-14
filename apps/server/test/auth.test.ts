/**
 * Unit tests for the pure auth helpers.
 *
 * Argon2 hashing is real (no mocks), so each test costs ~50 ms on
 * a tuned dev machine — keep the test count small but exhaustive.
 */

import { describe, expect, it } from 'vitest';

import {
  generateSecret,
  hashPassword,
  issueAccessToken,
  verifyAccessToken,
  verifyPassword,
} from '../src/services/auth.js';

const TEST_SECRET = 'test-secret-must-be-at-least-32-bytes-long-for-hs256';

describe('hashPassword + verifyPassword', () => {
  it('round-trips a correct password', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(await verifyPassword('correct horse battery staple', hash)).toBe(true);
  });

  it('rejects an incorrect password', async () => {
    const hash = await hashPassword('original');
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });

  it('produces distinct hashes for the same password (random salt)', async () => {
    const a = await hashPassword('same');
    const b = await hashPassword('same');
    expect(a).not.toBe(b);
    expect(await verifyPassword('same', a)).toBe(true);
    expect(await verifyPassword('same', b)).toBe(true);
  });

  it('returns false on a malformed hash instead of throwing', async () => {
    expect(await verifyPassword('anything', 'not-a-valid-hash')).toBe(false);
  });
});

describe('issueAccessToken + verifyAccessToken', () => {
  const claims = {
    userId: '01HQ8K3VBRZ8XGRGY5T0WJD8AB',
    workspaceId: '01HQ8K3VBRZ8XGRGY5T0WJD8AC',
    role: 'admin',
  } as const;

  it('issues a JWT that round-trips through verify', () => {
    const issued = issueAccessToken(claims, TEST_SECRET);
    const result = verifyAccessToken(issued.token, TEST_SECRET);
    expect(result.valid).toBe(true);
    // Narrow once at the top so the assertions below are
    // unconditional (vitest forbids conditional expects).
    if (!result.valid) {
      throw new Error('expected verifyAccessToken to succeed');
    }
    expect(result.payload.userId).toBe(claims.userId);
    expect(result.payload.workspaceId).toBe(claims.workspaceId);
    expect(result.payload.role).toBe('admin');
    expect(result.payload.jti).toBe(issued.jti);
  });

  it('reports bad signature when the secret differs', () => {
    const issued = issueAccessToken(claims, TEST_SECRET);
    const result = verifyAccessToken(issued.token, 'a-different-secret-but-still-32-bytes-long');
    expect(result).toEqual({ valid: false, reason: 'bad-signature' });
  });

  it('reports malformed when the token has the wrong number of segments', () => {
    const result = verifyAccessToken('one.two', TEST_SECRET);
    expect(result).toEqual({ valid: false, reason: 'malformed' });
  });

  it('reports expired when the exp is in the past', () => {
    const issued = issueAccessToken({ ...claims, expiresInSeconds: -1 }, TEST_SECRET);
    const result = verifyAccessToken(issued.token, TEST_SECRET);
    expect(result).toEqual({ valid: false, reason: 'expired' });
  });

  it('respects the custom expiresInSeconds option', () => {
    const issued = issueAccessToken({ ...claims, expiresInSeconds: 120 }, TEST_SECRET);
    const expectedExpiry = Date.now() + 120 * 1000;
    expect(Math.abs(issued.expiresAt.getTime() - expectedExpiry)).toBeLessThan(2000);
  });

  it('produces a fresh jti for each issuance', () => {
    const a = issueAccessToken(claims, TEST_SECRET);
    const b = issueAccessToken(claims, TEST_SECRET);
    expect(a.jti).not.toBe(b.jti);
  });
});

describe('generateSecret', () => {
  it('returns a hex string of the expected length', () => {
    expect(generateSecret(16)).toMatch(/^[0-9a-f]{32}$/u);
    expect(generateSecret(32)).toMatch(/^[0-9a-f]{64}$/u);
  });

  it('defaults to 32 bytes (64 hex chars)', () => {
    expect(generateSecret()).toMatch(/^[0-9a-f]{64}$/u);
  });
});
