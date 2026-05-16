-- Two-tier authorisation: SUPERUSER manages other users; USER is default.
-- The seed.ts ensures the Dev User stays / becomes SUPERUSER on every boot.

CREATE TYPE "UserRole" AS ENUM ('USER', 'SUPERUSER');

ALTER TABLE "users" ADD COLUMN "role" "UserRole" NOT NULL DEFAULT 'USER';

-- Promote the seeded Dev User immediately so /admin/users is reachable
-- right after the deploy without any manual SQL.
UPDATE "users" SET "role" = 'SUPERUSER' WHERE "email" = 'dev@sparmanikfarm.local';
