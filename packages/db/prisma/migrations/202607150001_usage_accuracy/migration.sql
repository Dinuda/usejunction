-- Usage accuracy: explicit token buckets, metric/cost kinds, source-aware uniqueness

ALTER TABLE "usage_daily"
  ADD COLUMN IF NOT EXISTS "cache_write_tokens" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "reasoning_tokens" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "metric_kind" TEXT NOT NULL DEFAULT 'usage',
  ADD COLUMN IF NOT EXISTS "cost_kind" TEXT,
  ADD COLUMN IF NOT EXISTS "calculation_version" TEXT;

ALTER TABLE "local_usage_aggregates"
  ADD COLUMN IF NOT EXISTS "metric_kind" TEXT NOT NULL DEFAULT 'usage',
  ADD COLUMN IF NOT EXISTS "cost_kind" TEXT,
  ADD COLUMN IF NOT EXISTS "calculation_version" TEXT;

-- Drop old uniqueness and add source-aware key
ALTER TABLE "local_usage_aggregates" DROP CONSTRAINT IF EXISTS "local_usage_aggregates_device_id_date_tool_name_model_key";
CREATE UNIQUE INDEX IF NOT EXISTS "local_usage_aggregates_device_id_date_tool_name_model_source_key"
  ON "local_usage_aggregates" ("device_id", "date", "tool_name", "model", "source");

-- Zero phantom Cursor productivity requests from historical local scans
UPDATE "usage_daily"
SET requests = 0, metric_kind = 'productivity'
WHERE source IN ('cursor_local', 'device_observed')
  AND tool_name = 'cursor'
  AND model IN ('ai-lines', 'commits')
  AND requests > 0;

UPDATE "local_usage_aggregates"
SET requests = 0, metric_kind = 'productivity'
WHERE source IN ('cursor_local', 'device_observed')
  AND tool_name = 'cursor'
  AND (added_lines > 0 OR suggested_lines > 0 OR commits > 0)
  AND requests > 0;

-- Normalize legacy Cursor event sources
UPDATE "usage_daily"
SET source = 'vendor_verified', verified = true, cost_kind = 'verified_usage'
WHERE source = 'cursor_usage_events';

UPDATE "local_usage_aggregates"
SET source = 'vendor_verified', verified = true, cost_kind = 'verified_usage'
WHERE source = 'cursor_usage_events';

-- Mark pre-fix Codex estimates stale
UPDATE "usage_daily"
SET calculation_version = 'usage-v1-stale'
WHERE tool_name = 'codex'
  AND source IN ('device_observed', 'local_scan')
  AND (calculation_version IS NULL OR calculation_version <> 'usage-v2');
