-- Add repository_key to local_usage_aggregates for multi-repo uniqueness.
ALTER TABLE "local_usage_aggregates"
  ADD COLUMN IF NOT EXISTS "repository_key" TEXT NOT NULL DEFAULT '';

-- Replace old unique key (without repository) with grain including repository_key.
DROP INDEX IF EXISTS "local_usage_aggregates_device_id_date_tool_name_model_source_ke";
DROP INDEX IF EXISTS "local_usage_aggregates_device_id_date_tool_name_model_source_key";

CREATE UNIQUE INDEX IF NOT EXISTS "local_usage_aggregates_device_id_date_tool_name_model_source_repository_key_key"
  ON "local_usage_aggregates"("device_id", "date", "tool_name", "model", "source", "repository_key");
