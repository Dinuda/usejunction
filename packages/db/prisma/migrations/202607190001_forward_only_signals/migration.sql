-- Establish a durable forward-only boundary for Signals work extraction.
ALTER TABLE "signals_policies"
ADD COLUMN "work_extraction_started_at" TIMESTAMP(3);

-- Existing collected rows are preserved. Currently enabled workspaces begin a
-- new collection epoch at migration time and wait for a compatible agent.
UPDATE "signals_policies"
SET "work_extraction_started_at" = CURRENT_TIMESTAMP
WHERE "work_extraction_enabled" = true;
