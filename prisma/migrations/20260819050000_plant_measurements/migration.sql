-- Additive: structured plant growth measurements (per record, at an HST).
CREATE TABLE "plant_measurements" (
  "id"          TEXT NOT NULL,
  "record_id"   TEXT NOT NULL,
  "date"        DATE NOT NULL,
  "hst"         INTEGER,
  "height_cm"   DECIMAL(8,2),
  "leaf_count"  INTEGER,
  "stem_mm"     DECIMAL(8,2),
  "fruit_cm"    DECIMAL(8,2),
  "fruit_g"     DECIMAL(10,2),
  "brix"        DECIMAL(6,2),
  "note"        TEXT,
  "user_id"     TEXT,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "plant_measurements_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "plant_measurements_record_id_fkey" FOREIGN KEY ("record_id") REFERENCES "plant_records"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "plant_measurements_record_id_date_idx" ON "plant_measurements"("record_id", "date");
