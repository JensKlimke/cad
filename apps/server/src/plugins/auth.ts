/**
 * Authentication Fastify plugin.
 *
 * Decorates the Fastify instance with `requireAuth` and
 * `requireAdmin` request handlers and exposes the OIDC adapter
 * via `app.oidc`. The plugin reads the `cad_session` cookie,
 * verifies the JWT signature + expiry, checks the revocation
 * list via `@cad/db`'s SessionRepo, and attaches a `request.user`
 * object that downstream routes can rely on.
 */

import { createSessionRepo } from '@cad/db';
import fp from 'fastify-plugin';

import { unauthorized } from '../errors.js';
import { verifyAccessToken } from '../services/auth.js';
import { createOidcAdapter, type OidcAdapter } from '../services/oidc.js';

import type { Env } from '../config/env.js';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    oidc: OidcAdapter;
    requireAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireAdmin: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }

  interface FastifyRequest {
    user?: {
      readonly userId: string;
      readonly workspaceId: string;
      readonly role: 'admin' | 'member';
      readonly jti: string;
    };
  }
}

const COOKIE_NAME = 'cad_session';

export interface AuthPluginOptions {
  readonly env: Env;
}

const authPlugin: FastifyPluginAsync<AuthPluginOptions> = async (fastify, options) => {
  const oidc = createOidcAdapter(options.env);
  fastify.decorate('oidc', oidc);

  fastify.decorate(
    'requireAuth',
    async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
      const cookies = request.cookies as Record<string, string | undefined> | undefined;
      const token = cookies?.[COOKIE_NAME];
      if (token === undefined || token.length === 0) {
        throw unauthorized();
      }

      const verification = verifyAccessToken(token, options.env.JWT_SECRET);
      if (!verification.valid) {
        throw unauthorized(
          verification.reason === 'expired' ? 'Session expired.' : 'Authentication failed.',
        );
      }

      // Reject revoked sessions.
      const sessionRepo = createSessionRepo(fastify.db);
      const revoked = await sessionRepo.isRevoked(verification.payload.jti);
      if (revoked) {
        throw unauthorized('Session has been revoked.');
      }

      request.user = {
        userId: verification.payload.userId,
        workspaceId: verification.payload.workspaceId,
        role: verification.payload.role,
        jti: verification.payload.jti,
      };
    },
  );

  fastify.decorate(
    'requireAdmin',
    async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      await fastify.requireAuth(request, reply);
      if (request.user?.role !== 'admin') {
        throw unauthorized('Admin role required.');
      }
    },
  );
};

export default fp(authPlugin, {
  name: 'cad-auth',
  dependencies: ['cad-db'],
});
