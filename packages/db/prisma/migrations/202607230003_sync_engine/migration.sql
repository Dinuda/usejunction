-- Sync engine: SyncRun / SyncChunk / DeviceUsageFingerprint
CREATE TABLE IF NOT EXISTS "sync_runs" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'usage',
    "status" TEXT NOT NULL DEFAULT 'open',
    "expected_chunks" INTEGER NOT NULL DEFAULT 0,
    "received_chunks" INTEGER NOT NULL DEFAULT 0,
    "expected_rows" INTEGER NOT NULL DEFAULT 0,
    "received_rows" INTEGER NOT NULL DEFAULT 0,
    "manifest_hash" TEXT,
    "delta_partitions" JSONB NOT NULL DEFAULT '[]',
    "manifest_partitions" JSONB NOT NULL DEFAULT '[]',
    "window_from" DATE,
    "window_to" DATE,
    "error" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "committed_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sync_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "sync_chunks" (
    "id" TEXT NOT NULL,
    "sync_run_id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "chunk_id" TEXT NOT NULL,
    "row_count" INTEGER NOT NULL DEFAULT 0,
    "content_hash" TEXT NOT NULL DEFAULT '',
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sync_chunks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "device_usage_fingerprints" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "partition_key" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "device_usage_fingerprints_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "sync_runs_org_id_device_id_status_idx" ON "sync_runs"("org_id", "device_id", "status");
CREATE INDEX IF NOT EXISTS "sync_runs_device_id_started_at_idx" ON "sync_runs"("device_id", "started_at");
CREATE UNIQUE INDEX IF NOT EXISTS "sync_chunks_sync_run_id_chunk_id_key" ON "sync_chunks"("sync_run_id", "chunk_id");
CREATE INDEX IF NOT EXISTS "sync_chunks_device_id_received_at_idx" ON "sync_chunks"("device_id", "received_at");
CREATE UNIQUE INDEX IF NOT EXISTS "device_usage_fingerprints_device_id_partition_key_key" ON "device_usage_fingerprints"("device_id", "partition_key");
CREATE INDEX IF NOT EXISTS "device_usage_fingerprints_org_id_device_id_date_idx" ON "device_usage_fingerprints"("org_id", "device_id", "date");

ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sync_chunks" ADD CONSTRAINT "sync_chunks_sync_run_id_fkey" FOREIGN KEY ("sync_run_id") REFERENCES "sync_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sync_chunks" ADD CONSTRAINT "sync_chunks_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "device_usage_fingerprints" ADD CONSTRAINT "device_usage_fingerprints_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "device_usage_fingerprints" ADD CONSTRAINT "device_usage_fingerprints_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
