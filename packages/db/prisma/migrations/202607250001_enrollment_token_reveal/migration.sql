-- Add short-lived plaintext reveal for idempotent enrollment token issuance.
ALTER TABLE "enrollment_tokens" ADD COLUMN "token_reveal" TEXT;
