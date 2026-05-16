-- Depreciable assets: per-use amortisation for items reusable across harvests
-- (cocopeat, rockwool, grow bags, filters). maxUses = 1 (default) keeps the
-- existing behaviour for every other item.

ALTER TABLE "batches"
  ADD COLUMN "max_uses" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "use_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "amortised_cost_per_use" DECIMAL(18,4),
  ADD COLUMN "returned" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "harvest_assets"
  ADD COLUMN "depreciable" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "amortised_charge" DECIMAL(18,4),
  ADD COLUMN "max_uses" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "use_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "discarded" BOOLEAN NOT NULL DEFAULT false;
