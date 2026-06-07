-- Add a free-form bio / fun facts column to Staff. Photos already use the
-- existing `photo_path` column.
ALTER TABLE "staff" ADD COLUMN "bio" TEXT;
