-- CreateTable
CREATE TABLE "org_usage_day_snapshots" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "tool_name" TEXT NOT NULL DEFAULT '',
    "metric_version" TEXT NOT NULL,
    "requests" INTEGER NOT NULL DEFAULT 0,
    "input_tokens" BIGINT NOT NULL DEFAULT 0,
    "output_tokens" BIGINT NOT NULL DEFAULT 0,
    "verified_usage_cost_micros" BIGINT NOT NULL DEFAULT 0,
    "estimated_api_cost_micros" BIGINT NOT NULL DEFAULT 0,
    "actual_spend_cost_micros" BIGINT NOT NULL DEFAULT 0,
    "active_developers" INTEGER NOT NULL DEFAULT 0,
    "active_developer_ids" JSONB NOT NULL DEFAULT '[]',
    "computed_at" TIMESTAMP(3) NOT NULL,
    "source_observed_through" TIMESTAMP(3),

    CONSTRAINT "org_usage_day_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_dirty_days" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "metric_version" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_dirty_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_watermarks" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "metric_version" TEXT NOT NULL,
    "cursor_date" DATE,
    "status" TEXT NOT NULL DEFAULT 'idle',
    "last_error" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_watermarks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "org_usage_day_snapshots_org_id_date_metric_version_idx" ON "org_usage_day_snapshots"("org_id", "date", "metric_version");

-- CreateIndex
CREATE UNIQUE INDEX "org_usage_day_snapshots_org_id_date_tool_name_metric_version_key" ON "org_usage_day_snapshots"("org_id", "date", "tool_name", "metric_version");

-- CreateIndex
CREATE INDEX "analytics_dirty_days_org_id_metric_version_idx" ON "analytics_dirty_days"("org_id", "metric_version");

-- CreateIndex
CREATE UNIQUE INDEX "analytics_dirty_days_org_id_date_metric_version_key" ON "analytics_dirty_days"("org_id", "date", "metric_version");

-- CreateIndex
CREATE UNIQUE INDEX "analytics_watermarks_org_id_kind_metric_version_key" ON "analytics_watermarks"("org_id", "kind", "metric_version");

-- AddForeignKey
ALTER TABLE "org_usage_day_snapshots" ADD CONSTRAINT "org_usage_day_snapshots_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics_dirty_days" ADD CONSTRAINT "analytics_dirty_days_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics_watermarks" ADD CONSTRAINT "analytics_watermarks_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
