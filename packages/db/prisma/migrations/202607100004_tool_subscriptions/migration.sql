ALTER TABLE "billing_plan_templates"
  ADD COLUMN "tool_key" TEXT,
  ADD COLUMN "catalog_plan_key" TEXT,
  ADD COLUMN "billing_cadence" TEXT NOT NULL DEFAULT 'monthly',
  ADD COLUMN "seat_capacity" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "price_source" TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN "price_verified_at" DATE,
  ADD COLUMN "custom_price" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "provider_source_url" TEXT;

ALTER TABLE "developer_plan_assignments"
  ADD COLUMN "vendor_account_email" TEXT;

UPDATE "billing_plan_templates"
SET "tool_key" = CASE LOWER("tool_name")
  WHEN 'chatgpt' THEN 'chatgpt-codex'
  WHEN 'codex' THEN 'chatgpt-codex'
  WHEN 'claude' THEN 'claude'
  WHEN 'claude-code' THEN 'claude'
  WHEN 'cursor' THEN 'cursor'
  WHEN 'copilot' THEN 'github-copilot'
  WHEN 'github-copilot' THEN 'github-copilot'
  ELSE LOWER("tool_name")
END;

UPDATE "billing_plan_templates" AS plan
SET "seat_capacity" = GREATEST(
  1,
  COALESCE((
    SELECT SUM(assignment."seat_count")::INTEGER
    FROM "developer_plan_assignments" AS assignment
    WHERE assignment."plan_template_id" = plan."id"
      AND assignment."active" = true
      AND assignment."seat_status" = 'active'
  ), 0)
);

CREATE INDEX "billing_plan_templates_org_id_tool_key_active_idx"
  ON "billing_plan_templates"("org_id", "tool_key", "active");

ALTER TABLE "billing_plan_templates"
  ADD CONSTRAINT "billing_plan_templates_seat_capacity_check" CHECK ("seat_capacity" >= 0);
