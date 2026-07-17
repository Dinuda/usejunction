-- Activity settings: admin controls which Activity features developers may use.
CREATE TABLE "activity_settings" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "team_period_controls_enabled" BOOLEAN NOT NULL DEFAULT false,
    "team_device_activity_enabled" BOOLEAN NOT NULL DEFAULT false,
    "updated_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "activity_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "activity_settings_org_id_key" ON "activity_settings"("org_id");

ALTER TABLE "activity_settings" ADD CONSTRAINT "activity_settings_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
