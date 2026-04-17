/**
 * MinIO/S3 storage service.
 *
 * Wraps the AWS S3 client with the operations the Slice 1 server
 * actually needs: bucket bootstrap, presigned PUT, presigned GET.
 * Direct bucket URLs are never exposed — every artifact is reached
 * via a short-TTL pre-signed URL minted by this service.
 */

import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import type { Env } from '../config/env.js';

const PRESIGN_TTL_SECONDS = 5 * 60;

export interface PresignedUrl {
  readonly url: string;
  readonly expiresAt: Date;
}

export interface StorageService {
  /** Create the artifacts bucket if it does not already exist. */
  ensureBucket(): Promise<void>;
  /** Mint a short-TTL presigned PUT URL for `key`. */
  presignPut(key: string, contentType: string): Promise<PresignedUrl>;
  /** Mint a short-TTL presigned GET URL for `key`. */
  presignGet(key: string): Promise<PresignedUrl>;
  /** Persist an object to the artifacts bucket. */
  putObject(key: string, body: string | Uint8Array, contentType: string): Promise<void>;
  /** Underlying S3 client (for advanced use; routes should not need this). */
  readonly client: S3Client;
  /** Bucket name. */
  readonly bucket: string;
}

export interface StorageServiceOptions {
  readonly env: Env;
}

export function createStorageService({ env }: StorageServiceOptions): StorageService {
  const client = new S3Client({
    endpoint: env.MINIO_ENDPOINT,
    region: env.MINIO_REGION,
    credentials: {
      accessKeyId: env.MINIO_ACCESS_KEY,
      secretAccessKey: env.MINIO_SECRET_KEY,
    },
    forcePathStyle: true, // MinIO requires path-style URLs
  });

  const bucket = env.MINIO_BUCKET;

  return {
    client,
    bucket,

    async ensureBucket() {
      try {
        await client.send(new HeadBucketCommand({ Bucket: bucket }));
      } catch (error: unknown) {
        // 404 / NoSuchBucket → create. Anything else → rethrow.
        if (
          typeof error === 'object' &&
          error !== null &&
          'name' in error &&
          (error.name === 'NotFound' || error.name === 'NoSuchBucket')
        ) {
          await client.send(new CreateBucketCommand({ Bucket: bucket }));
          return;
        }
        throw error;
      }
    },

    async presignPut(key, contentType) {
      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: contentType,
      });
      const url = await getSignedUrl(client, command, { expiresIn: PRESIGN_TTL_SECONDS });
      return { url, expiresAt: new Date(Date.now() + PRESIGN_TTL_SECONDS * 1000) };
    },

    async presignGet(key) {
      const command = new GetObjectCommand({ Bucket: bucket, Key: key });
      const url = await getSignedUrl(client, command, { expiresIn: PRESIGN_TTL_SECONDS });
      return { url, expiresAt: new Date(Date.now() + PRESIGN_TTL_SECONDS * 1000) };
    },

    async putObject(key, body, contentType) {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
        }),
      );
    },
  };
}
