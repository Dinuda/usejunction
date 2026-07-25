-- Team visibility is allowed by default; admins can still restrict per org.
ALTER TABLE "activity_settings"
ALTER COLUMN "team_device_activity_enabled" SET DEFAULT true;

ALTER TABLE "activity_settings"
ALTER COLUMN "team_tools_browse_enabled" SET DEFAULT true;
