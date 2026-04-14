/**
 * Storage service decorator.
 *
 * Builds a `StorageService` against the configured MinIO/S3
 * endpoint and decorates the Fastify instance with `app.storage`.
 * `ensureBucket()` runs at boot time inside a try/catch so a
 * missing MinIO during plain unit tests does not crash the boot;
 * the failure is logged at warn level and the bucket bootstrap is
 * deferred to the first real PUT.
 */

import fp from 'fastify-plugin';

import { createStorageService, type StorageService } from '../services/storage.js';

import type { Env } from '../config/env.js';
import type { FastifyPluginAsync } from 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    storage: StorageService;
  }
}

export interface StoragePluginOptions {
  readonly env: Env;
}

const storagePlugin: FastifyPluginAsync<StoragePluginOptions> = async (fastify, options) => {
  const storage = createStorageService({ env: options.env });
  fastify.decorate('storage', storage);

  try {
    await storage.ensureBucket();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    fastify.log.warn(
      { err: message },
      'storage: ensureBucket failed at boot — first PUT will retry',
    );
  }
};

export default fp(storagePlugin, { name: 'cad-storage' });
