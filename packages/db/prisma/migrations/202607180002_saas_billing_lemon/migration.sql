-- SaaS Lemon billing columns on organizations + drop vendor tool-spend tables.

ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "trial_ends_at" TIMESTAMP(3);
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "subscription_status" TEXT;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "lemon_squeezy_customer_id" TEXT;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "lemon_squeezy_subscription_id" TEXT;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "lemon_squeezy_variant_id" TEXT;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "lemon_squeezy_quantity" INTEGER;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "billing_email" TEXT;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "current_period_end" TIMESTAMP(3);

ALTER TABLE "organizations" ALTER COLUMN "plan" SET DEFAULT 'trial';

DROP TABLE IF EXISTS "developer_plan_assignments";
DROP TABLE IF EXISTS "billing_plan_templates";
