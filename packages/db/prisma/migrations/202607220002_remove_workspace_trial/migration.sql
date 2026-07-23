-- Remove workspace trial: Community is the free plan (5 seats).
UPDATE "organizations" SET "plan" = 'community' WHERE "plan" = 'trial';
ALTER TABLE "organizations" ALTER COLUMN "plan" SET DEFAULT 'community';
ALTER TABLE "organizations" DROP COLUMN IF EXISTS "trial_ends_at";
