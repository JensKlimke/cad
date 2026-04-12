/**
 * Testcontainers factory for a MinIO S3-compatible object store. Used by
 * integration tests that need a real bucket (Slice 1's project asset store,
 * Slice 10's STEP/STL export pipeline, etc.).
 *
 * Unlike Postgres we cannot use a dedicated module — `testcontainers` does
 * not yet ship a `MinioContainer`, so we drive the generic `GenericContainer`
 * with the documented MinIO entrypoint.
 */

import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers';

export interface StartedMinio {
  /** Full S3 endpoint URL (including scheme + host + mapped port). */
  readonly endpoint: string;
  /** Host the container is bound to. Usually `127.0.0.1`. */
  readonly host: string;
  /** Mapped host port for the S3 API (default container port 9000). */
  readonly port: number;
  /** Root access key. */
  readonly accessKey: string;
  /** Root secret key. */
  readonly secretKey: string;
  /** Stop and remove the container. Safe to call more than once. */
  readonly stop: () => Promise<void>;
}

export interface StartMinioOptions {
  /** Override the MinIO image tag. Defaults to the official latest-stable. */
  readonly image?: string;
  /** Root access key. Defaults to `cadadmin`. */
  readonly accessKey?: string;
  /** Root secret key. Defaults to `cadadminsecret`. */
  readonly secretKey?: string;
}

const S3_API_PORT = 9000;

/**
 * Start a MinIO container. Throws if Docker is unreachable. Startup is
 * typically 1–3 seconds; set a Vitest `beforeAll` timeout of 60 000 ms.
 */
export async function startMinio(options: StartMinioOptions = {}): Promise<StartedMinio> {
  const image = options.image ?? 'minio/minio:latest';
  const accessKey = options.accessKey ?? 'cadadmin';
  const secretKey = options.secretKey ?? 'cadadminsecret';

  const container: StartedTestContainer = await new GenericContainer(image)
    .withExposedPorts(S3_API_PORT)
    .withEnvironment({
      MINIO_ROOT_USER: accessKey,
      MINIO_ROOT_PASSWORD: secretKey,
    })
    .withCommand(['server', '/data'])
    .withWaitStrategy(Wait.forHttp('/minio/health/ready', S3_API_PORT).forStatusCode(200))
    .start();

  const host = container.getHost();
  const port = container.getMappedPort(S3_API_PORT);
  let stopped = false;
  const stop = async (): Promise<void> => {
    if (stopped) return;
    stopped = true;
    await container.stop({ remove: true });
  };

  return {
    endpoint: `http://${host}:${port}`,
    host,
    port,
    accessKey,
    secretKey,
    stop,
  };
}
