-- The usage_accuracy migration tried to replace the 4-column unique key with a
-- source-aware 5-column key via DROP CONSTRAINT, but the original object was a
-- UNIQUE INDEX (from baseline), so both indexes remained. Bulk INSERT …
-- ON CONFLICT (device_id, date, tool_name, model, source) then fails with 23505
-- when a row already exists for the same device/date/tool/model under a different
-- source (or when a batch contains both).
DROP INDEX IF EXISTS "local_usage_aggregates_device_id_date_tool_name_model_key";
