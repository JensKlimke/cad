/**
 * Decorate the Fastify instance with the validated env so route
 * handlers can reach `fastify.config` without re-importing the
 * env module. Keeps routes pure functions of `(request, reply)`
 * and lets tests inject a fixture env via `buildApp({ env })`.
 */

import fp from 'fastify-plugin';

import type { Env } from '../config/env.js';
import type { FastifyPluginAsync } from 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    config: Env;
  }
}

export interface ConfigPluginOptions {
  readonly env: Env;
}

const configPlugin: FastifyPluginAsync<ConfigPluginOptions> = async (fastify, options) => {
  fastify.decorate('config', options.env);
};

export default fp(configPlugin, { name: 'cad-config' });
