-- Who pays for a plan: company (business) vs the person (personal).
ALTER TABLE "billing_plan_templates"
  ADD COLUMN IF NOT EXISTS "billing_profile" TEXT NOT NULL DEFAULT 'business';

CREATE INDEX IF NOT EXISTS "billing_plan_templates_org_id_billing_profile_idx"
  ON "billing_plan_templates"("org_id", "billing_profile");
