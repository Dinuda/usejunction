ALTER TABLE "organization_memberships"
ADD COLUMN "onboarding_completed_at" TIMESTAMP(3),
ADD COLUMN "setup_checklist_dismissed_at" TIMESTAMP(3);
