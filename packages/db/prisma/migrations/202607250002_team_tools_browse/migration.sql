-- Admin control: developers can open self-scoped tool detail pages (on by default).
ALTER TABLE "activity_settings"
ADD COLUMN "team_tools_browse_enabled" BOOLEAN NOT NULL DEFAULT true;
