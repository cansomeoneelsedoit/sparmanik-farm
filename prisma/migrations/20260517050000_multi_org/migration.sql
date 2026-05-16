-- Multi-org / multi-tenant. Every tenant-scoped table gains an organization_id
-- and all existing rows are backfilled to the "Sparmanik Farm" org. Two
-- empty orgs (Andre Melon, Kevin Farm) are created. Dev User gets membership
-- in all three; every other existing user gets membership in Sparmanik only.

-- ===== Org core =====
CREATE TABLE "organizations" (
    "id"         TEXT NOT NULL,
    "name"       TEXT NOT NULL,
    "slug"       TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

INSERT INTO "organizations" ("id", "name", "slug") VALUES
    ('org_sparmanik', 'Sparmanik Farm', 'sparmanik'),
    ('org_andre',     'Andre Melon',    'andre'),
    ('org_kevin',     'Kevin Farm',     'kevin');

CREATE TYPE "OrgRole" AS ENUM ('OWNER', 'MEMBER');

CREATE TABLE "organization_memberships" (
    "user_id"         TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "role"            "OrgRole" NOT NULL DEFAULT 'MEMBER',
    "joined_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "organization_memberships_pkey" PRIMARY KEY ("user_id", "organization_id")
);
CREATE INDEX "organization_memberships_organization_id_idx" ON "organization_memberships"("organization_id");

ALTER TABLE "organization_memberships"
    ADD CONSTRAINT "organization_memberships_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
ALTER TABLE "organization_memberships"
    ADD CONSTRAINT "organization_memberships_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;

-- Memberships: Dev User is OWNER in all three; everyone else is MEMBER in
-- Sparmanik only. ON CONFLICT keeps the migration idempotent.
INSERT INTO "organization_memberships" ("user_id", "organization_id", "role")
SELECT id, 'org_sparmanik', 'OWNER' FROM "users" WHERE email = 'dev@sparmanikfarm.local'
ON CONFLICT DO NOTHING;
INSERT INTO "organization_memberships" ("user_id", "organization_id", "role")
SELECT id, 'org_andre',     'OWNER' FROM "users" WHERE email = 'dev@sparmanikfarm.local'
ON CONFLICT DO NOTHING;
INSERT INTO "organization_memberships" ("user_id", "organization_id", "role")
SELECT id, 'org_kevin',     'OWNER' FROM "users" WHERE email = 'dev@sparmanikfarm.local'
ON CONFLICT DO NOTHING;
INSERT INTO "organization_memberships" ("user_id", "organization_id", "role")
SELECT id, 'org_sparmanik', 'MEMBER' FROM "users" WHERE email != 'dev@sparmanikfarm.local'
ON CONFLICT DO NOTHING;

-- ===== Helper: add organization_id to a table with backfill + FK + index =====
-- Postgres doesn't support a true reusable function for DDL, so the pattern
-- is repeated for each tenant-scoped table below.

-- categories
ALTER TABLE "categories" ADD COLUMN "organization_id" TEXT;
UPDATE "categories" SET "organization_id" = 'org_sparmanik';
ALTER TABLE "categories" ALTER COLUMN "organization_id" SET NOT NULL;
-- The old globally-unique name index must be replaced with a per-org one so
-- each org can have its own "Nutrients" / "Other" / etc.
DROP INDEX IF EXISTS "categories_name_key";
CREATE UNIQUE INDEX "categories_organization_id_name_key" ON "categories"("organization_id", "name");
CREATE INDEX "categories_organization_id_idx" ON "categories"("organization_id");
ALTER TABLE "categories"
    ADD CONSTRAINT "categories_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;

-- produce
ALTER TABLE "produce" ADD COLUMN "organization_id" TEXT;
UPDATE "produce" SET "organization_id" = 'org_sparmanik';
ALTER TABLE "produce" ALTER COLUMN "organization_id" SET NOT NULL;
CREATE UNIQUE INDEX "produce_organization_id_name_key" ON "produce"("organization_id", "name");
CREATE INDEX "produce_organization_id_idx" ON "produce"("organization_id");
ALTER TABLE "produce"
    ADD CONSTRAINT "produce_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;

-- greenhouses
ALTER TABLE "greenhouses" ADD COLUMN "organization_id" TEXT;
UPDATE "greenhouses" SET "organization_id" = 'org_sparmanik';
ALTER TABLE "greenhouses" ALTER COLUMN "organization_id" SET NOT NULL;
CREATE INDEX "greenhouses_organization_id_idx" ON "greenhouses"("organization_id");
ALTER TABLE "greenhouses"
    ADD CONSTRAINT "greenhouses_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;

-- suppliers
ALTER TABLE "suppliers" ADD COLUMN "organization_id" TEXT;
UPDATE "suppliers" SET "organization_id" = 'org_sparmanik';
ALTER TABLE "suppliers" ALTER COLUMN "organization_id" SET NOT NULL;
CREATE INDEX "suppliers_organization_id_idx" ON "suppliers"("organization_id");
ALTER TABLE "suppliers"
    ADD CONSTRAINT "suppliers_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;

-- items
ALTER TABLE "items" ADD COLUMN "organization_id" TEXT;
UPDATE "items" SET "organization_id" = 'org_sparmanik';
ALTER TABLE "items" ALTER COLUMN "organization_id" SET NOT NULL;
CREATE INDEX "items_organization_id_idx" ON "items"("organization_id");
ALTER TABLE "items"
    ADD CONSTRAINT "items_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;

-- batches
ALTER TABLE "batches" ADD COLUMN "organization_id" TEXT;
UPDATE "batches" SET "organization_id" = 'org_sparmanik';
ALTER TABLE "batches" ALTER COLUMN "organization_id" SET NOT NULL;
CREATE INDEX "batches_organization_id_idx" ON "batches"("organization_id");
ALTER TABLE "batches"
    ADD CONSTRAINT "batches_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;

-- staff
ALTER TABLE "staff" ADD COLUMN "organization_id" TEXT;
UPDATE "staff" SET "organization_id" = 'org_sparmanik';
ALTER TABLE "staff" ALTER COLUMN "organization_id" SET NOT NULL;
CREATE INDEX "staff_organization_id_idx" ON "staff"("organization_id");
ALTER TABLE "staff"
    ADD CONSTRAINT "staff_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;

-- harvests
ALTER TABLE "harvests" ADD COLUMN "organization_id" TEXT;
UPDATE "harvests" SET "organization_id" = 'org_sparmanik';
ALTER TABLE "harvests" ALTER COLUMN "organization_id" SET NOT NULL;
CREATE INDEX "harvests_organization_id_idx" ON "harvests"("organization_id");
ALTER TABLE "harvests"
    ADD CONSTRAINT "harvests_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;

-- harvest_assets
ALTER TABLE "harvest_assets" ADD COLUMN "organization_id" TEXT;
UPDATE "harvest_assets" SET "organization_id" = 'org_sparmanik';
ALTER TABLE "harvest_assets" ALTER COLUMN "organization_id" SET NOT NULL;
CREATE INDEX "harvest_assets_organization_id_idx" ON "harvest_assets"("organization_id");
ALTER TABLE "harvest_assets"
    ADD CONSTRAINT "harvest_assets_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;

-- harvest_usages
ALTER TABLE "harvest_usages" ADD COLUMN "organization_id" TEXT;
UPDATE "harvest_usages" SET "organization_id" = 'org_sparmanik';
ALTER TABLE "harvest_usages" ALTER COLUMN "organization_id" SET NOT NULL;
CREATE INDEX "harvest_usages_organization_id_idx" ON "harvest_usages"("organization_id");
ALTER TABLE "harvest_usages"
    ADD CONSTRAINT "harvest_usages_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;

-- sales
ALTER TABLE "sales" ADD COLUMN "organization_id" TEXT;
UPDATE "sales" SET "organization_id" = 'org_sparmanik';
ALTER TABLE "sales" ALTER COLUMN "organization_id" SET NOT NULL;
CREATE INDEX "sales_organization_id_idx" ON "sales"("organization_id");
ALTER TABLE "sales"
    ADD CONSTRAINT "sales_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;

-- tasks
ALTER TABLE "tasks" ADD COLUMN "organization_id" TEXT;
UPDATE "tasks" SET "organization_id" = 'org_sparmanik';
ALTER TABLE "tasks" ALTER COLUMN "organization_id" SET NOT NULL;
CREATE INDEX "tasks_organization_id_idx" ON "tasks"("organization_id");
ALTER TABLE "tasks"
    ADD CONSTRAINT "tasks_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;

-- nutrient_recipes
ALTER TABLE "nutrient_recipes" ADD COLUMN "organization_id" TEXT;
UPDATE "nutrient_recipes" SET "organization_id" = 'org_sparmanik';
ALTER TABLE "nutrient_recipes" ALTER COLUMN "organization_id" SET NOT NULL;
CREATE INDEX "nutrient_recipes_organization_id_idx" ON "nutrient_recipes"("organization_id");
ALTER TABLE "nutrient_recipes"
    ADD CONSTRAINT "nutrient_recipes_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;

-- sops
ALTER TABLE "sops" ADD COLUMN "organization_id" TEXT;
UPDATE "sops" SET "organization_id" = 'org_sparmanik';
ALTER TABLE "sops" ALTER COLUMN "organization_id" SET NOT NULL;
CREATE INDEX "sops_organization_id_idx" ON "sops"("organization_id");
ALTER TABLE "sops"
    ADD CONSTRAINT "sops_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;

-- videos
ALTER TABLE "videos" ADD COLUMN "organization_id" TEXT;
UPDATE "videos" SET "organization_id" = 'org_sparmanik';
ALTER TABLE "videos" ALTER COLUMN "organization_id" SET NOT NULL;
CREATE INDEX "videos_organization_id_idx" ON "videos"("organization_id");
ALTER TABLE "videos"
    ADD CONSTRAINT "videos_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;

-- audit_actions
ALTER TABLE "audit_actions" ADD COLUMN "organization_id" TEXT;
UPDATE "audit_actions" SET "organization_id" = 'org_sparmanik';
ALTER TABLE "audit_actions" ALTER COLUMN "organization_id" SET NOT NULL;
CREATE INDEX "audit_actions_organization_id_idx" ON "audit_actions"("organization_id");
ALTER TABLE "audit_actions"
    ADD CONSTRAINT "audit_actions_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;

-- ai_conversations
ALTER TABLE "ai_conversations" ADD COLUMN "organization_id" TEXT;
UPDATE "ai_conversations" SET "organization_id" = 'org_sparmanik';
ALTER TABLE "ai_conversations" ALTER COLUMN "organization_id" SET NOT NULL;
CREATE INDEX "ai_conversations_organization_id_idx" ON "ai_conversations"("organization_id");
ALTER TABLE "ai_conversations"
    ADD CONSTRAINT "ai_conversations_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;

-- ai_messages
ALTER TABLE "ai_messages" ADD COLUMN "organization_id" TEXT;
UPDATE "ai_messages" SET "organization_id" = 'org_sparmanik';
ALTER TABLE "ai_messages" ALTER COLUMN "organization_id" SET NOT NULL;
CREATE INDEX "ai_messages_organization_id_idx" ON "ai_messages"("organization_id");
ALTER TABLE "ai_messages"
    ADD CONSTRAINT "ai_messages_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;
