/**
 * /auth route group.
 *
 * Mounts login, logout, and me under a single Fastify plugin so
 * the buildApp factory only has to register one entry point per
 * resource.
 */

import { loginRoute } from './login.js';
import { logoutRoute } from './logout.js';
import { meRoute } from './me.js';

import type { FastifyPluginAsync } from 'fastify';

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(loginRoute);
  await fastify.register(logoutRoute);
  await fastify.register(meRoute);
};
