-- Structured activity traces for local work sessions (tools/skills/location/approach).
ALTER TABLE "local_work_sessions" ADD COLUMN IF NOT EXISTS "trace" JSONB;
