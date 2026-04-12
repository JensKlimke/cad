/**
 * `/health` — liveness probe endpoint.
 *
 * The response shape is defined here (rather than inline in the harness)
 * so consumers can import `healthResponseSchema` and reuse the Zod type
 * in their own assertions. This is the pattern every future route will
 * follow: colocate schema + route plugin, export both.
 */

import { z } from 'zod';

import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

export const healthResponseSchema = z.object({
  ok: z.literal(true),
  uptimeSeconds: z.number().nonnegative(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

/**
 * Fastify plugin that registers the `GET /health` route. Registered on the
 * test harness and (in Slice 1) on the real server under `/api/v1/health`.
 */
export const healthRoute: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/health',
    {
      schema: {
        response: {
          200: healthResponseSchema,
        },
      },
    },
    () => ({
      ok: true as const,
      uptimeSeconds: process.uptime(),
    }),
  );
};
