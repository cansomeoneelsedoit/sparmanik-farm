-- Asset depreciation policy: consumables amortise over a number of USES
-- (cost / uses per harvest), equipment depreciates straight-line over a number
-- of MONTHS (each cycle charged its share). Policy lives on the item and is
-- snapshotted onto batches + harvest installs. Additive only — existing rows
-- default to NONE (unchanged behaviour) until a lifespan is set.

CREATE TYPE "DepreciationMode" AS ENUM ('NONE', 'PER_USE', 'CALENDAR');

ALTER TABLE "items" ADD COLUMN "depreciation_mode" "DepreciationMode" NOT NULL DEFAULT 'NONE';
ALTER TABLE "items" ADD COLUMN "depreciation_uses" INTEGER;
ALTER TABLE "items" ADD COLUMN "depreciation_months" INTEGER;

ALTER TABLE "batches" ADD COLUMN "useful_life_months" INTEGER;

ALTER TABLE "harvest_assets" ADD COLUMN "depreciation_mode" TEXT;
ALTER TABLE "harvest_assets" ADD COLUMN "useful_life_months" INTEGER;
ALTER TABLE "harvest_assets" ADD COLUMN "acquisition_cost" DECIMAL(18,4);

-- Backfill the full acquisition cost for existing depreciable installs so a
-- later policy change re-derives the amortised charge from the original cost
-- (fullCost = amortisedCharge × maxUses; maxUses is 1 for all current rows).
UPDATE "harvest_assets"
   SET "acquisition_cost" = "amortised_charge" * "max_uses"
 WHERE "amortised_charge" IS NOT NULL;
