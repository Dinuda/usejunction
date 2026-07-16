ALTER TABLE "billing_plan_templates"
  RENAME COLUMN "monthly_seat_micros" TO "cycle_seat_micros";

ALTER TABLE "billing_plan_templates"
  RENAME COLUMN "included_monthly_micros" TO "included_cycle_micros";

ALTER TABLE "developer_plan_assignments"
  RENAME COLUMN "monthly_seat_micros" TO "cycle_seat_micros";

ALTER TABLE "developer_plan_assignments"
  RENAME COLUMN "included_monthly_micros" TO "included_cycle_micros";

ALTER TABLE "billing_plan_templates"
  ADD COLUMN "billing_cycle_anchor_date" DATE,
  ADD COLUMN "billing_cycle_days" INTEGER;

ALTER TABLE "developer_plan_assignments"
  ADD COLUMN "billing_cadence" TEXT NOT NULL DEFAULT 'monthly',
  ADD COLUMN "billing_cycle_anchor_date" DATE,
  ADD COLUMN "billing_cycle_days" INTEGER;

UPDATE "billing_plan_templates"
SET "billing_cycle_anchor_date" = COALESCE(
  CASE
    WHEN "renewal_date" IS NULL THEN NULL
    WHEN "billing_cadence" = 'annual' THEN ("renewal_date" - INTERVAL '1 year')::DATE
    WHEN "billing_cadence" = 'weekly' THEN ("renewal_date" - INTERVAL '7 days')::DATE
    WHEN "billing_cadence" = 'custom' AND "billing_cycle_days" IS NOT NULL THEN ("renewal_date" - ("billing_cycle_days" || ' days')::INTERVAL)::DATE
    ELSE ("renewal_date" - INTERVAL '1 month')::DATE
  END,
  "created_at"::DATE
);

UPDATE "developer_plan_assignments" AS assignment
SET
  "billing_cadence" = template."billing_cadence",
  "billing_cycle_anchor_date" = COALESCE(template."billing_cycle_anchor_date", assignment."start_date", assignment."created_at"::DATE),
  "billing_cycle_days" = template."billing_cycle_days"
FROM "billing_plan_templates" AS template
WHERE assignment."plan_template_id" = template."id";

ALTER TABLE "billing_plan_templates"
  DROP COLUMN "renewal_date";

ALTER TABLE "developer_plan_assignments"
  DROP COLUMN "renewal_date";

ALTER TABLE "billing_plan_templates"
  ADD CONSTRAINT "billing_plan_templates_cycle_days_check" CHECK ("billing_cycle_days" IS NULL OR "billing_cycle_days" > 0);

ALTER TABLE "developer_plan_assignments"
  ADD CONSTRAINT "developer_plan_assignments_cycle_days_check" CHECK ("billing_cycle_days" IS NULL OR "billing_cycle_days" > 0);
