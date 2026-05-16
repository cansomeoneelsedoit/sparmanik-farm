-- CreateEnum
CREATE TYPE "HarvestStatus" AS ENUM ('LIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "SaleGrade" AS ENUM ('A', 'B', 'C', 'D');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "SopStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "VideoType" AS ENUM ('YOUTUBE', 'UPLOAD');

-- CreateEnum
CREATE TYPE "CommentRole" AS ENUM ('ADMIN', 'STAFF');

-- CreateEnum
CREATE TYPE "AiRole" AS ENUM ('USER', 'ASSISTANT');

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "produce" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "barcode" TEXT,

    CONSTRAINT "produce_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "greenhouses" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT,
    "type" TEXT,
    "notes" TEXT,

    CONSTRAINT "greenhouses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "notes" TEXT,
    "shop_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "items" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category_id" TEXT,
    "unit" TEXT NOT NULL,
    "sub_unit" TEXT,
    "sub_factor" DECIMAL(18,4),
    "location" TEXT,
    "reusable" BOOLEAN NOT NULL DEFAULT false,
    "reorder" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "shopee_url" TEXT,
    "default_supplier_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "batches" (
    "id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "supplier_id" TEXT,
    "date" DATE NOT NULL,
    "qty" DECIMAL(18,4) NOT NULL,
    "price" DECIMAL(18,4) NOT NULL,
    "exchange_rate" DECIMAL(12,4) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "batch_consumptions" (
    "id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "qty" DECIMAL(18,4) NOT NULL,
    "unit_cost" DECIMAL(18,4) NOT NULL,
    "harvest_asset_id" TEXT,
    "harvest_usage_id" TEXT,
    "consumed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "batch_consumptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "harvests" (
    "id" TEXT NOT NULL,
    "greenhouse_id" TEXT NOT NULL,
    "produce_id" TEXT,
    "name" TEXT NOT NULL,
    "variety" TEXT,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "status" "HarvestStatus" NOT NULL DEFAULT 'LIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "harvests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "harvest_assets" (
    "id" TEXT NOT NULL,
    "harvest_id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "qty" DECIMAL(18,4) NOT NULL,
    "date" DATE NOT NULL,
    "reusable" BOOLEAN NOT NULL DEFAULT false,
    "condition" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "harvest_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "harvest_usages" (
    "id" TEXT NOT NULL,
    "harvest_id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "qty" DECIMAL(18,4) NOT NULL,
    "display_qty" TEXT,
    "date" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "harvest_usages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales" (
    "id" TEXT NOT NULL,
    "harvest_id" TEXT NOT NULL,
    "produce_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "grade" "SaleGrade" NOT NULL,
    "weight" DECIMAL(18,4) NOT NULL,
    "price_per_kg" DECIMAL(18,4) NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT,
    "avatar" TEXT,
    "photo_path" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_rates" (
    "id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "rate" DECIMAL(18,4) NOT NULL,
    "effective_from" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wage_entries" (
    "id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "total_hours" DECIMAL(8,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wage_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wage_entry_lines" (
    "id" TEXT NOT NULL,
    "wage_entry_id" TEXT NOT NULL,
    "harvest_id" TEXT,
    "greenhouse_id" TEXT,
    "hours" DECIMAL(8,2) NOT NULL,
    "task" TEXT,

    CONSTRAINT "wage_entry_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "assignee_staff_id" TEXT,
    "due_date" DATE NOT NULL,
    "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "status" "TaskStatus" NOT NULL DEFAULT 'PENDING',
    "harvest_id" TEXT,
    "notes" TEXT,
    "description" TEXT,
    "instructions" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_comments" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "role" "CommentRole" NOT NULL DEFAULT 'STAFF',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_photos" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nutrient_recipes" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "crop" TEXT,
    "stage" TEXT,
    "ec" DECIMAL(8,4),
    "ph" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "nutrient_recipes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipe_ingredients" (
    "id" TEXT NOT NULL,
    "recipe_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount" TEXT NOT NULL,

    CONSTRAINT "recipe_ingredients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sops" (
    "id" TEXT NOT NULL,
    "title_en" TEXT NOT NULL,
    "title_id" TEXT NOT NULL,
    "description_en" TEXT,
    "description_id" TEXT,
    "category" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "SopStatus" NOT NULL DEFAULT 'ACTIVE',
    "cover_photo_path" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sop_steps" (
    "id" TEXT NOT NULL,
    "sop_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "body_en" TEXT NOT NULL,
    "body_id" TEXT NOT NULL,
    "photo_path" TEXT,

    CONSTRAINT "sop_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "videos" (
    "id" TEXT NOT NULL,
    "title_en" TEXT NOT NULL,
    "title_id" TEXT NOT NULL,
    "category" TEXT,
    "duration" TEXT,
    "type" "VideoType" NOT NULL,
    "url" TEXT,
    "path" TEXT,
    "thumbnail_path" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "videos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "farm_name" TEXT NOT NULL DEFAULT 'Sparmanik Farm',
    "exchange_rate" DECIMAL(12,4) NOT NULL DEFAULT 10200,
    "default_locale" TEXT NOT NULL DEFAULT 'en',

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exchange_rate_history" (
    "id" TEXT NOT NULL,
    "rate" DECIMAL(12,4) NOT NULL,
    "effective_from" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exchange_rate_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_actions" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "user_id" TEXT,
    "description" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "undone" BOOLEAN NOT NULL DEFAULT false,
    "undone_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_messages" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "AiRole" NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "categories_name_key" ON "categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "produce_barcode_key" ON "produce"("barcode");

-- CreateIndex
CREATE INDEX "items_category_id_idx" ON "items"("category_id");

-- CreateIndex
CREATE INDEX "items_default_supplier_id_idx" ON "items"("default_supplier_id");

-- CreateIndex
CREATE INDEX "batches_item_id_date_idx" ON "batches"("item_id", "date");

-- CreateIndex
CREATE INDEX "batch_consumptions_batch_id_idx" ON "batch_consumptions"("batch_id");

-- CreateIndex
CREATE INDEX "batch_consumptions_harvest_asset_id_idx" ON "batch_consumptions"("harvest_asset_id");

-- CreateIndex
CREATE INDEX "batch_consumptions_harvest_usage_id_idx" ON "batch_consumptions"("harvest_usage_id");

-- CreateIndex
CREATE INDEX "harvests_status_start_date_idx" ON "harvests"("status", "start_date");

-- CreateIndex
CREATE INDEX "harvest_assets_harvest_id_idx" ON "harvest_assets"("harvest_id");

-- CreateIndex
CREATE INDEX "harvest_usages_harvest_id_idx" ON "harvest_usages"("harvest_id");

-- CreateIndex
CREATE INDEX "sales_harvest_id_date_idx" ON "sales"("harvest_id", "date");

-- CreateIndex
CREATE INDEX "staff_rates_staff_id_effective_from_idx" ON "staff_rates"("staff_id", "effective_from");

-- CreateIndex
CREATE INDEX "wage_entries_staff_id_date_idx" ON "wage_entries"("staff_id", "date");

-- CreateIndex
CREATE INDEX "wage_entry_lines_wage_entry_id_idx" ON "wage_entry_lines"("wage_entry_id");

-- CreateIndex
CREATE INDEX "wage_entry_lines_harvest_id_idx" ON "wage_entry_lines"("harvest_id");

-- CreateIndex
CREATE INDEX "tasks_status_due_date_idx" ON "tasks"("status", "due_date");

-- CreateIndex
CREATE INDEX "tasks_harvest_id_idx" ON "tasks"("harvest_id");

-- CreateIndex
CREATE INDEX "task_comments_task_id_idx" ON "task_comments"("task_id");

-- CreateIndex
CREATE INDEX "task_photos_task_id_idx" ON "task_photos"("task_id");

-- CreateIndex
CREATE INDEX "recipe_ingredients_recipe_id_idx" ON "recipe_ingredients"("recipe_id");

-- CreateIndex
CREATE INDEX "sops_status_idx" ON "sops"("status");

-- CreateIndex
CREATE UNIQUE INDEX "sop_steps_sop_id_position_key" ON "sop_steps"("sop_id", "position");

-- CreateIndex
CREATE INDEX "exchange_rate_history_effective_from_idx" ON "exchange_rate_history"("effective_from");

-- CreateIndex
CREATE INDEX "audit_actions_entity_type_entity_id_created_at_idx" ON "audit_actions"("entity_type", "entity_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_actions_user_id_created_at_idx" ON "audit_actions"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_actions_undone_created_at_idx" ON "audit_actions"("undone", "created_at");

-- CreateIndex
CREATE INDEX "ai_messages_user_id_created_at_idx" ON "ai_messages"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_default_supplier_id_fkey" FOREIGN KEY ("default_supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batches" ADD CONSTRAINT "batches_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batches" ADD CONSTRAINT "batches_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_consumptions" ADD CONSTRAINT "batch_consumptions_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_consumptions" ADD CONSTRAINT "batch_consumptions_harvest_asset_id_fkey" FOREIGN KEY ("harvest_asset_id") REFERENCES "harvest_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_consumptions" ADD CONSTRAINT "batch_consumptions_harvest_usage_id_fkey" FOREIGN KEY ("harvest_usage_id") REFERENCES "harvest_usages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harvests" ADD CONSTRAINT "harvests_greenhouse_id_fkey" FOREIGN KEY ("greenhouse_id") REFERENCES "greenhouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harvests" ADD CONSTRAINT "harvests_produce_id_fkey" FOREIGN KEY ("produce_id") REFERENCES "produce"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harvest_assets" ADD CONSTRAINT "harvest_assets_harvest_id_fkey" FOREIGN KEY ("harvest_id") REFERENCES "harvests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harvest_assets" ADD CONSTRAINT "harvest_assets_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harvest_usages" ADD CONSTRAINT "harvest_usages_harvest_id_fkey" FOREIGN KEY ("harvest_id") REFERENCES "harvests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harvest_usages" ADD CONSTRAINT "harvest_usages_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_harvest_id_fkey" FOREIGN KEY ("harvest_id") REFERENCES "harvests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_produce_id_fkey" FOREIGN KEY ("produce_id") REFERENCES "produce"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_rates" ADD CONSTRAINT "staff_rates_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wage_entries" ADD CONSTRAINT "wage_entries_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wage_entry_lines" ADD CONSTRAINT "wage_entry_lines_wage_entry_id_fkey" FOREIGN KEY ("wage_entry_id") REFERENCES "wage_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wage_entry_lines" ADD CONSTRAINT "wage_entry_lines_harvest_id_fkey" FOREIGN KEY ("harvest_id") REFERENCES "harvests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wage_entry_lines" ADD CONSTRAINT "wage_entry_lines_greenhouse_id_fkey" FOREIGN KEY ("greenhouse_id") REFERENCES "greenhouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_staff_id_fkey" FOREIGN KEY ("assignee_staff_id") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_harvest_id_fkey" FOREIGN KEY ("harvest_id") REFERENCES "harvests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_photos" ADD CONSTRAINT "task_photos_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "nutrient_recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sop_steps" ADD CONSTRAINT "sop_steps_sop_id_fkey" FOREIGN KEY ("sop_id") REFERENCES "sops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_actions" ADD CONSTRAINT "audit_actions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

