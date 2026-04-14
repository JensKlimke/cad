/**
 * Authentication service.
 *
 * Pure functions for password hashing and JWT issue/verify. No
 * Fastify, no database — the auth plugin (auth.ts) and the auth
 * routes (Wave C) compose these primitives with their own state.
 *
 * Argon2id parameters are tuned for ~50 ms hash time on the
 * Docker runtime: m=65536 (64 MiB), t=3, p=4. These match the OWASP
 * 2023 recommended baseline.
 *
 * JWT signing uses HMAC-SHA256 with the env-supplied secret. Tokens
 * carry `sub` (user id), `wsid` (workspace id), `role`, `jti` (a
 * fresh ULID), and standard `iat` / `exp` claims.
 */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import { ulid } from '@cad/db';
import argon2 from 'argon2';

const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 65_536,
  timeCost: 3,
  parallelism: 4,
} as const;

/** Hash a plaintext password with argon2id. */
export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, ARGON2_OPTIONS);
}

/** Verify a plaintext password against a stored argon2id hash. */
export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  try {
    // `argon2.verify` reads the parameters from the hash itself
    // (Modular Crypt Format), so passing the original options
    // object is unnecessary and triggers a typing mismatch.
    return await argon2.verify(hash, plain);
  } catch {
    // argon2.verify throws on malformed hashes; treat as a
    // verification failure rather than a 500.
    return false;
  }
}

export interface AccessTokenClaims {
  /** User id (`sub`). */
  readonly userId: string;
  /** Workspace id (`wsid`). */
  readonly workspaceId: string;
  /** User role. */
  readonly role: 'admin' | 'member';
}

export interface AccessTokenIssueOptions extends AccessTokenClaims {
  /** Token lifetime in seconds. Defaults to 3600. */
  readonly expiresInSeconds?: number;
}

export interface IssuedAccessToken {
  readonly token: string;
  /** ULID `jti` claim — used for revocation by `@cad/db` SessionRepo. */
  readonly jti: string;
  /** Expiry timestamp in ms since epoch. */
  readonly expiresAt: Date;
}

interface JwtPayload extends AccessTokenClaims {
  readonly jti: string;
  readonly iat: number;
  readonly exp: number;
  readonly sub: string;
  readonly wsid: string;
}

const HEADER = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));

function base64UrlEncode(input: string | Buffer): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return buf.toString('base64url');
}

function base64UrlDecode(input: string): Buffer {
  return Buffer.from(input, 'base64url');
}

function sign(payload: string, secret: string): string {
  const data = `${HEADER}.${payload}`;
  const signature = createHmac('sha256', secret).update(data).digest();
  return base64UrlEncode(signature);
}

/** Issue a signed JWT access token. */
export function issueAccessToken(
  options: AccessTokenIssueOptions,
  secret: string,
): IssuedAccessToken {
  const expiresInSeconds = options.expiresInSeconds ?? 3600;
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + expiresInSeconds;
  const jti = ulid();
  const payload: JwtPayload = {
    sub: options.userId,
    userId: options.userId,
    wsid: options.workspaceId,
    workspaceId: options.workspaceId,
    role: options.role,
    jti,
    iat,
    exp,
  };
  const encoded = base64UrlEncode(JSON.stringify(payload));
  const signature = sign(encoded, secret);
  return {
    token: `${HEADER}.${encoded}.${signature}`,
    jti,
    expiresAt: new Date(exp * 1000),
  };
}

export type VerifyResult =
  | { readonly valid: true; readonly payload: JwtPayload }
  | { readonly valid: false; readonly reason: 'malformed' | 'bad-signature' | 'expired' };

/** Verify an incoming JWT and return its payload if valid. */
export function verifyAccessToken(token: string, secret: string): VerifyResult {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return { valid: false, reason: 'malformed' };
  }
  const [header, payload, signature] = parts;
  if (header === undefined || payload === undefined || signature === undefined) {
    return { valid: false, reason: 'malformed' };
  }
  if (header !== HEADER) {
    return { valid: false, reason: 'malformed' };
  }

  const expected = sign(payload, secret);
  const expectedBuf = Buffer.from(expected, 'utf8');
  const actualBuf = Buffer.from(signature, 'utf8');
  if (expectedBuf.length !== actualBuf.length || !timingSafeEqual(expectedBuf, actualBuf)) {
    return { valid: false, reason: 'bad-signature' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(base64UrlDecode(payload).toString('utf8'));
  } catch {
    return { valid: false, reason: 'malformed' };
  }
  if (!isJwtPayload(parsed)) {
    return { valid: false, reason: 'malformed' };
  }
  if (parsed.exp <= Math.floor(Date.now() / 1000)) {
    return { valid: false, reason: 'expired' };
  }
  return { valid: true, payload: parsed };
}

function isJwtPayload(value: unknown): value is JwtPayload {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const v = value as Record<string, unknown>;
  return (
    typeof v['sub'] === 'string' &&
    typeof v['wsid'] === 'string' &&
    typeof v['userId'] === 'string' &&
    typeof v['workspaceId'] === 'string' &&
    (v['role'] === 'admin' || v['role'] === 'member') &&
    typeof v['jti'] === 'string' &&
    typeof v['iat'] === 'number' &&
    typeof v['exp'] === 'number'
  );
}

/** Generate a cryptographically random hex string for ad-hoc secrets. */
export function generateSecret(byteLength = 32): string {
  return randomBytes(byteLength).toString('hex');
}
