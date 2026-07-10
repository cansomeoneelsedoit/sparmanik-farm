-- CreateTable: outgoing-mail account for receipt emails (Gmail SMTP + App
-- Password). Secret stays server-side; masked in the settings UI.
CREATE TABLE "mail_accounts" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT,
    "email" TEXT NOT NULL,
    "app_password" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "last_status" TEXT,
    "last_used_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mail_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mail_accounts_organization_id_idx" ON "mail_accounts"("organization_id");

-- AddForeignKey
ALTER TABLE "mail_accounts" ADD CONSTRAINT "mail_accounts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
