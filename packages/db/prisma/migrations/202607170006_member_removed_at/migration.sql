-- Soft-remove team members while retaining telemetry and historical rows.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "removed_at" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "users_org_id_removed_at_idx" ON "users"("org_id", "removed_at");
