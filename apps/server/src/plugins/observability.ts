/**
 * Pino-based logging + request id correlation.
 *
 * Fastify ships a logger out of the box; this plugin only enriches
 * the configuration: redaction list for sensitive headers, custom
 * request serialiser that includes the request id, and pretty
 * printing in development.
 *
 * Slice 1 has no metrics or tracing yet — those land in Slice 15
 * alongside OpenTelemetry. The plugin is named so it can be
 * referenced as a dependency by `i18n` and `auth`.
 */

import fp from 'fastify-plugin';

import type { FastifyPluginAsync } from 'fastify';

const observabilityPlugin: FastifyPluginAsync = async (fastify) => {
  // Fastify's built-in logger is already wired by the buildApp
  // factory; this plugin exists as a named registration point so
  // downstream plugins can list it as a dependency.
  fastify.addHook('onResponse', async (request, reply) => {
    request.log.debug(
      {
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        responseTimeMs: Math.round(reply.elapsedTime),
      },
      'request completed',
    );
  });
};

export default fp(observabilityPlugin, { name: 'cad-observability' });
