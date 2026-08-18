-- Additive: SOP day-by-day schedule + SOP assignments to live cycles + source PDFs.
ALTER TABLE "sops" ADD COLUMN "source_en_path" TEXT;
ALTER TABLE "sops" ADD COLUMN "source_id_path" TEXT;

CREATE TABLE "sop_days" (
  "id"           TEXT NOT NULL,
  "sop_id"       TEXT NOT NULL,
  "day"          INTEGER NOT NULL,
  "stage"        TEXT,
  "ec"           INTEGER,
  "ppm"          INTEGER,
  "sop_per_tank" TEXT,
  "water_ml"     INTEGER,
  "pulses"       TEXT,
  "times"        TEXT,
  "job_en"       TEXT,
  "job_id"       TEXT,
  CONSTRAINT "sop_days_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sop_days_sop_id_fkey" FOREIGN KEY ("sop_id") REFERENCES "sops"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "sop_days_sop_id_day_key" ON "sop_days"("sop_id", "day");

CREATE TABLE "harvest_sops" (
  "id"              TEXT NOT NULL,
  "organization_id" TEXT,
  "harvest_id"      TEXT NOT NULL,
  "sop_id"          TEXT NOT NULL,
  "hst0"            DATE NOT NULL,
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "harvest_sops_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "harvest_sops_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "harvest_sops_harvest_id_fkey" FOREIGN KEY ("harvest_id") REFERENCES "harvests"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "harvest_sops_sop_id_fkey" FOREIGN KEY ("sop_id") REFERENCES "sops"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "harvest_sops_harvest_id_sop_id_key" ON "harvest_sops"("harvest_id", "sop_id");
CREATE INDEX "harvest_sops_organization_id_idx" ON "harvest_sops"("organization_id");
