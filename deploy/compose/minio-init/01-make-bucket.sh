#!/bin/sh
#
# MinIO init script — runs once on first compose boot via the
# minio-init service. Idempotent: re-running it on an existing bucket
# is a no-op.
#
# The script:
#   1. Configures the `cad` mc alias against the live MinIO container
#   2. Creates the artifacts bucket if it does not already exist
#   3. Sets the bucket to private (default; explicit for clarity)
#
# Slice 1 only consumes this bucket as a destination for presigned
# PUT/GET URLs. There is no anonymous access path.

set -eu

ALIAS=cad
BUCKET="${MINIO_BUCKET:-cad-artifacts}"
ENDPOINT="http://minio:9000"

echo "[minio-init] configuring mc alias '${ALIAS}' against ${ENDPOINT}"
mc alias set "${ALIAS}" "${ENDPOINT}" "${MINIO_ROOT_USER}" "${MINIO_ROOT_PASSWORD}"

if mc ls "${ALIAS}/${BUCKET}" >/dev/null 2>&1; then
  echo "[minio-init] bucket '${BUCKET}' already exists — nothing to do"
else
  echo "[minio-init] creating bucket '${BUCKET}'"
  mc mb "${ALIAS}/${BUCKET}"
fi

mc anonymous set none "${ALIAS}/${BUCKET}" || true

echo "[minio-init] done"
