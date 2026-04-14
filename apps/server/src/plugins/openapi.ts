/**
 * OpenAPI documentation plugin (placeholder).
 *
 * Slice 1 ships the Fastify Zod type provider so every route's
 * request and response schemas are validated at runtime, but the
 * generated OpenAPI document itself only becomes a meaningful
 * deliverable in Slice 12 (API surface hardening). The plugin
 * exists today as a registration point so later slices can
 * mount `/openapi.json` and Swagger UI without re-plumbing.
 */

import fp from 'fastify-plugin';

import type { FastifyPluginAsync } from 'fastify';

const openapiPlugin: FastifyPluginAsync = async () => {
  // Slice 12 will register `@fastify/swagger` and
  // `@fastify/swagger-ui` here.
};

export default fp(openapiPlugin, { name: 'cad-openapi' });
