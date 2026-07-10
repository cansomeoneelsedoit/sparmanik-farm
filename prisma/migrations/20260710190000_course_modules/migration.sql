-- Modules refactor: lessons become reusable MODULES composed into courses via
-- a join table with per-course ordering. Existing lesson->course links are
-- migrated into the join, then the direct columns are dropped. (Tables keep
-- their historical names: lessons / lesson_attempts / lesson_id.)

-- CreateTable
CREATE TABLE "course_modules" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT,
    "course_id" TEXT NOT NULL,
    "module_id" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "course_modules_pkey" PRIMARY KEY ("id")
);

-- Backfill: every existing lesson keeps its course + order via the join.
INSERT INTO "course_modules" ("id", "organization_id", "course_id", "module_id", "rank")
SELECT gen_random_uuid()::text, "organization_id", "course_id", "id", "rank"
FROM "lessons";

-- CreateIndex
CREATE UNIQUE INDEX "course_modules_course_id_module_id_key" ON "course_modules"("course_id", "module_id");
CREATE INDEX "course_modules_organization_id_idx" ON "course_modules"("organization_id");
CREATE INDEX "course_modules_course_id_rank_idx" ON "course_modules"("course_id", "rank");

-- AddForeignKey
ALTER TABLE "course_modules" ADD CONSTRAINT "course_modules_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "course_modules" ADD CONSTRAINT "course_modules_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "course_modules" ADD CONSTRAINT "course_modules_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Drop the direct link — course membership now lives in the join only.
ALTER TABLE "lessons" DROP CONSTRAINT "lessons_course_id_fkey";
DROP INDEX "lessons_course_id_rank_idx";
ALTER TABLE "lessons" DROP COLUMN "course_id";
ALTER TABLE "lessons" DROP COLUMN "rank";
