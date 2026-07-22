-- CreateTable
CREATE TABLE "team_invite_links" (
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

-- CreateTable
CREATE TABLE "team_invite_allowlist" (
    "id" TEXT NOT NULL,
    "link_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_invite_allowlist_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "team_invite_links_org_id_key" ON "team_invite_links"("org_id");

-- CreateIndex
CREATE UNIQUE INDEX "team_invite_links_token_hash_key" ON "team_invite_links"("token_hash");

-- CreateIndex
CREATE INDEX "team_invite_allowlist_email_idx" ON "team_invite_allowlist"("email");

-- CreateIndex
CREATE UNIQUE INDEX "team_invite_allowlist_link_id_email_key" ON "team_invite_allowlist"("link_id", "email");

-- AddForeignKey
ALTER TABLE "team_invite_links" ADD CONSTRAINT "team_invite_links_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_invite_allowlist" ADD CONSTRAINT "team_invite_allowlist_link_id_fkey" FOREIGN KEY ("link_id") REFERENCES "team_invite_links"("id") ON DELETE CASCADE ON UPDATE CASCADE;
