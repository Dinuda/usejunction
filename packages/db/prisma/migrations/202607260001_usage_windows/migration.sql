ALTER TABLE "billing_plan_templates"
  ADD COLUMN "usage_window_preference" TEXT NOT NULL DEFAULT 'auto';

CREATE TABLE "quota_observations" (
  "id" TEXT NOT NULL,
  "org_id" TEXT NOT NULL,
  "device_id" TEXT NOT NULL,
  "tool_name" TEXT NOT NULL,
  "window_type" TEXT NOT NULL,
  "reset_at" TIMESTAMP(3) NOT NULL,
  "used_percent" DOUBLE PRECISION NOT NULL,
  "observed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sample_bucket" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "quota_observations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "quota_observations_device_tool_window_reset_bucket_key"
  ON "quota_observations"("device_id", "tool_name", "window_type", "reset_at", "sample_bucket");
CREATE INDEX "quota_observations_org_tool_window_reset_observed_idx"
  ON "quota_observations"("org_id", "tool_name", "window_type", "reset_at", "observed_at");
CREATE INDEX "quota_observations_device_observed_idx"
  ON "quota_observations"("device_id", "observed_at");

ALTER TABLE "quota_observations"
  ADD CONSTRAINT "quota_observations_org_id_fkey"
  FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quota_observations"
  ADD CONSTRAINT "quota_observations_device_id_fkey"
  FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
