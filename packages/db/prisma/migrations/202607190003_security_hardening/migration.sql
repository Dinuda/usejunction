ALTER TABLE "devices" ADD COLUMN "device_token_hash" TEXT;

CREATE UNIQUE INDEX "devices_device_token_hash_key" ON "devices"("device_token_hash");

CREATE TABLE "rate_limit_buckets" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "window_start" TIMESTAMP(3) NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 0,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "rate_limit_buckets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "rate_limit_buckets_key_window_start_key" ON "rate_limit_buckets"("key", "window_start");
CREATE INDEX "rate_limit_buckets_expires_at_idx" ON "rate_limit_buckets"("expires_at");

ALTER TABLE "signals_policies" ADD COLUMN "raw_work_text_enabled" BOOLEAN NOT NULL DEFAULT false;
