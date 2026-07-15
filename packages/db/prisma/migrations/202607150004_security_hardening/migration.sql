-- Hash long-lived device credentials at rest. pgcrypto is used only for the
-- one-time backfill; application code hashes all new credentials.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "device_token_hash" TEXT;
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'devices'
      AND column_name = 'device_token'
  ) THEN
    UPDATE "devices"
    SET "device_token_hash" = encode(digest("device_token", 'sha256'), 'hex')
    WHERE "device_token_hash" IS NULL;
  END IF;
END $$;
ALTER TABLE "devices" ALTER COLUMN "device_token_hash" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "devices_device_token_hash_key" ON "devices"("device_token_hash");
DROP INDEX IF EXISTS "devices_device_token_key";
ALTER TABLE "devices" DROP COLUMN "device_token";

-- Browser invite tokens and terminal polling credentials are now separate.
ALTER TABLE "connect_invites" ADD COLUMN IF NOT EXISTS "poll_token_hash" TEXT;

-- Raw invite and enrollment credentials must never be persisted.
ALTER TABLE "connect_invites" DROP COLUMN IF EXISTS "enrollment_token_reveal";
ALTER TABLE "team_invite_links" DROP COLUMN IF EXISTS "token_reveal";
