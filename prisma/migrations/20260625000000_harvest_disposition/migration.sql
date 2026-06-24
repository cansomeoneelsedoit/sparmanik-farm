-- CreateEnum
CREATE TYPE "DispositionType" AS ENUM ('BREAKAGE', 'STAFF', 'GIVEAWAY');

-- CreateTable
CREATE TABLE "harvest_dispositions" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT,
    "harvest_id" TEXT NOT NULL,
    "produce_id" TEXT NOT NULL,
    "type" "DispositionType" NOT NULL,
    "weight" DECIMAL(18,4) NOT NULL,
    "price_per_kg" DECIMAL(18,4),
    "staff_id" TEXT,
    "customer_id" TEXT,
    "note" TEXT,
    "date" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "harvest_dispositions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "harvest_dispositions_organization_id_idx" ON "harvest_dispositions"("organization_id");

-- CreateIndex
CREATE INDEX "harvest_dispositions_harvest_id_date_idx" ON "harvest_dispositions"("harvest_id", "date");

-- AddForeignKey
ALTER TABLE "harvest_dispositions" ADD CONSTRAINT "harvest_dispositions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harvest_dispositions" ADD CONSTRAINT "harvest_dispositions_harvest_id_fkey" FOREIGN KEY ("harvest_id") REFERENCES "harvests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harvest_dispositions" ADD CONSTRAINT "harvest_dispositions_produce_id_fkey" FOREIGN KEY ("produce_id") REFERENCES "produce"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harvest_dispositions" ADD CONSTRAINT "harvest_dispositions_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harvest_dispositions" ADD CONSTRAINT "harvest_dispositions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
