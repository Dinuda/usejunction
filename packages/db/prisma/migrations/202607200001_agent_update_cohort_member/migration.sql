-- AlterTable
ALTER TABLE "agent_update_deployments" ADD COLUMN IF NOT EXISTS "cohort_member" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "agent_update_deployments_release_id_cohort_member_idx" ON "agent_update_deployments"("release_id", "cohort_member");
