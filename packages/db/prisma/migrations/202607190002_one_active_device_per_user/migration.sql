-- Preserve device history while making the most recently seen device the user's
-- only active device.
WITH ranked_active_devices AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id
      ORDER BY last_seen_at DESC, created_at DESC, id DESC
    ) AS device_rank
  FROM devices
  WHERE decommissioned_at IS NULL
)
UPDATE devices AS device
SET
  decommissioned_at = NOW(),
  status = 'offline',
  local_endpoint = NULL,
  local_sync_token_hash = NULL,
  local_sync_token_enc = NULL
FROM ranked_active_devices AS ranked
WHERE device.id = ranked.id
  AND ranked.device_rank > 1;

CREATE UNIQUE INDEX "devices_one_active_per_user"
  ON "devices" ("user_id")
  WHERE "decommissioned_at" IS NULL;
