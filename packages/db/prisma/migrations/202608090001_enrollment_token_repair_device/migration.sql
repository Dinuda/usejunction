-- Bind enrollment tokens to a device for credential repair (same deviceId on redeem).
ALTER TABLE "enrollment_tokens" ADD COLUMN IF NOT EXISTS "repair_device_id" TEXT;

ALTER TABLE "enrollment_tokens"
  ADD CONSTRAINT "enrollment_tokens_repair_device_id_fkey"
  FOREIGN KEY ("repair_device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "enrollment_tokens_repair_device_id_used_at_idx"
  ON "enrollment_tokens" ("repair_device_id", "used_at");
