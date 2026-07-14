-- AlterTable
ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "local_endpoint" TEXT;
ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "local_sync_token_hash" TEXT;
ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "local_sync_token_enc" TEXT;
ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "last_usage_sync_at" TIMESTAMP(3);
