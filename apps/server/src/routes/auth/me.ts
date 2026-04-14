/**
 * GET /auth/me
 *
 * Returns the authenticated user's identity. Used by the web
 * client's `AuthContext` to populate the initial state on page
 * load (when only the cookie survives a refresh).
 */

import { createUserRepo } from '@cad/db';
import { MeResponseSchema } from '@cad/protocol';

import { unauthorized } from '../../errors.js';

import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

export const meRoute: FastifyPluginAsyncZod = async (fastify) => {
  fastify.get(
    '/auth/me',
    {
      schema: { response: { 200: MeResponseSchema } },
      preHandler: fastify.requireAuth,
    },
    async (request) => {
      const user = request.user;
      if (user === undefined) {
        throw unauthorized();
      }
      const userRepo = createUserRepo(fastify.db);
      const row = await userRepo.findById({
        workspaceId: user.workspaceId,
        userId: user.userId,
      });
      if (row === null) {
        // The JWT references a deleted user — same effect as
        // session revocation.
        throw unauthorized('User no longer exists.');
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
