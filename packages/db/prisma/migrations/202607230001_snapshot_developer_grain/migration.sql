-- AlterTable: add developer grain for You/Team sealed snapshot consistency
ALTER TABLE "org_usage_day_snapshots" ADD COLUMN IF NOT EXISTS "developer_id" TEXT NOT NULL DEFAULT '';

-- DropIndex (Postgres may truncate long names; drop both known forms)
DROP INDEX IF EXISTS "org_usage_day_snapshots_org_id_date_tool_name_metric_version_key";
DROP INDEX IF EXISTS "org_usage_day_snapshots_org_id_date_tool_name_metric_versio_key";

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "org_usage_day_snapshots_org_id_date_tool_name_developer_id_metric_version_key" ON "org_usage_day_snapshots"("org_id", "date", "tool_name", "developer_id", "metric_version");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "org_usage_day_snapshots_org_id_developer_id_date_metric_version_idx" ON "org_usage_day_snapshots"("org_id", "developer_id", "date", "metric_version");
