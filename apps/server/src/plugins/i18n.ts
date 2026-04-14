/**
 * Fastify i18n plugin.
 *
 * Resolves the active locale per request via the
 * `cad_locale` cookie → `Accept-Language` header → English
 * fallback chain, then constructs a request-scoped i18next
 * instance via `createServerI18n()` from `@cad/i18n` and decorates
 * the request with `request.t` and `request.locale`.
 *
 * This is the **first server consumer** of Slice 0b's i18n
 * runtime. The cookie name (`cad_locale`) is identical to what
 * `@cad/i18n`'s browser detector writes, so a user who selects
 * German in the web app gets German-translated error envelopes
 * without any extra round-trip.
 */

import { DEFAULT_LOCALE, createServerI18n, isSupportedLocale, type Locale } from '@cad/i18n';
import fp from 'fastify-plugin';

import type { FastifyPluginAsync, FastifyRequest } from 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    /** Active locale resolved from cookie / header / fallback. */
    locale: Locale;
    /** Translation function bound to the active locale. */
    t: Awaited<ReturnType<typeof createServerI18n>>['t'];
  }
}

const COOKIE_NAME = 'cad_locale';

function readLocaleFromCookie(request: FastifyRequest): Locale | undefined {
  const cookies = request.cookies as Record<string, string | undefined> | undefined;
  const value = cookies?.[COOKIE_NAME];
  return isSupportedLocale(value) ? value : undefined;
}

function readLocaleFromAcceptLanguage(request: FastifyRequest): Locale | undefined {
  const header = request.headers['accept-language'];
  if (typeof header !== 'string' || header.length === 0) {
    return undefined;
  }
  // Pull the first language tag, strip quality parameters and
  // region suffixes (`en-US` → `en`).
  const first = header.split(',')[0]?.split(';')[0]?.trim().toLowerCase();
  if (first === undefined) {
    return undefined;
  }
  const primary = first.split('-')[0];
  return isSupportedLocale(primary) ? primary : undefined;
}

const i18nPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', async (request) => {
    const locale =
      readLocaleFromCookie(request) ?? readLocaleFromAcceptLanguage(request) ?? DEFAULT_LOCALE;
    const instance = await createServerI18n({ locale });
    request.locale = locale;
    request.t = instance.t.bind(instance);
  });
};

export default fp(i18nPlugin, {
  name: 'cad-i18n',
  // Request decorators only — no other plugin depends on this at
  // registration time, but observability must run first so the
  // request id is available in any log line the hook emits.
  dependencies: [],
});
