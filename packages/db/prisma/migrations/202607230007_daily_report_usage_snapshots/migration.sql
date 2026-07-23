-- Send-time (19:00 local) usage totals for fair day-over-day report comparisons.
CREATE TABLE "daily_report_usage_snapshots" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "developer_id" TEXT NOT NULL DEFAULT '',
    "local_date" TEXT NOT NULL,
    "send_hour" INTEGER NOT NULL DEFAULT 19,
    "tokens" BIGINT NOT NULL DEFAULT 0,
    "cost_micros" BIGINT NOT NULL DEFAULT 0,
    "requests" INTEGER NOT NULL DEFAULT 0,
    "captured_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_report_usage_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "daily_report_usage_snapshots_org_id_developer_id_local_date_key"
    ON "daily_report_usage_snapshots"("org_id", "developer_id", "local_date");

CREATE INDEX "daily_report_usage_snapshots_org_id_local_date_idx"
    ON "daily_report_usage_snapshots"("org_id", "local_date");

ALTER TABLE "daily_report_usage_snapshots"
    ADD CONSTRAINT "daily_report_usage_snapshots_org_id_fkey"
    FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
