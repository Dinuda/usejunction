-- Rename legacy membership role "developer" → "user"
UPDATE "organization_memberships" SET "role" = 'user' WHERE "role" = 'developer';
UPDATE "users" SET "role" = 'user' WHERE "role" = 'developer';
UPDATE "organization_invites" SET "role" = 'user' WHERE "role" = 'developer';

ALTER TABLE "organization_memberships" ALTER COLUMN "role" SET DEFAULT 'user';
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'user';
ALTER TABLE "organization_invites" ALTER COLUMN "role" SET DEFAULT 'user';
