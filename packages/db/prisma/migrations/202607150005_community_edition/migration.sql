-- Community code no longer reads hosted SaaS fields. Keep any existing hosted
-- subscription columns/data intact so a commercial overlay can adopt them
-- without a destructive handoff.
ALTER TABLE "organizations" ALTER COLUMN "plan" SET DEFAULT 'community';
