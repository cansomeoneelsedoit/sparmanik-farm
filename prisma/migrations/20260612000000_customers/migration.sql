-- Customers: who we SELL to (mirror of suppliers). Type drives later reporting.
CREATE TYPE "CustomerType" AS ENUM ('RETAILER', 'WHOLESALER', 'CONSUMER');

CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT,
    "name" TEXT NOT NULL,
    "type" "CustomerType" NOT NULL DEFAULT 'CONSUMER',
    "phone" TEXT,
    "email" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "customers_organization_id_idx" ON "customers"("organization_id");

ALTER TABLE "customers" ADD CONSTRAINT "customers_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Attribute each harvest sale to a customer (nullable; SET NULL on delete).
ALTER TABLE "sales" ADD COLUMN "customer_id" TEXT;

CREATE INDEX "sales_customer_id_idx" ON "sales"("customer_id");

ALTER TABLE "sales" ADD CONSTRAINT "sales_customer_id_fkey"
    FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
