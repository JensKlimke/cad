/**
 * Shared cookie helpers for the API integration suite.
 *
 * Fastify's `app.inject()` exposes `Set-Cookie` as either a single
 * string or an array of strings depending on how many cookies the
 * response carries. `extractSessionCookie` parses either shape and
 * returns the `cad_session` value, or throws if the cookie is
 * missing — callers rely on it in `beforeAll` hooks where a
 * missing cookie should stop the suite immediately.
 */

export const SESSION_COOKIE_NAME = 'cad_session';

function normalizeSetCookie(header: string | string[] | undefined): readonly string[] {
  if (typeof header === 'string') {
    return [header];
  }
  if (Array.isArray(header)) {
    return header;
  }
  return [];
}

/** Extract the `cad_session` cookie value from a `Set-Cookie` header. */
export function extractSessionCookie(header: string | string[] | undefined): string {
  for (const line of normalizeSetCookie(header)) {
    const [nameValue] = line.split(';');
    if (nameValue === undefined) {
      continue;
    }
    const [name, value] = nameValue.split('=');
    if (name === SESSION_COOKIE_NAME && value !== undefined && value.length > 0) {
      return value;
    }
  }
  throw new Error(`cookies: ${SESSION_COOKIE_NAME} was not set on the response`);
}
