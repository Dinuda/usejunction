-- CreateTable
CREATE TABLE "device_activity_events" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "developer_id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "direction" TEXT NOT NULL DEFAULT 'ingest',
    "status" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "request_summary" JSONB NOT NULL,
    "response_summary" JSONB NOT NULL,
    "error_code" TEXT,
    "duration_ms" INTEGER,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_activity_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "device_activity_events_org_id_occurred_at_idx" ON "device_activity_events"("org_id", "occurred_at");

-- CreateIndex
CREATE INDEX "device_activity_events_device_id_occurred_at_idx" ON "device_activity_events"("device_id", "occurred_at");

-- CreateIndex
CREATE INDEX "device_activity_events_developer_id_occurred_at_idx" ON "device_activity_events"("developer_id", "occurred_at");

-- AddForeignKey
ALTER TABLE "device_activity_events" ADD CONSTRAINT "device_activity_events_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_activity_events" ADD CONSTRAINT "device_activity_events_developer_id_fkey" FOREIGN KEY ("developer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_activity_events" ADD CONSTRAINT "device_activity_events_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
