-- Extend org_usage_day_snapshots for model grain + productivity/token measures
ALTER TABLE "org_usage_day_snapshots" ADD COLUMN IF NOT EXISTS "model_name" TEXT NOT NULL DEFAULT '';
ALTER TABLE "org_usage_day_snapshots" ADD COLUMN IF NOT EXISTS "sessions" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "org_usage_day_snapshots" ADD COLUMN IF NOT EXISTS "cache_read_tokens" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "org_usage_day_snapshots" ADD COLUMN IF NOT EXISTS "cache_write_tokens" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "org_usage_day_snapshots" ADD COLUMN IF NOT EXISTS "reasoning_tokens" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "org_usage_day_snapshots" ADD COLUMN IF NOT EXISTS "suggested_lines" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "org_usage_day_snapshots" ADD COLUMN IF NOT EXISTS "accepted_lines" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "org_usage_day_snapshots" ADD COLUMN IF NOT EXISTS "added_lines" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "org_usage_day_snapshots" ADD COLUMN IF NOT EXISTS "deleted_lines" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "org_usage_day_snapshots" ADD COLUMN IF NOT EXISTS "commits" INTEGER NOT NULL DEFAULT 0;

-- Drop old unique (Postgres may truncate long names)
DROP INDEX IF EXISTS "org_usage_day_snapshots_org_id_date_tool_name_developer_id_metric_version_key";
DROP INDEX IF EXISTS "org_usage_day_snapshots_org_id_date_tool_name_developer_id_m_key";

-- Unique includes model_name
CREATE UNIQUE INDEX IF NOT EXISTS "org_usage_day_snapshots_org_id_date_tool_name_developer_id_model_name_metric_version_key"
  ON "org_usage_day_snapshots"("org_id", "date", "tool_name", "developer_id", "model_name", "metric_version");
