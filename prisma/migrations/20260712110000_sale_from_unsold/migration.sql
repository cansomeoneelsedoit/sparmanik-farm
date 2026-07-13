-- Where a sale's produce came from when the crop tracks an unsold pool:
-- true = unsold-on-hand pile, false = freshly picked (grew the harvested
-- total). Stored per sale so deletes/edits reverse the pool bookkeeping.
-- Null = untracked (legacy rows, POS sales). Additive only.
ALTER TABLE "sales" ADD COLUMN "from_unsold" BOOLEAN;
