-- Additive: SOP page formatting state + raw text.
ALTER TABLE "sops" ADD COLUMN "format_done" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "sops" ADD COLUMN "format_total" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "sop_steps" ADD COLUMN "raw_en" TEXT;
ALTER TABLE "sop_steps" ADD COLUMN "raw_id" TEXT;
ALTER TABLE "sop_steps" ADD COLUMN "formatted" BOOLEAN NOT NULL DEFAULT false;
