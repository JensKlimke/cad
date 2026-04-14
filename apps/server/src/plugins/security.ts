/**
 * Security middleware: helmet, CORS, rate limit, sensible.
 *
 * Slice 1 baselines: 100 req/min per IP, strict CORS allowlist
 * sourced from `env.CORS_ORIGINS`, helmet defaults, and Fastify
 * Sensible's HTTP error helpers.
 *
 * Per-user rate limiting and CSRF protection are deferred to Slice
 * 12 (API surface hardening).
 */

import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import fp from 'fastify-plugin';

import type { Env } from '../config/env.js';
import type { FastifyPluginAsync } from 'fastify';

export interface SecurityPluginOptions {
  readonly env: Env;
}

const securityPlugin: FastifyPluginAsync<SecurityPluginOptions> = async (fastify, options) => {
  await fastify.register(helmet, {
    contentSecurityPolicy: false, // SPA bundle controls its own CSP
  });
  await fastify.register(cors, {
    origin: options.env.CORS_ORIGINS.length > 0 ? options.env.CORS_ORIGINS : false,
    credentials: true,
  });
  await fastify.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  });
  await fastify.register(sensible);
};

export default fp(securityPlugin, { name: 'cad-security' });
