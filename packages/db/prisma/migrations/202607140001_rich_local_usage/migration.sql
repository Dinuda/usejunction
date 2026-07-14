-- AlterTable
ALTER TABLE "local_usage_aggregates" ADD COLUMN IF NOT EXISTS "cache_write_tokens" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "local_usage_aggregates" ADD COLUMN IF NOT EXISTS "reasoning_tokens" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "local_usage_aggregates" ADD COLUMN IF NOT EXISTS "suggested_lines" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "local_usage_aggregates" ADD COLUMN IF NOT EXISTS "accepted_lines" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "local_usage_aggregates" ADD COLUMN IF NOT EXISTS "added_lines" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "local_usage_aggregates" ADD COLUMN IF NOT EXISTS "deleted_lines" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "local_usage_aggregates" ADD COLUMN IF NOT EXISTS "commits" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "local_usage_aggregates" ADD COLUMN IF NOT EXISTS "ai_percent" DOUBLE PRECISION;
ALTER TABLE "local_usage_aggregates" ADD COLUMN IF NOT EXISTS "requests" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "local_usage_aggregates" ADD COLUMN IF NOT EXISTS "verified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "local_usage_aggregates" ADD COLUMN IF NOT EXISTS "metadata" JSONB;
