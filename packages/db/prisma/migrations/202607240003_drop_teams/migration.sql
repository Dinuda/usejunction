-- Drop Team scaffolding: org-scoped product only.
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_team_id_fkey";
ALTER TABLE "enrollment_tokens" DROP CONSTRAINT IF EXISTS "enrollment_tokens_team_id_fkey";
ALTER TABLE "signals_policies" DROP CONSTRAINT IF EXISTS "signals_policies_team_id_fkey";

DROP INDEX IF EXISTS "signals_policies_org_id_team_id_idx";

ALTER TABLE "users" DROP COLUMN IF EXISTS "team_id";
ALTER TABLE "enrollment_tokens" DROP COLUMN IF EXISTS "team_id";
ALTER TABLE "signals_policies" DROP COLUMN IF EXISTS "team_id";

CREATE INDEX IF NOT EXISTS "signals_policies_org_id_idx" ON "signals_policies"("org_id");

DROP TABLE IF EXISTS "teams";
