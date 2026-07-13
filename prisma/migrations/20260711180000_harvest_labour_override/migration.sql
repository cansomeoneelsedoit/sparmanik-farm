-- Manual labour-cost override per harvest: when set, it replaces the computed
-- hours×rate labour in the harvest P&L (for when reality differs from the
-- logged hours). Additive; existing harvests keep the computed figure (null).
ALTER TABLE "harvests" ADD COLUMN "manual_labour_cost" DECIMAL(18,4);
ALTER TABLE "harvests" ADD COLUMN "manual_labour_note" TEXT;
