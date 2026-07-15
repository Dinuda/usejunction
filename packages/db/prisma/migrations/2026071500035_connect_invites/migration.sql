CREATE TABLE IF NOT EXISTS "connect_invites" (
  "id" TEXT NOT NULL,
  "org_id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "token_hash" TEXT NOT NULL,
  "invite_id" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "enrollment_token_hash" TEXT,
  "enrollment_token_reveal" TEXT,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "used_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "connect_invites_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "team_invite_links" (
  "id" TEXT NOT NULL,
  "org_id" TEXT NOT NULL,
  "token_hash" TEXT NOT NULL,
  "token_reveal" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "expires_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "rotated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "team_invite_links_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "team_invite_allowlist" (
  "id" TEXT NOT NULL,
  "link_id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "team_invite_allowlist_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "connect_invites_token_hash_key" ON "connect_invites"("token_hash");
CREATE INDEX IF NOT EXISTS "connect_invites_org_id_email_idx" ON "connect_invites"("org_id", "email");
CREATE UNIQUE INDEX IF NOT EXISTS "team_invite_links_org_id_key" ON "team_invite_links"("org_id");
CREATE UNIQUE INDEX IF NOT EXISTS "team_invite_links_token_hash_key" ON "team_invite_links"("token_hash");
CREATE UNIQUE INDEX IF NOT EXISTS "team_invite_allowlist_link_id_email_key" ON "team_invite_allowlist"("link_id", "email");
CREATE INDEX IF NOT EXISTS "team_invite_allowlist_email_idx" ON "team_invite_allowlist"("email");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'connect_invites_org_id_fkey') THEN
    ALTER TABLE "connect_invites" ADD CONSTRAINT "connect_invites_org_id_fkey"
      FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'team_invite_links_org_id_fkey') THEN
    ALTER TABLE "team_invite_links" ADD CONSTRAINT "team_invite_links_org_id_fkey"
      FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'team_invite_allowlist_link_id_fkey') THEN
    ALTER TABLE "team_invite_allowlist" ADD CONSTRAINT "team_invite_allowlist_link_id_fkey"
      FOREIGN KEY ("link_id") REFERENCES "team_invite_links"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
