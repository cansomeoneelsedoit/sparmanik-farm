-- Charity donations: a produce Sale can be flagged as given to charity. It
-- still counts as income (paid for at a set price, default 50k/kg); reporting
-- keeps it in total revenue and also highlights the charity portion.
-- Additive columns on sales only — existing rows default to charity = false.

ALTER TABLE "sales" ADD COLUMN "charity" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "sales" ADD COLUMN "charity_recipient" TEXT;
