-- Multi-produce harvests: a single harvest in a greenhouse can grow more
-- than one crop at the same time (e.g. melon + chilli intercropped).

CREATE TABLE "harvest_produces" (
    "harvest_id" TEXT NOT NULL,
    "produce_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "harvest_produces_pkey" PRIMARY KEY ("harvest_id", "produce_id")
);

CREATE INDEX "harvest_produces_produce_id_idx" ON "harvest_produces"("produce_id");

ALTER TABLE "harvest_produces"
    ADD CONSTRAINT "harvest_produces_harvest_id_fkey"
    FOREIGN KEY ("harvest_id") REFERENCES "harvests"("id") ON DELETE CASCADE;

ALTER TABLE "harvest_produces"
    ADD CONSTRAINT "harvest_produces_produce_id_fkey"
    FOREIGN KEY ("produce_id") REFERENCES "produce"("id");

-- Backfill the join table from existing single-produce harvests so the new
-- UI shows the same data immediately after deploy.
INSERT INTO "harvest_produces" ("harvest_id", "produce_id", "created_at")
SELECT id, produce_id, COALESCE("updated_at", "created_at", NOW())
FROM "harvests"
WHERE produce_id IS NOT NULL
ON CONFLICT DO NOTHING;
