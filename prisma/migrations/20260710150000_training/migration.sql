-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('MULTIPLE_CHOICE', 'FILL_BLANK', 'ORDER', 'PHOTO_SPOT');

-- CreateTable
CREATE TABLE "courses" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT,
    "title_en" TEXT NOT NULL,
    "title_id" TEXT NOT NULL,
    "description" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lessons" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT,
    "course_id" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "title_en" TEXT NOT NULL,
    "title_id" TEXT NOT NULL,
    "video_id" TEXT,
    "body_en" TEXT,
    "body_id" TEXT,
    "image_data" BYTEA,
    "image_mime" TEXT,
    "pass_pct" INTEGER NOT NULL DEFAULT 80,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lessons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questions" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT,
    "lesson_id" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "type" "QuestionType" NOT NULL,
    "prompt_en" TEXT NOT NULL,
    "prompt_id" TEXT NOT NULL,
    "image_data" BYTEA,
    "image_mime" TEXT,
    "config" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lesson_attempts" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT,
    "lesson_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "answers" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lesson_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "courses_organization_id_idx" ON "courses"("organization_id");
CREATE INDEX "lessons_organization_id_idx" ON "lessons"("organization_id");
CREATE INDEX "lessons_course_id_rank_idx" ON "lessons"("course_id", "rank");
CREATE INDEX "questions_organization_id_idx" ON "questions"("organization_id");
CREATE INDEX "questions_lesson_id_rank_idx" ON "questions"("lesson_id", "rank");
CREATE INDEX "lesson_attempts_organization_id_idx" ON "lesson_attempts"("organization_id");
CREATE INDEX "lesson_attempts_lesson_id_user_id_idx" ON "lesson_attempts"("lesson_id", "user_id");
CREATE INDEX "lesson_attempts_user_id_idx" ON "lesson_attempts"("user_id");

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "videos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "questions" ADD CONSTRAINT "questions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "questions" ADD CONSTRAINT "questions_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lesson_attempts" ADD CONSTRAINT "lesson_attempts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lesson_attempts" ADD CONSTRAINT "lesson_attempts_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
