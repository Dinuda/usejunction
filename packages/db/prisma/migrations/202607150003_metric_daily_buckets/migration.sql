-- CreateTable
CREATE TABLE "metric_daily_buckets" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "developer_id" TEXT NOT NULL DEFAULT '',
    "tool_name" TEXT NOT NULL DEFAULT '',
    "provider" TEXT NOT NULL DEFAULT '',
    "model" TEXT NOT NULL DEFAULT '',
    "metric_kind" TEXT NOT NULL DEFAULT 'usage',
    "metric_version" TEXT NOT NULL,
    "requests" INTEGER NOT NULL DEFAULT 0,
    "sessions" INTEGER NOT NULL DEFAULT 0,
    "input_tokens" BIGINT NOT NULL DEFAULT 0,
    "output_tokens" BIGINT NOT NULL DEFAULT 0,
    "cache_read_tokens" BIGINT NOT NULL DEFAULT 0,
    "cache_write_tokens" BIGINT NOT NULL DEFAULT 0,
    "reasoning_tokens" BIGINT NOT NULL DEFAULT 0,
    "suggested_lines" BIGINT NOT NULL DEFAULT 0,
    "accepted_lines" BIGINT NOT NULL DEFAULT 0,
    "added_lines" BIGINT NOT NULL DEFAULT 0,
    "deleted_lines" BIGINT NOT NULL DEFAULT 0,
    "commits" INTEGER NOT NULL DEFAULT 0,
    "cost_micros" BIGINT NOT NULL DEFAULT 0,
    "verified_cost_micros" BIGINT NOT NULL DEFAULT 0,
    "estimated_cost_micros" BIGINT NOT NULL DEFAULT 0,
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source_observed_through" TIMESTAMP(3),

    CONSTRAINT "metric_daily_buckets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_watermarks" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'metric_daily',
    "metric_version" TEXT NOT NULL,
    "cursor_date" DATE,
    "cursor_observed_at" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'idle',
    "last_error" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "analytics_watermarks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_dirty_days" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "metric_version" TEXT NOT NULL,
    "marked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_dirty_days_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "metric_daily_buckets_org_id_metric_version_date_idx" ON "metric_daily_buckets"("org_id", "metric_version", "date");

-- CreateIndex
CREATE INDEX "metric_daily_buckets_org_id_metric_version_developer_id_date_idx" ON "metric_daily_buckets"("org_id", "metric_version", "developer_id", "date");

-- CreateIndex
CREATE INDEX "metric_daily_buckets_org_id_metric_version_tool_name_date_idx" ON "metric_daily_buckets"("org_id", "metric_version", "tool_name", "date");

-- CreateIndex
CREATE UNIQUE INDEX "metric_daily_buckets_org_id_date_developer_id_tool_name_provider_model_metric_kind_metric_version_key" ON "metric_daily_buckets"("org_id", "date", "developer_id", "tool_name", "provider", "model", "metric_kind", "metric_version");

-- CreateIndex
CREATE INDEX "analytics_watermarks_status_updated_at_idx" ON "analytics_watermarks"("status", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "analytics_watermarks_org_id_kind_metric_version_key" ON "analytics_watermarks"("org_id", "kind", "metric_version");

-- CreateIndex
CREATE INDEX "analytics_dirty_days_org_id_metric_version_date_idx" ON "analytics_dirty_days"("org_id", "metric_version", "date");

-- CreateIndex
CREATE UNIQUE INDEX "analytics_dirty_days_org_id_date_metric_version_key" ON "analytics_dirty_days"("org_id", "date", "metric_version");

-- AddForeignKey
ALTER TABLE "metric_daily_buckets" ADD CONSTRAINT "metric_daily_buckets_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics_watermarks" ADD CONSTRAINT "analytics_watermarks_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics_dirty_days" ADD CONSTRAINT "analytics_dirty_days_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
