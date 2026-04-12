/**
 * Fastify test harness.
 *
 * Slice 0 ships the minimum surface that lets Supertest round-trip a real
 * Fastify instance end-to-end: JSON parser, Zod type provider, `/health`
 * endpoint, graceful shutdown. Slice 1 extends `createTestApp` with route
 * plugins for projects, documents, and auth.
 *
 * The harness is returned "not listening" — callers can either `.listen()`
 * it on an ephemeral port for subprocess tests, or hand the raw `app.server`
 * http.Server to Supertest without binding, which is faster and more
 * deterministic.
 */

import Fastify, { type FastifyInstance } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';

import { healthRoute } from './health.js';

export interface TestAppOptions {
  /** Override Fastify's logger. Defaults to `false` (silent). */
  readonly logger?: FastifyInstance['log'] | boolean;
}

/**
 * Build a Fastify instance wired for Zod validation and populated with the
 * Slice 0 `/health` endpoint. Callers MUST call `close()` during teardown.
 */
export async function createTestApp(options: TestAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? false,
    disableRequestLogging: true,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(healthRoute);
  await app.ready();

  return app;
}
