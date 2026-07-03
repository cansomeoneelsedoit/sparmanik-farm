-- App review #38 (duplicate customers/suppliers split history), #15 (packaging
-- charge needs its own column), #37 (org integrity on the six post-multi-org
-- tables). Hand-written; applied with `prisma migrate deploy`.

-- ---------------------------------------------------------------------------
-- 0. Backfill NULL organization_id on the six tables created after the
--    multi-org migration, so the dedupe below groups correctly and the
--    database matches the 18 older tenant tables (all NOT NULL). Every legacy
--    row belongs to Sparmanik by definition.
-- ---------------------------------------------------------------------------
UPDATE "customers"             SET "organization_id" = 'org_sparmanik' WHERE "organization_id" IS NULL;
UPDATE "expenses"              SET "organization_id" = 'org_sparmanik' WHERE "organization_id" IS NULL;
UPDATE "labour_tasks"          SET "organization_id" = 'org_sparmanik' WHERE "organization_id" IS NULL;
UPDATE "ai_provider_keys"      SET "organization_id" = 'org_sparmanik' WHERE "organization_id" IS NULL;
UPDATE "stock_sales"           SET "organization_id" = 'org_sparmanik' WHERE "organization_id" IS NULL;
UPDATE "harvest_dispositions"  SET "organization_id" = 'org_sparmanik' WHERE "organization_id" IS NULL;

-- ---------------------------------------------------------------------------
-- 1. Dedupe CUSTOMERS within (organization_id, lower(name)) — keep the oldest
--    row, repoint sales + dispositions at it, delete the rest.
-- ---------------------------------------------------------------------------
WITH ranked AS (
  SELECT id,
         first_value(id) OVER (PARTITION BY "organization_id", lower("name") ORDER BY "created_at", id) AS keep_id
  FROM "customers"
)
UPDATE "sales" s SET "customer_id" = r.keep_id
FROM ranked r
WHERE s."customer_id" = r.id AND r.id <> r.keep_id;

WITH ranked AS (
  SELECT id,
         first_value(id) OVER (PARTITION BY "organization_id", lower("name") ORDER BY "created_at", id) AS keep_id
  FROM "customers"
)
UPDATE "harvest_dispositions" d SET "customer_id" = r.keep_id
FROM ranked r
WHERE d."customer_id" = r.id AND r.id <> r.keep_id;

WITH ranked AS (
  SELECT id,
         first_value(id) OVER (PARTITION BY "organization_id", lower("name") ORDER BY "created_at", id) AS keep_id
  FROM "customers"
)
DELETE FROM "customers" c
USING ranked r
WHERE c.id = r.id AND r.id <> r.keep_id;

CREATE UNIQUE INDEX "customers_organization_id_name_key" ON "customers"("organization_id", "name");

-- ---------------------------------------------------------------------------
-- 2. Dedupe SUPPLIERS the same way (batches + item default supplier repointed).
-- ---------------------------------------------------------------------------
WITH ranked AS (
  SELECT id,
         first_value(id) OVER (PARTITION BY "organization_id", lower("name") ORDER BY "created_at", id) AS keep_id
  FROM "suppliers"
)
UPDATE "batches" b SET "supplier_id" = r.keep_id
FROM ranked r
WHERE b."supplier_id" = r.id AND r.id <> r.keep_id;

WITH ranked AS (
  SELECT id,
         first_value(id) OVER (PARTITION BY "organization_id", lower("name") ORDER BY "created_at", id) AS keep_id
  FROM "suppliers"
)
UPDATE "items" i SET "default_supplier_id" = r.keep_id
FROM ranked r
WHERE i."default_supplier_id" = r.id AND r.id <> r.keep_id;

WITH ranked AS (
  SELECT id,
         first_value(id) OVER (PARTITION BY "organization_id", lower("name") ORDER BY "created_at", id) AS keep_id
  FROM "suppliers"
)
DELETE FROM "suppliers" s
USING ranked r
WHERE s.id = r.id AND r.id <> r.keep_id;

CREATE UNIQUE INDEX "suppliers_organization_id_name_key" ON "suppliers"("organization_id", "name");

-- ---------------------------------------------------------------------------
-- 3. Sale.packaging_charge — the on-top packaging component of `amount`.
-- ---------------------------------------------------------------------------
ALTER TABLE "sales" ADD COLUMN "packaging_charge" DECIMAL(18,4) NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------------
-- 4. Tighten org integrity on the six newer tables to match the older 18.
--    (Schema-level organizationId stays optional for now — same as the 18 —
--    full schema convergence is a separate refactor.)
-- ---------------------------------------------------------------------------
ALTER TABLE "customers"            ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "expenses"             ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "labour_tasks"         ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "ai_provider_keys"     ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "stock_sales"          ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "harvest_dispositions" ALTER COLUMN "organization_id" SET NOT NULL;
