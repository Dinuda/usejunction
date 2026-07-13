CREATE TABLE "billing_plan_templates" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "product" TEXT NOT NULL,
    "tool_name" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tier" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "monthly_seat_micros" BIGINT NOT NULL DEFAULT 0,
    "included_monthly_micros" BIGINT NOT NULL DEFAULT 0,
    "input_rate_micros_per_million" BIGINT NOT NULL DEFAULT 0,
    "output_rate_micros_per_million" BIGINT NOT NULL DEFAULT 0,
    "cache_rate_micros_per_million" BIGINT NOT NULL DEFAULT 0,
    "billing_owner" TEXT,
    "renewal_date" DATE,
    "external_reference" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "billing_plan_templates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "developer_plan_assignments" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "developer_id" TEXT NOT NULL,
    "plan_template_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "product" TEXT NOT NULL,
    "tool_name" TEXT NOT NULL,
    "plan_name" TEXT NOT NULL,
    "plan_tier" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "monthly_seat_micros" BIGINT NOT NULL DEFAULT 0,
    "included_monthly_micros" BIGINT NOT NULL DEFAULT 0,
    "input_rate_micros_per_million" BIGINT NOT NULL DEFAULT 0,
    "output_rate_micros_per_million" BIGINT NOT NULL DEFAULT 0,
    "cache_rate_micros_per_million" BIGINT NOT NULL DEFAULT 0,
    "billing_owner" TEXT,
    "renewal_date" DATE,
    "external_reference" TEXT,
    "seat_count" INTEGER NOT NULL DEFAULT 1,
    "seat_status" TEXT NOT NULL DEFAULT 'active',
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "source" TEXT NOT NULL DEFAULT 'admin_confirmed',
    "notes" TEXT,
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "developer_plan_assignments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "billing_plan_templates_org_id_active_idx" ON "billing_plan_templates"("org_id", "active");
CREATE INDEX "developer_plan_assignments_org_id_developer_id_tool_name_start_date_end_date_idx" ON "developer_plan_assignments"("org_id", "developer_id", "tool_name", "start_date", "end_date");
CREATE INDEX "developer_plan_assignments_org_id_start_date_end_date_idx" ON "developer_plan_assignments"("org_id", "start_date", "end_date");

ALTER TABLE "billing_plan_templates" ADD CONSTRAINT "billing_plan_templates_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "developer_plan_assignments" ADD CONSTRAINT "developer_plan_assignments_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "developer_plan_assignments" ADD CONSTRAINT "developer_plan_assignments_developer_id_fkey" FOREIGN KEY ("developer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "developer_plan_assignments" ADD CONSTRAINT "developer_plan_assignments_plan_template_id_fkey" FOREIGN KEY ("plan_template_id") REFERENCES "billing_plan_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
