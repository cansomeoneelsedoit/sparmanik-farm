-- Harvested-total per produce per cycle, so a harvest tracks total kg produced
-- and its unsold-on-hand leftovers (harvestedKg − sold − given/waste). Lets a
-- cycle close for costs while leftovers keep selling (only income moves).
ALTER TABLE "harvest_produces" ADD COLUMN "harvested_kg" DECIMAL(18,4);
