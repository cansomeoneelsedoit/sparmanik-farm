-- Student portal onboarding: temp-password + emailed-invite login for PORTAL
-- students, forced first-login password change, and optional contact phone.
-- Additive columns on users only — nothing to backfill (defaults cover
-- existing rows: mustChangePassword false, tokens null).

ALTER TABLE "users" ADD COLUMN "phone" TEXT;
ALTER TABLE "users" ADD COLUMN "must_change_password" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN "invite_token_hash" TEXT;
ALTER TABLE "users" ADD COLUMN "invite_token_expiry" TIMESTAMP(3);
