-- Estimated sale price per kg for a cycle's unsold-on-hand leftover, so the
-- harvest can show the leftover's estimated value (unsold kg × this). Additive.
ALTER TABLE "harvest_produces" ADD COLUMN "unsold_est_price_per_kg" DECIMAL(18,4);
