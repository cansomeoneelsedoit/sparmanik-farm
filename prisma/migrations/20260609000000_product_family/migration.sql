-- Product family rollup
-- ---------------------------------------------------------------
-- Each item can be tagged with a free-text "product family" name
-- (e.g. "Meroke Calnit", "Rockwool"). Items in the same family roll
-- up their stock for a substance-total readout, even when the items
-- are legitimately separate SKUs (25 kg bag from supplier A + 1 kg
-- bag from supplier B both belong to family "Meroke Calnit").
--
-- The actual roll-up math uses the item's sub_unit + sub_factor that
-- already exist:  total_substance = qty_on_hand * sub_factor.
-- This migration only adds the grouping tag itself.

ALTER TABLE "items" ADD COLUMN "product_family" TEXT;

-- Composite index lets the inventory list filter / sort by family
-- within an org (which is the only access pattern that matters —
-- families never cross orgs).
CREATE INDEX "items_organization_id_product_family_idx"
    ON "items" ("organization_id", "product_family");
