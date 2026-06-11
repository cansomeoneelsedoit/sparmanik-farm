-- Off-harvest stock sales
-- ---------------------------------------------------------------
-- Selling inventory directly to a buyer ("10 m of drip pipe to Pak
-- Budi") instead of through a greenhouse cycle. Stock leaves via the
-- same batch_consumptions FIFO ledger as installs/usages, so every
-- existing remaining-stock calculation keeps working untouched.
-- cogs is snapshotted at sale time so the Financials profit line
-- (amount - cogs) never drifts if batches are edited later.

CREATE TABLE "stock_sales" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT,
    "item_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "qty" DECIMAL(18,4) NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "cogs" DECIMAL(18,4) NOT NULL,
    "buyer" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_sales_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "stock_sales_organization_id_idx" ON "stock_sales"("organization_id");
CREATE INDEX "stock_sales_item_id_date_idx" ON "stock_sales"("item_id", "date");

ALTER TABLE "stock_sales"
    ADD CONSTRAINT "stock_sales_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "stock_sales"
    ADD CONSTRAINT "stock_sales_item_id_fkey"
    FOREIGN KEY ("item_id") REFERENCES "items"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Link consumptions to the sale that caused them.
ALTER TABLE "batch_consumptions" ADD COLUMN "stock_sale_id" TEXT;

CREATE INDEX "batch_consumptions_stock_sale_id_idx"
    ON "batch_consumptions"("stock_sale_id");

ALTER TABLE "batch_consumptions"
    ADD CONSTRAINT "batch_consumptions_stock_sale_id_fkey"
    FOREIGN KEY ("stock_sale_id") REFERENCES "stock_sales"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
