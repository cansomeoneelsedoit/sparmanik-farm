-- Plant tags: recyclable QR stakes that live in one greenhouse for life.
-- plant_tags = the physical stake (QR encodes /t/<code>);
-- plant_records = one crop's stay on a stake (current record has ended_at NULL).
-- Additive only — no existing tables touched.

CREATE TABLE "plant_tags" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT,
    "greenhouse_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plant_tags_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "plant_tags_code_key" ON "plant_tags"("code");
CREATE UNIQUE INDEX "plant_tags_greenhouse_id_label_key" ON "plant_tags"("greenhouse_id", "label");
CREATE INDEX "plant_tags_organization_id_idx" ON "plant_tags"("organization_id");

ALTER TABLE "plant_tags" ADD CONSTRAINT "plant_tags_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "plant_tags" ADD CONSTRAINT "plant_tags_greenhouse_id_fkey"
    FOREIGN KEY ("greenhouse_id") REFERENCES "greenhouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "plant_records" (
    "id" TEXT NOT NULL,
    "tag_id" TEXT NOT NULL,
    "harvest_id" TEXT,
    "produce_id" TEXT,
    "planted_at" DATE NOT NULL,
    "seed" TEXT,
    "method" TEXT,
    "notes" TEXT,
    "ended_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plant_records_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "plant_records_tag_id_ended_at_idx" ON "plant_records"("tag_id", "ended_at");

ALTER TABLE "plant_records" ADD CONSTRAINT "plant_records_tag_id_fkey"
    FOREIGN KEY ("tag_id") REFERENCES "plant_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "plant_records" ADD CONSTRAINT "plant_records_harvest_id_fkey"
    FOREIGN KEY ("harvest_id") REFERENCES "harvests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "plant_records" ADD CONSTRAINT "plant_records_produce_id_fkey"
    FOREIGN KEY ("produce_id") REFERENCES "produce"("id") ON DELETE SET NULL ON UPDATE CASCADE;
