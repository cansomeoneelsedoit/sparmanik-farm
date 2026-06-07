-- Misc expenses for one-off costs paid to non-staff (contractors, cash
-- payments to individuals, utilities, etc.) Can be allocated to a specific
-- harvest's P&L or left at the business overhead level.
CREATE TABLE "expenses" (
  "id"               TEXT NOT NULL PRIMARY KEY,
  "organization_id"  TEXT,
  "date"             DATE NOT NULL,
  "amount"           DECIMAL(18,4) NOT NULL,
  "category"         TEXT,
  "payee"            TEXT NOT NULL,
  "description"      TEXT,
  "harvest_id"       TEXT,
  "payment_method"   TEXT,
  "receipt_path"     TEXT,
  "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"       TIMESTAMP(3) NOT NULL,

  CONSTRAINT "expenses_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "expenses_harvest_id_fkey"
    FOREIGN KEY ("harvest_id") REFERENCES "harvests"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "expenses_organization_id_idx" ON "expenses"("organization_id");
CREATE INDEX "expenses_harvest_id_idx"      ON "expenses"("harvest_id");
CREATE INDEX "expenses_date_idx"            ON "expenses"("date");
