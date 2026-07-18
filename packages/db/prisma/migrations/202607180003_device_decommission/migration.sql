-- Soft-decommission devices on member removal so coverage drops immediately
-- while the agent can still receive a one-shot uninstall directive on heartbeat.
ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "decommissioned_at" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "devices_org_id_decommissioned_at_idx" ON "devices"("org_id", "decommissioned_at");

-- Orphan cleanup: devices belonging to already-removed members.
UPDATE "devices" AS d
SET "decommissioned_at" = COALESCE(u."removed_at", NOW())
FROM "users" AS u
WHERE d."user_id" = u."id"
  AND u."removed_at" IS NOT NULL
  AND d."decommissioned_at" IS NULL;
