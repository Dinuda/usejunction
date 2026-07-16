CREATE TABLE IF NOT EXISTS "agent_releases" (
  "id" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'candidate',
  "urgency" TEXT NOT NULL DEFAULT 'normal',
  "rollout_hours" INTEGER NOT NULL DEFAULT 24,
  "published_at" TIMESTAMP(3) NOT NULL,
  "rollout_started_at" TIMESTAMP(3),
  "manifest" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "agent_releases_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "agent_update_deployments" (
  "id" TEXT NOT NULL,
  "release_id" TEXT NOT NULL,
  "org_id" TEXT NOT NULL,
  "device_id" TEXT NOT NULL,
  "source_version" TEXT NOT NULL,
  "target_version" TEXT NOT NULL,
  "eligible_at" TIMESTAMP(3) NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'pending',
  "directive_delivered_at" TIMESTAMP(3),
  "download_started_at" TIMESTAMP(3),
  "downloaded_at" TIMESTAMP(3),
  "install_started_at" TIMESTAMP(3),
  "confirmed_at" TIMESTAMP(3),
  "failed_at" TIMESTAMP(3),
  "rolled_back_at" TIMESTAMP(3),
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "last_error_stage" TEXT,
  "last_error_code" TEXT,
  "last_event_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "agent_update_deployments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "agent_update_events" (
  "id" TEXT NOT NULL,
  "event_id" TEXT NOT NULL,
  "deployment_id" TEXT NOT NULL,
  "org_id" TEXT NOT NULL,
  "device_id" TEXT NOT NULL,
  "event_type" TEXT NOT NULL,
  "current_version" TEXT,
  "target_version" TEXT NOT NULL,
  "stage" TEXT,
  "error_code" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agent_update_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "agent_releases_version_key" ON "agent_releases"("version");
CREATE INDEX IF NOT EXISTS "agent_releases_status_rollout_started_at_idx" ON "agent_releases"("status", "rollout_started_at");
CREATE UNIQUE INDEX IF NOT EXISTS "agent_update_deployments_release_id_device_id_key" ON "agent_update_deployments"("release_id", "device_id");
CREATE INDEX IF NOT EXISTS "agent_update_deployments_org_id_release_id_state_idx" ON "agent_update_deployments"("org_id", "release_id", "state");
CREATE INDEX IF NOT EXISTS "agent_update_deployments_device_id_created_at_idx" ON "agent_update_deployments"("device_id", "created_at");
CREATE UNIQUE INDEX IF NOT EXISTS "agent_update_events_device_id_event_id_key" ON "agent_update_events"("device_id", "event_id");
CREATE INDEX IF NOT EXISTS "agent_update_events_deployment_id_created_at_idx" ON "agent_update_events"("deployment_id", "created_at");
CREATE INDEX IF NOT EXISTS "agent_update_events_org_id_created_at_idx" ON "agent_update_events"("org_id", "created_at");

ALTER TABLE "agent_update_deployments" ADD CONSTRAINT "agent_update_deployments_release_id_fkey" FOREIGN KEY ("release_id") REFERENCES "agent_releases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_update_deployments" ADD CONSTRAINT "agent_update_deployments_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_update_deployments" ADD CONSTRAINT "agent_update_deployments_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_update_events" ADD CONSTRAINT "agent_update_events_deployment_id_fkey" FOREIGN KEY ("deployment_id") REFERENCES "agent_update_deployments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_update_events" ADD CONSTRAINT "agent_update_events_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_update_events" ADD CONSTRAINT "agent_update_events_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
