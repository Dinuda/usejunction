-- Accounts/quotas inventory sidecars for sync-engine start (fingerprint-gated).
ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "last_quotas_sync_at" TIMESTAMP(3);
ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "accounts_content_hash" TEXT;
ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "quotas_content_hash" TEXT;
