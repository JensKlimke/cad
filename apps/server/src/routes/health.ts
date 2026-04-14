/**
 * Health and readiness endpoints.
 *
 * `/health` is a liveness probe — returns 200 unconditionally as
 * long as the process is reachable. `/ready` is a readiness probe
 * — returns 200 only when the database and storage backends are
 * both reachable.
 *
 * Used by the Compose `migrator` → `server` health check, the
 * Slice 1 verification checklist, and any future Kubernetes
 * deployment.
 */

import { sql } from 'drizzle-orm';
import { z } from 'zod';

import type { FastifyPluginAsync } from 'fastify';

const HealthResponse = z.object({
  ok: z.literal(true),
  service: z.string(),
  uptimeSeconds: z.number(),
});

const ReadyResponse = z.object({
  ok: z.boolean(),
  checks: z.object({
    db: z.boolean(),
    storage: z.boolean(),
  }),
});

const STARTED_AT = Date.now();

export const healthRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/health',
    {
      schema: {
        response: { 200: HealthResponse },
      },
    },
    async () => ({
      ok: true as const,
      service: '@cad/server',
      uptimeSeconds: Math.floor((Date.now() - STARTED_AT) / 1000),
    }),
  );

  fastify.get(
    '/ready',
    {
      schema: {
        response: { 200: ReadyResponse, 503: ReadyResponse },
      },
    },
    async (_request, reply) => {
      const dbOk = await checkDb(fastify);
      const storageOk = await checkStorage(fastify);
      const ok = dbOk && storageOk;
      reply.code(ok ? 200 : 503);
      return { ok, checks: { db: dbOk, storage: storageOk } };
    },
  );
};

async function checkDb(fastify: {
  db: { execute: (q: ReturnType<typeof sql>) => Promise<unknown> };
  log: { warn: (obj: unknown, msg: string) => void };
}): Promise<boolean> {
  try {
    await fastify.db.execute(sql`SELECT 1`);
    return true;
  } catch (error: unknown) {
    fastify.log.warn({ err: error }, '/ready: db check failed');
    return false;
  }
}

async function checkStorage(fastify: {
  storage: { ensureBucket: () => Promise<void> };
  log: { warn: (obj: unknown, msg: string) => void };
}): Promise<boolean> {
  try {
    await fastify.storage.ensureBucket();
    return true;
  } catch (error: unknown) {
    fastify.log.warn({ err: error }, '/ready: storage check failed');
    return false;
  }
}
