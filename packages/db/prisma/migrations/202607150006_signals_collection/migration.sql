CREATE TABLE IF NOT EXISTS "signals_policies" (
  "id" TEXT NOT NULL,
  "org_id" TEXT NOT NULL,
  "team_id" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "retention_days" INTEGER NOT NULL DEFAULT 90,
  "collection_mode" TEXT NOT NULL DEFAULT 'app_domain',
  "excluded_apps" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "excluded_domains" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "store_events" BOOLEAN NOT NULL DEFAULT false,
  "updated_by_user_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "signals_policies_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "signals_activity_events" (
  "id" TEXT NOT NULL,
  "org_id" TEXT NOT NULL,
  "developer_id" TEXT NOT NULL,
  "device_id" TEXT NOT NULL,
  "local_id" TEXT NOT NULL,
  "observed_at" TIMESTAMP(3) NOT NULL,
  "app" TEXT,
  "domain" TEXT,
  "event_type" TEXT NOT NULL,
  "collection_mode" TEXT NOT NULL DEFAULT 'app_domain',
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "signals_activity_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "signals_sessions" (
  "id" TEXT NOT NULL,
  "org_id" TEXT NOT NULL,
  "developer_id" TEXT NOT NULL,
  "device_id" TEXT NOT NULL,
  "local_id" TEXT NOT NULL,
  "started_at" TIMESTAMP(3) NOT NULL,
  "ended_at" TIMESTAMP(3) NOT NULL,
  "duration_seconds" INTEGER NOT NULL,
  "ai_tool" TEXT NOT NULL,
  "app_before" TEXT,
  "domain_before" TEXT,
  "app_after" TEXT,
  "domain_after" TEXT,
  "flow_signature" TEXT NOT NULL,
  "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "collection_mode" TEXT NOT NULL DEFAULT 'app_domain',
  "steps" JSONB NOT NULL,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "signals_sessions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "signals_policies_org_id_team_id_idx" ON "signals_policies" ("org_id", "team_id");
CREATE UNIQUE INDEX IF NOT EXISTS "signals_activity_events_device_id_local_id_key" ON "signals_activity_events" ("device_id", "local_id");
CREATE INDEX IF NOT EXISTS "signals_activity_events_org_id_developer_id_observed_at_idx" ON "signals_activity_events" ("org_id", "developer_id", "observed_at");
CREATE UNIQUE INDEX IF NOT EXISTS "signals_sessions_device_id_local_id_key" ON "signals_sessions" ("device_id", "local_id");
CREATE INDEX IF NOT EXISTS "signals_sessions_org_id_developer_id_started_at_idx" ON "signals_sessions" ("org_id", "developer_id", "started_at");
CREATE INDEX IF NOT EXISTS "signals_sessions_org_id_flow_signature_started_at_idx" ON "signals_sessions" ("org_id", "flow_signature", "started_at");

ALTER TABLE "signals_policies"
  ADD CONSTRAINT "signals_policies_org_id_fkey"
  FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "signals_policies"
  ADD CONSTRAINT "signals_policies_team_id_fkey"
  FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "signals_activity_events"
  ADD CONSTRAINT "signals_activity_events_org_id_fkey"
  FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "signals_activity_events"
  ADD CONSTRAINT "signals_activity_events_developer_id_fkey"
  FOREIGN KEY ("developer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "signals_activity_events"
  ADD CONSTRAINT "signals_activity_events_device_id_fkey"
  FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "signals_sessions"
  ADD CONSTRAINT "signals_sessions_org_id_fkey"
  FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "signals_sessions"
  ADD CONSTRAINT "signals_sessions_developer_id_fkey"
  FOREIGN KEY ("developer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "signals_sessions"
  ADD CONSTRAINT "signals_sessions_device_id_fkey"
  FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
