-- Add description (free-text product info) and photo_path (uploads-relative
-- path, served via /api/uploads/[...path]) to the Item table.
ALTER TABLE "items" ADD COLUMN "description" TEXT;
ALTER TABLE "items" ADD COLUMN "photo_path" TEXT;
