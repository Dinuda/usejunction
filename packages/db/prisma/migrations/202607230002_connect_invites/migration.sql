-- CreateTable
CREATE TABLE "connect_invites" (
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

-- CreateIndex
CREATE UNIQUE INDEX "connect_invites_token_hash_key" ON "connect_invites"("token_hash");

-- CreateIndex
CREATE INDEX "connect_invites_org_id_email_idx" ON "connect_invites"("org_id", "email");

-- AddForeignKey
ALTER TABLE "connect_invites" ADD CONSTRAINT "connect_invites_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
