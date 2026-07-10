-- AlterTable: concise English display name for items (AI-generated from the
-- original name, which is usually an Indonesian Shopee listing title).
-- Nullable — null falls back to the original name in the UI.
ALTER TABLE "items" ADD COLUMN "name_en" TEXT;
