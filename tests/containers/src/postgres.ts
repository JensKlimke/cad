/**
 * Testcontainers factory for a Postgres 16 instance. Callers get a started
 * container plus a ready-to-use connection string; they are responsible for
 * calling `stop()` in their teardown hook. Teardown is idempotent — calling
 * `stop()` more than once is a no-op.
 *
 * The defaults mirror what `apps/server` (Slice 1) will expect locally so
 * the integration suite's Postgres matches the Docker Compose dev stack.
 */

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';

export interface StartedPostgres {
  /** Host-side connection string, ready for `pg.Client` / Drizzle / etc. */
  readonly connectionString: string;
  /** Host the container is bound to. Usually `127.0.0.1`. */
  readonly host: string;
  /** Random port the container is bound to on the host. */
  readonly port: number;
  /** Database name. */
  readonly database: string;
  /** Database username. */
  readonly username: string;
  /** Database password. */
  readonly password: string;
  /** Stop and remove the container. Safe to call more than once. */
  readonly stop: () => Promise<void>;
}

export interface StartPostgresOptions {
  /** Override the Postgres image tag. Defaults to `postgres:16-alpine`. */
  readonly image?: string;
  /** Database name to create. Defaults to `cad`. */
  readonly database?: string;
  /** Database user to create. Defaults to `cad`. */
  readonly username?: string;
  /** Database user password. Defaults to `cad`. */
  readonly password?: string;
}

/**
 * Start a Postgres 16 container. Throws if Docker is unreachable.
 *
 * Startup is typically 3–8 seconds on a warm machine. Set a Vitest
 * `beforeAll` timeout of 60 000 ms when booting Postgres from tests.
 */
export async function startPostgres(options: StartPostgresOptions = {}): Promise<StartedPostgres> {
  const image = options.image ?? 'postgres:16-alpine';
  const database = options.database ?? 'cad';
  const username = options.username ?? 'cad';
  const password = options.password ?? 'cad';

  const container: StartedPostgreSqlContainer = await new PostgreSqlContainer(image)
    .withDatabase(database)
    .withUsername(username)
    .withPassword(password)
    .start();

  let stopped = false;
  const stop = async (): Promise<void> => {
    if (stopped) return;
    stopped = true;
    await container.stop({ remove: true });
  };

  return {
    connectionString: container.getConnectionUri(),
    host: container.getHost(),
    port: container.getMappedPort(5432),
    database,
    username,
    password,
    stop,
  };
}
