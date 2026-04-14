/**
 * Drizzle Kit config.
 *
 * Reads the schema barrel and emits SQL migrations into `drizzle/`.
 * Used by `pnpm --filter @cad/db drizzle-kit generate` (locally,
 * during Wave B1) and by the migrator script in Wave B1+.
 *
 * `dbCredentials.url` is sourced from the runtime env at migration
 * time — Drizzle Kit reads it via `process.env.DATABASE_URL`. Local
 * generation does not need a live database.
 */

import type { Config } from 'drizzle-kit';

const config: Config = {
  schema: './src/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env['DATABASE_URL'] ?? 'postgresql://cad:cad@localhost:5432/cad',
  },
  strict: true,
  verbose: true,
};

export default config;
