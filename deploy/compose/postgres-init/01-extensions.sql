-- Postgres initialization script for the CAD on-prem stack.
--
-- Runs once on first boot of an empty `cad-pg-data` volume via the
-- `docker-entrypoint-initdb.d` mechanism. Idempotent so a manual
-- re-run on a populated database is a no-op.
--
-- Extensions installed:
--   citext   — case-insensitive text columns; used for `users.email`
--              so login lookups stay constant-time without a custom
--              lower(email) index.
--   pgcrypto — `gen_random_uuid()` and other primitives. Slice 1
--              uses ULIDs for primary keys (generated client-side in
--              `@cad/db/src/ids.ts`), but pgcrypto is cheap to install
--              and avoids a future migration when downstream features
--              need crypto primitives.

CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
