ALTER TABLE "sync_requests"
  ALTER COLUMN "requester_user_id" DROP NOT NULL,
  ADD COLUMN "trigger" TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN "automation_key" TEXT;

CREATE UNIQUE INDEX "sync_requests_automation_key_key"
  ON "sync_requests"("automation_key");

CREATE TABLE "device_recovery_notices" (
  "id" TEXT NOT NULL,
  "org_id" TEXT NOT NULL,
  "device_id" TEXT NOT NULL,
  "last_seen_at_snapshot" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "sent_at" TIMESTAMP(3),
  "recovered_at" TIMESTAMP(3),
  "last_error" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "device_recovery_notices_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "device_recovery_notices_device_id_last_seen_at_snapshot_key"
  ON "device_recovery_notices"("device_id", "last_seen_at_snapshot");
CREATE INDEX "device_recovery_notices_org_id_status_created_at_idx"
  ON "device_recovery_notices"("org_id", "status", "created_at");
CREATE INDEX "device_recovery_notices_device_id_recovered_at_idx"
  ON "device_recovery_notices"("device_id", "recovered_at");

ALTER TABLE "device_recovery_notices"
  ADD CONSTRAINT "device_recovery_notices_org_id_fkey"
  FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "device_recovery_notices_device_id_fkey"
  FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
