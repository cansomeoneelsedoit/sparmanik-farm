-- LabourTask: editable list of common tasks shown in the "Log labour" dialog.
-- The dialog forces the user to pick one (or pick "Other" and type a custom
-- label), so this table is the source of truth for the dropdown.
CREATE TABLE "labour_tasks" (
  "id"              TEXT NOT NULL,
  "organization_id" TEXT,
  "name"            TEXT NOT NULL,
  "sort_order"      INTEGER NOT NULL DEFAULT 0,
  "active"          BOOLEAN NOT NULL DEFAULT true,
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "labour_tasks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "labour_tasks_organization_id_idx" ON "labour_tasks"("organization_id");
CREATE UNIQUE INDEX "labour_tasks_organization_id_name_key"
  ON "labour_tasks"("organization_id", "name");

ALTER TABLE "labour_tasks" ADD CONSTRAINT "labour_tasks_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed a sensible default list for every existing organisation so the dropdown
-- is non-empty the moment this migration lands. New orgs get the same seed
-- through the application-level org-create flow.
INSERT INTO labour_tasks (id, organization_id, name, sort_order, active)
SELECT
  'lt_' || substr(md5(random()::text || clock_timestamp()::text || o.id || t.name), 1, 24),
  o.id,
  t.name,
  t.sort_order,
  true
FROM organizations o
CROSS JOIN (VALUES
  ('Seeding'::text, 10),
  ('Transplanting', 20),
  ('Watering / irrigation', 30),
  ('Nutrient mixing', 40),
  ('Pruning / training', 50),
  ('Pollination', 60),
  ('Pest & disease control', 70),
  ('Spraying', 80),
  ('Greenhouse cleaning', 90),
  ('Harvesting', 100),
  ('Packing / grading', 110),
  ('Maintenance / repairs', 120),
  ('Construction / install', 130),
  ('Compost / soil prep', 140)
) AS t(name, sort_order)
ON CONFLICT (organization_id, name) DO NOTHING;
