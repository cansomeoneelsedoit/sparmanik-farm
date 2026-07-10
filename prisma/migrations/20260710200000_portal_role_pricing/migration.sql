-- Education portal: PORTAL user role (training-only logins) + course pricing
-- with enrollments.

-- AlterEnum: Postgres can't ADD VALUE inside a transaction (prisma migrate
-- wraps each migration in one), so swap the type — Prisma's own diff engine
-- uses this same pattern.
CREATE TYPE "UserRole_new" AS ENUM ('USER', 'SUPERUSER', 'PORTAL');
ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "users" ALTER COLUMN "role" TYPE "UserRole_new" USING ("role"::text::"UserRole_new");
ALTER TYPE "UserRole" RENAME TO "UserRole_old";
ALTER TYPE "UserRole_new" RENAME TO "UserRole";
DROP TYPE "UserRole_old";
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'USER';

-- AlterTable: price on courses (null = free) + optional cover picture for the
-- course card/hero (inline WebP; absent -> generated gradient cover).
ALTER TABLE "courses" ADD COLUMN "price_idr" DECIMAL(18,4);
ALTER TABLE "courses" ADD COLUMN "image_data" BYTEA;
ALTER TABLE "courses" ADD COLUMN "image_mime" TEXT;

-- CreateTable
CREATE TABLE "course_enrollments" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT,
    "course_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "paid_amount" DECIMAL(18,4),
    "paid_via" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "course_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "course_enrollments_course_id_user_id_key" ON "course_enrollments"("course_id", "user_id");
CREATE INDEX "course_enrollments_organization_id_idx" ON "course_enrollments"("organization_id");
CREATE INDEX "course_enrollments_user_id_idx" ON "course_enrollments"("user_id");

-- AddForeignKey
ALTER TABLE "course_enrollments" ADD CONSTRAINT "course_enrollments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "course_enrollments" ADD CONSTRAINT "course_enrollments_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
