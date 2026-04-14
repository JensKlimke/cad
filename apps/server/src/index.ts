/**
 * Top-level entrypoint for `apps/server`.
 *
 * Loads + validates the environment, builds the Fastify instance
 * via `buildApp`, starts listening, and installs a SIGTERM /
 * SIGINT handler that performs a graceful shutdown (close the
 * Fastify instance → close the db pool → exit).
 */

/* eslint-disable unicorn/no-process-exit -- this file IS the binary entry; process.exit is the right termination call */

import { ZodError } from 'zod';

import { buildApp } from './app.js';
import { formatEnvError, parseEnv } from './config/env.js';

async function main(): Promise<void> {
  let env;
  try {
    env = parseEnv();
  } catch (error: unknown) {
    if (error instanceof ZodError) {
      process.stderr.write(`${formatEnvError(error)}\n`);
      process.exit(1);
    }
    throw error;
  }

  const app = await buildApp({ env });

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, 'received shutdown signal — closing gracefully');
    try {
      await app.close();
      process.exit(0);
    } catch (error: unknown) {
      app.log.error({ err: error }, 'error during graceful shutdown');
      process.exit(1);
    }
  };

  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('SIGINT', () => void shutdown('SIGINT'));

  try {
    await app.listen({ port: env.PORT, host: env.HOST });
  } catch (error: unknown) {
    app.log.error({ err: error }, 'failed to start server');
    process.exit(1);
  }
}

void main();
