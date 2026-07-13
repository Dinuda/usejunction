-- Allow one developer profile per auth user per organization (multi-workspace).
DROP INDEX IF EXISTS "users_auth_user_id_key";

CREATE UNIQUE INDEX "users_org_id_auth_user_id_key" ON "users"("org_id", "auth_user_id");
