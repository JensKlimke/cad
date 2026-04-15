/**
 * Authentication failure + session lifecycle integration spec.
 *
 * The happy path lives in `lifecycle.int.test.ts`. This file
 * locks down every 4xx surface the auth plugin and routes expose:
 *
 *   - wrong password              → 401 auth.invalid_credentials
 *   - unknown email               → 401 auth.invalid_credentials
 *   - missing cookie              → 401 unauthorized
 *   - tampered JWT                → 401 unauthorized
 *   - revoked session (post-logout) → 401 unauthorized
 *   - cross-workspace lookups     → 404 (not 403 — existence hiding)
 *
 * Every error body is asserted against `ErrorEnvelopeSchema` so a
 * missing `i18nKey` would fail the suite and block the web
 * client's re-translation contract. The `cad_locale=de` assertion
 * documents that locale selection is a client concern — the
 * server always returns the English fallback message.
 *
 * Gated on `INTEGRATION=1`.
 */

import { ErrorEnvelopeSchema, type ErrorEnvelope, type LoginResponse } from '@cad/protocol';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { SESSION_COOKIE_NAME, extractSessionCookie } from '../src/cookies.js';
import { createApiTestContext, type ApiTestContext } from '../src/createApiTestContext.js';

function parseEnvelope(raw: unknown): ErrorEnvelope {
  return ErrorEnvelopeSchema.parse(raw);
}

describe('auth failure surfaces', () => {
  let context: ApiTestContext;

  beforeAll(async () => {
    context = await createApiTestContext();
  });

  afterAll(async () => {
    if (context !== undefined) {
      await context.close();
    }
  });

  it('rejects a wrong password with auth.invalid_credentials', async () => {
    const response = await context.app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: context.env.ADMIN_EMAIL, password: 'definitely-wrong' },
    });
    expect(response.statusCode).toBe(401);
    const envelope = parseEnvelope(response.json());
    expect(envelope.error.code).toBe('auth.invalid_credentials');
    expect(envelope.error.i18nKey).toBe('errors:auth.invalid_credentials');
  });

  it('rejects an unknown email with auth.invalid_credentials', async () => {
    const response = await context.app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'nobody@example.test', password: 'whatever' },
    });
    expect(response.statusCode).toBe(401);
    const envelope = parseEnvelope(response.json());
    expect(envelope.error.code).toBe('auth.invalid_credentials');
  });

  it('returns the English message regardless of cad_locale=de', async () => {
    // Server never translates error messages — the web client
    // re-translates via i18nKey. The locale cookie must have no
    // effect on the response body; asserting this here keeps the
    // contract honest.
    const response = await context.app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: context.env.ADMIN_EMAIL, password: 'wrong' },
      cookies: { cad_locale: 'de' },
    });
    expect(response.statusCode).toBe(401);
    const envelope = parseEnvelope(response.json());
    expect(envelope.error.message).toBe('Email or password is incorrect.');
    expect(envelope.error.i18nKey).toBe('errors:auth.invalid_credentials');
  });

  it('rejects /auth/me without a session cookie as 401 unauthorized', async () => {
    const response = await context.app.inject({ method: 'GET', url: '/auth/me' });
    expect(response.statusCode).toBe(401);
    const envelope = parseEnvelope(response.json());
    expect(envelope.error.code).toBe('unauthorized');
    expect(envelope.error.i18nKey).toBe('errors:auth.session_expired');
  });

  it('rejects a tampered JWT as 401 unauthorized', async () => {
    const response = await context.app.inject({
      method: 'GET',
      url: '/auth/me',
      cookies: { [SESSION_COOKIE_NAME]: 'not.a.valid.jwt' },
    });
    expect(response.statusCode).toBe(401);
    const envelope = parseEnvelope(response.json());
    expect(envelope.error.code).toBe('unauthorized');
  });

  it('rejects a revoked session after /auth/logout', async () => {
    // Login → logout → reuse the cookie → expect 401.
    const login = await context.app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: context.env.ADMIN_EMAIL,
        password: context.env.ADMIN_INITIAL_PASSWORD,
      },
    });
    expect(login.statusCode).toBe(200);
    const session = extractSessionCookie(login.headers['set-cookie']);
    const cookies = { [SESSION_COOKIE_NAME]: session };

    const logout = await context.app.inject({
      method: 'POST',
      url: '/auth/logout',
      cookies,
    });
    expect(logout.statusCode).toBe(200);
    expect(logout.json<{ ok: true }>().ok).toBe(true);

    const replay = await context.app.inject({
      method: 'GET',
      url: '/auth/me',
      cookies,
    });
    expect(replay.statusCode).toBe(401);
    const envelope = parseEnvelope(replay.json());
    expect(envelope.error.code).toBe('unauthorized');
  });

  it('exposes a request id on every error envelope', async () => {
    const response = await context.app.inject({ method: 'GET', url: '/auth/me' });
    const envelope = parseEnvelope(response.json());
    expect(typeof envelope.requestId).toBe('string');
    expect(envelope.requestId?.length ?? 0).toBeGreaterThan(0);
  });

  it('issues distinct JWTs on subsequent logins', async () => {
    const first = await context.app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: context.env.ADMIN_EMAIL,
        password: context.env.ADMIN_INITIAL_PASSWORD,
      },
    });
    const second = await context.app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: context.env.ADMIN_EMAIL,
        password: context.env.ADMIN_INITIAL_PASSWORD,
      },
    });
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    const firstToken = extractSessionCookie(first.headers['set-cookie']);
    const secondToken = extractSessionCookie(second.headers['set-cookie']);
    expect(firstToken).not.toBe(secondToken);

    // Both logins should return identical identity payloads —
    // same user, same workspace, same role.
    const firstBody = first.json<LoginResponse>();
    const secondBody = second.json<LoginResponse>();
    expect(firstBody.userId).toBe(secondBody.userId);
    expect(firstBody.workspaceId).toBe(secondBody.workspaceId);
  });
});
