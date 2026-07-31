ALTER TABLE "devices"
  ADD COLUMN "remote_sync_protocol" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "sync_requests" (
  "id" TEXT NOT NULL,
  "org_id" TEXT NOT NULL,
  "requester_user_id" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "developer_id" TEXT,
  "idempotency_key" TEXT,
  "realtime_channel" TEXT,
  "dispatch_status" TEXT NOT NULL DEFAULT 'pending',
  "dispatch_error" TEXT,
  "published_at" TIMESTAMP(3),
  "expires_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "sync_requests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "device_sync_request_targets" (
  "id" TEXT NOT NULL,
  "request_id" TEXT NOT NULL,
  "org_id" TEXT NOT NULL,
  "device_id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "lease_token" TEXT,
  "lease_expires_at" TIMESTAMP(3),
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "claimed_at" TIMESTAMP(3),
  "running_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "tools_count" INTEGER,
  "accounts_count" INTEGER,
  "quotas_count" INTEGER,
  "usage_rows_count" INTEGER,
  "warnings" JSONB,
  "error_code" TEXT,
  "error_message" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "device_sync_request_targets_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "sync_requests_org_id_created_at_idx" ON "sync_requests"("org_id", "created_at");
CREATE INDEX "sync_requests_org_id_requester_user_id_idempotency_key_created_at_idx"
  ON "sync_requests"("org_id", "requester_user_id", "idempotency_key", "created_at");
CREATE INDEX "sync_requests_org_id_scope_created_at_idx" ON "sync_requests"("org_id", "scope", "created_at");
CREATE INDEX "sync_requests_expires_at_idx" ON "sync_requests"("expires_at");

CREATE UNIQUE INDEX "device_sync_request_targets_request_id_device_id_key"
  ON "device_sync_request_targets"("request_id", "device_id");
CREATE INDEX "device_sync_request_targets_device_id_status_lease_expires_at_idx"
  ON "device_sync_request_targets"("device_id", "status", "lease_expires_at");
CREATE INDEX "device_sync_request_targets_org_id_status_created_at_idx"
  ON "device_sync_request_targets"("org_id", "status", "created_at");
CREATE INDEX "device_sync_request_targets_request_id_status_idx"
  ON "device_sync_request_targets"("request_id", "status");

ALTER TABLE "sync_requests"
  ADD CONSTRAINT "sync_requests_org_id_fkey"
  FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sync_requests"
  ADD CONSTRAINT "sync_requests_developer_id_fkey"
  FOREIGN KEY ("developer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "device_sync_request_targets"
  ADD CONSTRAINT "device_sync_request_targets_request_id_fkey"
  FOREIGN KEY ("request_id") REFERENCES "sync_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "device_sync_request_targets"
  ADD CONSTRAINT "device_sync_request_targets_org_id_fkey"
  FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "device_sync_request_targets"
  ADD CONSTRAINT "device_sync_request_targets_device_id_fkey"
  FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
