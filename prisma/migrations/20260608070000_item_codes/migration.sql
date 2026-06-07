-- Internal item code system (SF00001, SF00002, …). Sequential per
-- organisation so two orgs can both start at SF00001 without colliding.
-- The code is what staff write on physical bins / spreadsheets so they can
-- look an item up by typing the code into the inventory search.

ALTER TABLE "items" ADD COLUMN "code" TEXT;
CREATE UNIQUE INDEX "items_organization_id_code_key"
  ON "items"("organization_id", "code");

-- Backfill existing rows. Number each org's items in creation order so the
-- earliest item is SF00001, etc. Row numbering uses a CTE so we get one
-- update per (org, item) pair without per-org loops.
WITH numbered AS (
  SELECT
    id,
    organization_id,
    ROW_NUMBER() OVER (
      PARTITION BY organization_id
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM items
)
UPDATE items i
   SET code = 'SF' || LPAD(numbered.rn::text, 5, '0')
  FROM numbered
 WHERE i.id = numbered.id;

-- Make the column NOT NULL now every row has a code. New rows are stamped
-- by the application layer in src/app/(app)/inventory/actions.ts.
ALTER TABLE "items" ALTER COLUMN "code" SET NOT NULL;
