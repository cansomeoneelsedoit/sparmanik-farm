-- Item photos in DB
-- ---------------------------------------------------------------
-- The filesystem-based photo path created a recurring "photos
-- missing on prod after sync" problem — files lived on the laptop,
-- DB rows pointed at them, and Railway's volume had no copy.
-- Now the photo bytes live directly on the item row so the photo
-- travels wherever the row goes (sync, backup, restore — all carry
-- it along automatically).
--
-- ~500 items × ~30KB resized WebP ≈ 15MB. Postgres handles this
-- fine; the column is bytea which can hold up to 1GB per row.
--
-- The existing `photo_path` column stays for backwards-compat —
-- legacy filesystem photos keep working via the /api/uploads route
-- until the backfill script ports them into the new columns.

ALTER TABLE "items" ADD COLUMN "photo_data" BYTEA;
ALTER TABLE "items" ADD COLUMN "photo_mime" TEXT;
ALTER TABLE "items" ADD COLUMN "photo_width" INTEGER;
ALTER TABLE "items" ADD COLUMN "photo_height" INTEGER;
