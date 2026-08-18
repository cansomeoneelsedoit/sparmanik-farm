-- Additive: seedling-tray provenance on plant records + dated per-plant journal.
ALTER TABLE "plant_records" ADD COLUMN "tray" TEXT;

CREATE TABLE "plant_notes" (
  "id"         TEXT NOT NULL,
  "record_id"  TEXT NOT NULL,
  "date"       DATE NOT NULL,
  "kind"       TEXT NOT NULL DEFAULT 'OBSERVATION',
  "product"    TEXT,
  "amount"     TEXT,
  "note"       TEXT NOT NULL,
  "photo_data" BYTEA,
  "photo_mime" TEXT,
  "user_id"    TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "plant_notes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "plant_notes_record_id_fkey" FOREIGN KEY ("record_id") REFERENCES "plant_records"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "plant_notes_record_id_date_idx" ON "plant_notes"("record_id", "date");
