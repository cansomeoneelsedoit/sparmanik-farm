-- Greenhouse-layout tags + variety reference photos. Additive only.

-- Variety reference photo (inline blob, survives sync).
ALTER TABLE "produce" ADD COLUMN "photo_data" BYTEA;
ALTER TABLE "produce" ADD COLUMN "photo_mime" TEXT;

-- Layout position + intended variety on each stake.
ALTER TABLE "plant_tags" ADD COLUMN "row" TEXT;
ALTER TABLE "plant_tags" ADD COLUMN "col" INTEGER;
ALTER TABLE "plant_tags" ADD COLUMN "plant_slot" TEXT;
ALTER TABLE "plant_tags" ADD COLUMN "produce_id" TEXT;

ALTER TABLE "plant_tags" ADD CONSTRAINT "plant_tags_produce_id_fkey"
  FOREIGN KEY ("produce_id") REFERENCES "produce"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "plant_tags_greenhouse_id_row_col_plant_slot_idx"
  ON "plant_tags"("greenhouse_id", "row", "col", "plant_slot");
