CREATE TABLE "provider_connection_capabilities" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "connection_id" TEXT NOT NULL,
    "capability" TEXT NOT NULL,
    "endpoint" TEXT,
    "status" TEXT NOT NULL DEFAULT 'unknown',
    "permission" TEXT,
    "schema_version" TEXT,
    "cursor" TEXT,
    "data_through" TIMESTAMP(3),
    "last_checked_at" TIMESTAMP(3),
    "last_success_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "provider_connection_capabilities_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "provider_source_records" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "connection_id" TEXT NOT NULL,
    "sync_run_id" TEXT,
    "capability" TEXT NOT NULL,
    "external_record_id" TEXT,
    "fingerprint" TEXT NOT NULL,
    "schema_version" TEXT NOT NULL,
    "occurred_at" TIMESTAMP(3),
    "payload" JSONB NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "provider_source_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "provider_connection_capabilities_connection_id_capability_key"
  ON "provider_connection_capabilities"("connection_id", "capability");
CREATE INDEX "provider_connection_capabilities_org_id_status_idx"
  ON "provider_connection_capabilities"("org_id", "status");
CREATE UNIQUE INDEX "provider_source_records_connection_id_capability_fingerprint_key"
  ON "provider_source_records"("connection_id", "capability", "fingerprint");
CREATE INDEX "provider_source_records_org_id_expires_at_idx"
  ON "provider_source_records"("org_id", "expires_at");
CREATE INDEX "provider_source_records_connection_id_capability_occurred_at_idx"
  ON "provider_source_records"("connection_id", "capability", "occurred_at");

ALTER TABLE "provider_connection_capabilities"
  ADD CONSTRAINT "provider_connection_capabilities_org_id_fkey"
  FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "provider_connection_capabilities"
  ADD CONSTRAINT "provider_connection_capabilities_connection_id_fkey"
  FOREIGN KEY ("connection_id") REFERENCES "provider_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "provider_source_records"
  ADD CONSTRAINT "provider_source_records_org_id_fkey"
  FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "provider_source_records"
  ADD CONSTRAINT "provider_source_records_connection_id_fkey"
  FOREIGN KEY ("connection_id") REFERENCES "provider_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "provider_source_records"
  ADD CONSTRAINT "provider_source_records_sync_run_id_fkey"
  FOREIGN KEY ("sync_run_id") REFERENCES "provider_sync_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
