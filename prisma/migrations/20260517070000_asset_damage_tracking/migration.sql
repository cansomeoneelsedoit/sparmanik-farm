-- Phase 1 of the workflow simplification: damage tracking on reusable assets
-- when they come back from a harvest.

-- HarvestAsset: when a reusable asset is checked back in, record the
-- condition (good / damaged / lost) so the business knows whether to put it
-- back in the inventory pool or write it off.
ALTER TABLE "harvest_assets" ADD COLUMN "return_condition" TEXT;
ALTER TABLE "harvest_assets" ADD COLUMN "returned_at" TIMESTAMP(3);
ALTER TABLE "harvest_assets" ADD COLUMN "return_note" TEXT;

-- Batch: when a reusable batch is destroyed on a harvest (damaged / lost),
-- link it back to that harvest so Financials can attribute the loss.
ALTER TABLE "batches" ADD COLUMN "damaged_from_harvest_id" TEXT;
ALTER TABLE "batches"
  ADD CONSTRAINT "batches_damaged_from_harvest_id_fkey"
  FOREIGN KEY ("damaged_from_harvest_id") REFERENCES "harvests"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "batches_damaged_from_harvest_id_idx" ON "batches"("damaged_from_harvest_id");
