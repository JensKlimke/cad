/**
 * Drizzle client decorator.
 *
 * Constructs a `DbClient` from `@cad/db` at boot time and decorates
 * the Fastify instance with `app.db`. Routes reach the database
 * via `request.server.db` (or via `app.db` from inside plugins).
 *
 * The pool is closed via the `onClose` hook, so a graceful
 * shutdown of the Fastify instance also tears down the connection
 * pool.
 */

import { closeDbClient, createDbClient, type DbClient } from '@cad/db';
import fp from 'fastify-plugin';

import type { Env } from '../config/env.js';
import type { FastifyPluginAsync } from 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    db: DbClient;
  }
}

export interface DbPluginOptions {
  readonly env: Env;
}

const dbPlugin: FastifyPluginAsync<DbPluginOptions> = async (fastify, options) => {
  const db = createDbClient({
    DATABASE_URL: options.env.DATABASE_URL,
    DATABASE_POOL_MAX: options.env.DATABASE_POOL_MAX,
  });
  fastify.decorate('db', db);
  fastify.addHook('onClose', async () => {
    await closeDbClient(db);
  });
};

export default fp(dbPlugin, { name: 'cad-db' });
