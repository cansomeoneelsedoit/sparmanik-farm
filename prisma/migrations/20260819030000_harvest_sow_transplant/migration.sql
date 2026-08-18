-- Additive: nursery sow date + transplant date (HST 0) on the cycle.
ALTER TABLE "harvests" ADD COLUMN "sow_date" DATE;
ALTER TABLE "harvests" ADD COLUMN "transplant_date" DATE;
