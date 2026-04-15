/**
 * Build a complete, validated `Env` for integration tests.
 *
 * Runs `parseEnv()` from `@cad/server/config/env` so every spec
 * uses the same schema contract as the production bootstrap —
 * if a new required field is added to `EnvSchema`, this helper
 * fails loudly rather than silently pushing the error into the
 * specs.
 */

import { parseEnv, type Env } from '@cad/server/config/env';

export interface TestEnvOverrides {
  readonly DATABASE_URL: string;
  readonly MINIO_ENDPOINT: string;
  readonly MINIO_ACCESS_KEY: string;
  readonly MINIO_SECRET_KEY: string;
}

const BASE_JWT_SECRET = 'a'.repeat(32);
const BASE_COOKIE_SECRET = 'b'.repeat(32);

/**
 * Produce a complete `Env` for a Testcontainers-backed harness.
 * Callers pass only the container-derived URLs; the helper fills
 * in stable defaults for everything else.
 */
export function buildTestEnv(overrides: TestEnvOverrides): Env {
  return parseEnv({
    NODE_ENV: 'test',
    PORT: '8080',
    HOST: '127.0.0.1',
    PUBLIC_BASE_URL: 'http://127.0.0.1:8080',
    CORS_ORIGINS: 'http://127.0.0.1:4173',
    LOG_LEVEL: 'silent',
    DATABASE_URL: overrides.DATABASE_URL,
    DATABASE_POOL_MAX: '4',
    MINIO_ENDPOINT: overrides.MINIO_ENDPOINT,
    MINIO_REGION: 'us-east-1',
    MINIO_ACCESS_KEY: overrides.MINIO_ACCESS_KEY,
    MINIO_SECRET_KEY: overrides.MINIO_SECRET_KEY,
    MINIO_BUCKET: 'cad-artifacts',
    JWT_SECRET: BASE_JWT_SECRET,
    JWT_EXPIRES_SECONDS: '3600',
    ADMIN_EMAIL: 'admin@test.local',
    ADMIN_INITIAL_PASSWORD: 'test-password-1234',
    COOKIE_SECRET: BASE_COOKIE_SECRET,
    OIDC_ENABLED: 'false',
  });
}
