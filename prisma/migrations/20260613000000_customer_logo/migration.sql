-- Customer brand logo stored inline on the row (mirrors items.photo_data) so
-- it travels with the customer during local->prod sync / backup / restore.
ALTER TABLE "customers" ADD COLUMN "logo_data" BYTEA;
ALTER TABLE "customers" ADD COLUMN "logo_mime" TEXT;
