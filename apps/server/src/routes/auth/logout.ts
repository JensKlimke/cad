/**
 * POST /auth/logout
 *
 * Reads the JWT `jti` from the verified session, inserts it into
 * the SessionRepo revocation table with `expiresAt = jwt.exp`,
 * clears the session cookie, and returns `{ ok: true }`.
 */

import { createSessionRepo } from '@cad/db';
import { LogoutResponseSchema } from '@cad/protocol';

import { unauthorized } from '../../errors.js';

import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

const COOKIE_NAME = 'cad_session';

function shouldUseSecureSessionCookie(publicBaseUrl: string): boolean {
  return new URL(publicBaseUrl).protocol === 'https:';
}

export const logoutRoute: FastifyPluginAsyncZod = async (fastify) => {
  fastify.post(
    '/auth/logout',
    {
      schema: {
        response: { 200: LogoutResponseSchema },
      },
      preHandler: fastify.requireAuth,
    },
    async (request, reply) => {
      const user = request.user;
      if (user === undefined) {
        // requireAuth guarantees `user` is set; this branch
        // exists only to narrow for the type checker.
        throw unauthorized();
      }

      const sessionRepo = createSessionRepo(fastify.db);
      const expiresAt = new Date(Date.now() + fastify.config.JWT_EXPIRES_SECONDS * 1000);
      await sessionRepo.revoke({
        jti: user.jti,
        userId: user.userId,
        expiresAt,
      });

      reply.clearCookie(COOKIE_NAME, {
        path: '/',
        httpOnly: true,
        secure: shouldUseSecureSessionCookie(fastify.config.PUBLIC_BASE_URL),
        sameSite: 'strict',
      });
      return { ok: true as const };
    },
  );
};
