-- Heartbeats remain the source of last-seen timestamps; devices no longer have
-- a derived online/offline status.
ALTER TABLE "devices" DROP COLUMN "status";
