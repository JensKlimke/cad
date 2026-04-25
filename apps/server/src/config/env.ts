/**
 * Strict environment configuration for `apps/server`.
 *
 * Every required value is validated at boot via Zod. A missing or
 * malformed variable throws immediately with a readable error
 * listing every issue, so misconfigured deployments fail loudly
 * before the server starts listening.
 *
 * The schema is the canonical contract — Compose env files,
 * `.env.example`, and CI secrets must all populate at least the
 * required fields below.
 */

import { z } from 'zod';

const NodeEnvSchema = z.enum(['development', 'test', 'production']);

const EnvSchema = z.object({
  NODE_ENV: NodeEnvSchema.default('development'),

  // ─── Network ────────────────────────────────────────────────────
  PORT: z.coerce.number().int().min(1).max(65_535).default(8080),
  HOST: z.string().default('0.0.0.0'),
  PUBLIC_BASE_URL: z.url(),
  CORS_ORIGINS: z
    .string()
    .optional()
    .transform((value) =>
      value === undefined || value.length === 0
        ? []
        : value
            .split(',')
            .map((origin) => origin.trim())
            .filter((origin) => origin.length > 0),
    ),

  // ─── Logging ────────────────────────────────────────────────────
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(100),
  RATE_LIMIT_TIME_WINDOW_SECONDS: z.coerce.number().int().min(1).default(60),

  // ─── Database ───────────────────────────────────────────────────
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),

  // ─── MinIO / S3 ─────────────────────────────────────────────────
  MINIO_ENDPOINT: z.url(),
  MINIO_REGION: z.string().default('us-east-1'),
  MINIO_ACCESS_KEY: z.string().min(1, 'MINIO_ACCESS_KEY is required'),
  MINIO_SECRET_KEY: z.string().min(1, 'MINIO_SECRET_KEY is required'),
  MINIO_BUCKET: z.string().min(1).default('cad-artifacts'),

  // ─── Auth (consumed by Wave B2b) ────────────────────────────────
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters (256 bits)'),
  JWT_EXPIRES_SECONDS: z.coerce
    .number()
    .int()
    .min(60)
    .default(60 * 60),
  ADMIN_EMAIL: z.email(),
  ADMIN_INITIAL_PASSWORD: z.string().min(8, 'ADMIN_INITIAL_PASSWORD must be at least 8 characters'),
  COOKIE_SECRET: z.string().min(32, 'COOKIE_SECRET must be at least 32 characters (256 bits)'),

  // ─── OIDC stub (gated; never actually reached in Slice 1) ───────
  OIDC_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  OIDC_DISCOVERY_URL: z.string().optional(),
  OIDC_CLIENT_ID: z.string().optional(),
  OIDC_CLIENT_SECRET: z.string().optional(),
  OIDC_REDIRECT_URI: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

/**
 * Parse `process.env` (or any other string-keyed source) into a
 * fully validated `Env` object. Throws a `ZodError` on the first
 * violation — wrap the call site in a try/catch and translate
 * `error.issues` into a human-readable startup error.
 */
export function parseEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return EnvSchema.parse(source);
}

/**
 * Format a Zod parse error from `parseEnv` as a human-readable
 * message. Used by `src/index.ts` so a failed boot prints every
 * missing or invalid variable, not just the first one.
 */
export function formatEnvError(error: z.ZodError): string {
  const issues = error.issues.map((issue) => {
    const path = issue.path.join('.');
    return `  - ${path}: ${issue.message}`;
  });
  return `Invalid server environment:\n${issues.join('\n')}`;
}
