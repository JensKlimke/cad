/**
 * Fastify application factory.
 *
 * `buildApp(env)` returns a fully configured Fastify instance —
 * not yet listening, so tests can hand the raw `app.server` to
 * Supertest or call `app.ready()` and inject requests via
 * `app.inject()`. Production callers (`src/index.ts`) call
 * `app.listen()` directly.
 *
 * Plugin registration order is load-bearing:
 *   1. observability — sets up the request id correlation hook
 *   2. security      — helmet, cors, rate-limit, sensible
 *   3. cookie        — required by i18n for the cad_locale read
 *   4. i18n          — request-scoped t() and locale (from @cad/i18n)
 *   5. db            — Drizzle client decorator
 *   6. storage       — MinIO/S3 service decorator + bucket bootstrap
 *   7. openapi       — placeholder for Slice 12
 *   8. routes        — health + (Wave C) auth/projects/documents
 *
 * Each plugin is registered via `fastify-plugin` so its
 * decorators leak out of the encapsulation boundary.
 */

import cookie from '@fastify/cookie';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';

import { ApiError, toErrorEnvelope } from './errors.js';
import authPlugin from './plugins/auth.js';
import configPlugin from './plugins/config.js';
import dbPlugin from './plugins/db.js';
import i18nPlugin from './plugins/i18n.js';
import observabilityPlugin from './plugins/observability.js';
import openapiPlugin from './plugins/openapi.js';
import securityPlugin from './plugins/security.js';
import storagePlugin from './plugins/storage.js';
import { authRoutes } from './routes/auth/index.js';
import { documentsRoutes } from './routes/documents/index.js';
import { healthRoute } from './routes/health.js';
import { projectsRoutes } from './routes/projects/index.js';

import type { Env } from './config/env.js';

export interface BuildAppOptions {
  readonly env: Env;
  /** Override Fastify's logger (tests pass `false`). */
  readonly logger?: boolean | object;
}

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger:
      options.logger ??
      (options.env.NODE_ENV === 'production'
        ? { level: options.env.LOG_LEVEL }
        : {
            level: options.env.LOG_LEVEL,
            transport: { target: 'pino-pretty', options: { colorize: true } },
          }),
    disableRequestLogging: false,
    genReqId: () => crypto.randomUUID(),
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // Canonical error handler — every thrown ApiError or unknown
  // exception becomes the @cad/protocol ErrorEnvelopeSchema shape.
  app.setErrorHandler((error, request, reply) => {
    const envelope = toErrorEnvelope(error, request.id);
    const statusCode = error instanceof ApiError ? error.statusCode : 500;
    if (statusCode >= 500) {
      request.log.error({ err: error }, 'unhandled error in request handler');
    } else {
      const message = error instanceof Error ? error.message : String(error);
      request.log.warn({ err: message }, 'request rejected');
    }
    reply.code(statusCode).send(envelope);
  });

  await app.register(configPlugin, { env: options.env });
  await app.register(observabilityPlugin);
  await app.register(securityPlugin, { env: options.env });
  await app.register(cookie, { secret: options.env.COOKIE_SECRET });
  await app.register(i18nPlugin);
  await app.register(dbPlugin, { env: options.env });
  await app.register(storagePlugin, { env: options.env });
  await app.register(authPlugin, { env: options.env });
  await app.register(openapiPlugin);

  await app.register(healthRoute);
  await app.register(authRoutes);
  await app.register(projectsRoutes);
  await app.register(documentsRoutes);

  await app.ready();
  return app;
}
