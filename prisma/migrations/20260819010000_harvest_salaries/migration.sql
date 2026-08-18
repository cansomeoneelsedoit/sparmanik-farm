-- Additive: fixed monthly salaries assigned to a cycle (daily accrual into labour cost).
CREATE TABLE "harvest_salaries" (
  "id"              TEXT NOT NULL,
  "organization_id" TEXT,
  "harvest_id"      TEXT NOT NULL,
  "staff_id"        TEXT NOT NULL,
  "monthly_amount"  DECIMAL(18,4) NOT NULL,
  "start_date"      DATE NOT NULL,
  "end_date"        DATE,
  "note"            TEXT,
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "harvest_salaries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "harvest_salaries_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "harvest_salaries_harvest_id_fkey" FOREIGN KEY ("harvest_id") REFERENCES "harvests"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "harvest_salaries_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "harvest_salaries_organization_id_idx" ON "harvest_salaries"("organization_id");
CREATE INDEX "harvest_salaries_harvest_id_idx" ON "harvest_salaries"("harvest_id");
