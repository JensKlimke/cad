/**
 * GET /auth/me
 *
 * Returns the authenticated user's identity. Used by the web
 * client's `AuthContext` to populate the initial state on page
 * load (when only the cookie survives a refresh). Requests with no
 * session cookie return `null` rather than 401 so the login screen
 * can boot without surfacing a failed request in the browser console.
 */

import { createUserRepo } from '@cad/db';
import { MeSessionResponseSchema } from '@cad/protocol';

import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

export const meRoute: FastifyPluginAsyncZod = async (fastify) => {
  fastify.get(
    '/auth/me',
    {
      schema: { response: { 200: MeSessionResponseSchema } },
    },
    async (request) => {
      const sessionCookie = request.cookies['cad_session'];
      if (sessionCookie === undefined || sessionCookie.length === 0) {
        return null;
      }

      await fastify.requireAuth(request, undefined as never);
      const user = request.user;
      if (user === undefined) {
        return null;
      }
      const userRepo = createUserRepo(fastify.db);
      const row = await userRepo.findById({
        workspaceId: user.workspaceId,
        userId: user.userId,
      });
      if (row === null) {
        throw fastify.httpErrors.unauthorized('User no longer exists.');
      }
      return {
        userId: row.id,
        email: row.email,
        role: row.role,
        workspaceId: row.workspaceId,
        createdAt: row.createdAt.toISOString(),
      };
    },
  );
};
