-- Signals-gated local AI work extraction
ALTER TABLE "signals_policies" ADD COLUMN "work_extraction_enabled" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "local_work_sessions" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "developer_id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "local_id" TEXT NOT NULL,
    "tool_name" TEXT NOT NULL,
    "model" TEXT,
    "mode" TEXT,
    "title" TEXT,
    "tldr" TEXT,
    "overview" TEXT,
    "started_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),
    "observed_at" TIMESTAMP(3) NOT NULL,
    "tool_call_counts" JSONB,
    "repository" JSONB,
    "source" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "local_work_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "local_work_sessions_device_id_local_id_key" ON "local_work_sessions"("device_id", "local_id");
CREATE INDEX "local_work_sessions_org_id_developer_id_observed_at_idx" ON "local_work_sessions"("org_id", "developer_id", "observed_at");
CREATE INDEX "local_work_sessions_org_id_tool_name_observed_at_idx" ON "local_work_sessions"("org_id", "tool_name", "observed_at");

ALTER TABLE "local_work_sessions" ADD CONSTRAINT "local_work_sessions_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "local_work_sessions" ADD CONSTRAINT "local_work_sessions_developer_id_fkey" FOREIGN KEY ("developer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "local_work_sessions" ADD CONSTRAINT "local_work_sessions_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
