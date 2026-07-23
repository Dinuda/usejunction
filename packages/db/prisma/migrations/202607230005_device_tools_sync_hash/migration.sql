-- Tool inventory sidecar for sync-engine start (fingerprint-gated).
ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "last_tools_sync_at" TIMESTAMP(3);
ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "tools_content_hash" TEXT;
