import {
  HandbookListResponseSchema,
  HandbookPageSchema,
  HandbookSearchResponseSchema,
  type LoginResponse,
} from '@cad/protocol';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { SESSION_COOKIE_NAME, extractSessionCookie } from '../src/cookies.js';
import { createApiTestContext, type ApiTestContext } from '../src/createApiTestContext.js';

describe('/handbook/*', () => {
  let context: ApiTestContext;
  let cookies: Record<string, string>;

  beforeAll(async () => {
    context = await createApiTestContext();
    const login = await context.app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: context.env.ADMIN_EMAIL,
        password: context.env.ADMIN_INITIAL_PASSWORD,
      },
    });
    if (login.statusCode !== 200) {
      throw new Error(`handbook.int.test: login failed (status ${String(login.statusCode)})`);
    }
    login.json<LoginResponse>();
    cookies = { [SESSION_COOKIE_NAME]: extractSessionCookie(login.headers['set-cookie']) };
  });

  afterAll(async () => {
    await context?.close();
  });

  it('searches handbook topics', async () => {
    const response = await context.app.inject({
      method: 'GET',
      url: '/handbook/search?q=pad&locale=en',
      cookies,
    });
    expect(response.statusCode).toBe(200);
    const payload = HandbookSearchResponseSchema.parse(response.json());
    expect(payload.items.some((item) => item.path === '/handbook/features/pad')).toBe(true);
  });

  it('loads a localized page with English fallback metadata', async () => {
    const response = await context.app.inject({
      method: 'GET',
      url: '/handbook/pages/features/pad?locale=de',
      cookies,
    });
    expect(response.statusCode).toBe(200);
    const payload = HandbookPageSchema.parse(response.json());
    expect(payload.path).toBe('/handbook/features/pad');
    expect(payload.sourceLocale).toBe('en');
    expect(payload.isFallback).toBe(true);
    expect(payload.html).toContain('<h1 id="pad">Pad</h1>');
  });

  it('lists concept topics', async () => {
    const response = await context.app.inject({
      method: 'GET',
      url: '/handbook/list?kind=concepts&locale=en',
      cookies,
    });
    expect(response.statusCode).toBe(200);
    const payload = HandbookListResponseSchema.parse(response.json());
    expect(payload.items.length).toBeGreaterThan(0);
    expect(payload.items.every((item) => item.kind === 'concepts')).toBe(true);
  });

  it('looks up a page by SDK op id', async () => {
    const response = await context.app.inject({
      method: 'GET',
      url: '/handbook/sdk/pad?locale=en',
      cookies,
    });
    expect(response.statusCode).toBe(200);
    const payload = HandbookPageSchema.parse(response.json());
    expect(payload.sdkOpId).toBe('pad');
    expect(payload.path).toBe('/handbook/features/pad');
  });
});
