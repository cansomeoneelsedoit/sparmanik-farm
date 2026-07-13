-- Optional plant photo stored inline on the record (same pattern as
-- items.photo_data) so it survives local→prod sync. Additive only.
ALTER TABLE "plant_records" ADD COLUMN "photo_data" BYTEA;
ALTER TABLE "plant_records" ADD COLUMN "photo_mime" TEXT;
