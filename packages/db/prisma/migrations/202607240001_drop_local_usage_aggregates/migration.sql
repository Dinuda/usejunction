-- Drop legacy dual-write mirror; usage_daily is the canonical fact table.
DROP TABLE IF EXISTS "local_usage_aggregates";
