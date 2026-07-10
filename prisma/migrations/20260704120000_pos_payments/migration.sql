-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'REFUNDED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'QRIS', 'CARD', 'TRANSFER');

-- AlterTable: existing sales are settled (cash) sales -> PAID. payment_id is
-- nullable (legacy rows have none) and NON-unique (a basket = many sale lines,
-- one payment).
ALTER TABLE "sales" ADD COLUMN "payment_status" "PaymentStatus" NOT NULL DEFAULT 'PAID';
ALTER TABLE "sales" ADD COLUMN "payment_id" TEXT;

-- CreateIndex
CREATE INDEX "sales_payment_id_idx" ON "sales"("payment_id");

-- CreateTable
CREATE TABLE "pos_payments" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT,
    "method" "PaymentMethod" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "provider" TEXT NOT NULL DEFAULT 'record-only',
    "currency" TEXT NOT NULL DEFAULT 'IDR',
    "gross_amount" DECIMAL(18,4) NOT NULL,
    "fee_amount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "net_amount" DECIMAL(18,4),
    "tendered" DECIMAL(18,4),
    "change_due" DECIMAL(18,4),
    "note" TEXT,
    "external_id" TEXT,
    "checkout_url" TEXT,
    "qr_string" TEXT,
    "expires_at" TIMESTAMP(3),
    "paid_at" TIMESTAMP(3),
    "raw_event" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pos_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_gateway_credentials" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT,
    "provider" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "label" TEXT,
    "api_key" TEXT NOT NULL,
    "webhook_secret" TEXT,
    "merchant_ref" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "last_status" TEXT,
    "last_used_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_gateway_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- external_id is NULL for record-only rows; Postgres treats NULLs as distinct,
-- so many (record-only, NULL) rows coexist. The unique index only bites once a
-- gateway supplies a real charge id (webhook idempotency).
CREATE UNIQUE INDEX "pos_payments_provider_external_id_key" ON "pos_payments"("provider", "external_id");

-- CreateIndex
CREATE INDEX "pos_payments_organization_id_idx" ON "pos_payments"("organization_id");

-- CreateIndex
CREATE INDEX "pos_payments_status_idx" ON "pos_payments"("status");

-- CreateIndex
CREATE UNIQUE INDEX "payment_gateway_credentials_provider_merchant_ref_key" ON "payment_gateway_credentials"("provider", "merchant_ref");

-- CreateIndex
CREATE INDEX "payment_gateway_credentials_organization_id_idx" ON "payment_gateway_credentials"("organization_id");

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "pos_payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_payments" ADD CONSTRAINT "pos_payments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_gateway_credentials" ADD CONSTRAINT "payment_gateway_credentials_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
