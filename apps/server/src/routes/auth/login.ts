/**
 * POST /auth/login
 *
 * Authenticates a local user via email + password, issues a JWT,
 * and sets the `cad_session` cookie. The cookie is HTTP-only so
 * the JWT is unreachable from JavaScript; the response body
 * carries only the user identity so the web client's AuthContext
 * does not need an immediate `/auth/me` round-trip.
 *
 * Single workspace (Slice 1): the lookup uses the default
 * workspace, which is identified at boot by `seedOnFirstBoot`.
 * Multi-workspace dispatch lands in Slice 12.
 */

import { createUserRepo } from '@cad/db';
import { workspaces } from '@cad/db/schema';
import { LoginRequestSchema, LoginResponseSchema } from '@cad/protocol';

import { invalidCredentials } from '../../errors.js';
import { issueAccessToken, verifyPassword } from '../../services/auth.js';

import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

const COOKIE_NAME = 'cad_session';

export const loginRoute: FastifyPluginAsyncZod = async (fastify) => {
  fastify.post(
    '/auth/login',
    {
      schema: {
        body: LoginRequestSchema,
        response: { 200: LoginResponseSchema },
      },
    },
    async (request, reply) => {
      const { email, password } = request.body;

      // Slice 1 single-workspace: pick the only row.
      const wsRows = await fastify.db.select({ id: workspaces.id }).from(workspaces).limit(1);
      const workspace = wsRows[0];
      if (workspace === undefined) {
        // Database has no workspaces — seeder hasn't run. Return
        // generic invalid-credentials so the client cannot
        // distinguish "no users exist" from "wrong password".
        throw invalidCredentials();
      }

      const userRepo = createUserRepo(fastify.db);
      const user = await userRepo.findByEmail({
        workspaceId: workspace.id,
        email,
      });
      if (user === null) {
        throw invalidCredentials();
      }

      const ok = await verifyPassword(password, user.passwordHash);
      if (!ok) {
        throw invalidCredentials();
      }

      const env = fastify.config;
      const issued = issueAccessToken(
        {
          userId: user.id,
          workspaceId: user.workspaceId,
          role: user.role,
          expiresInSeconds: env.JWT_EXPIRES_SECONDS,
        },
        env.JWT_SECRET,
      );

      reply.setCookie(COOKIE_NAME, issued.token, {
        httpOnly: true,
        secure: env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/',
        maxAge: env.JWT_EXPIRES_SECONDS,
      });

      return {
        userId: user.id,
        email: user.email,
        role: user.role,
        workspaceId: user.workspaceId,
      };
    },
  );
};
