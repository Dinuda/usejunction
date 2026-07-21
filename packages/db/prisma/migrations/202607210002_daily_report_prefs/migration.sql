-- AlterTable
ALTER TABLE "auth_users" ADD COLUMN "time_zone" TEXT,
ADD COLUMN "time_zone_source" TEXT,
ADD COLUMN "time_zone_manual" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "user_notification_preferences" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "daily_personal_enabled" BOOLEAN NOT NULL DEFAULT true,
    "daily_org_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_report_deliveries" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "local_date" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'success',
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_report_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_notification_preferences_org_id_idx" ON "user_notification_preferences"("org_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_notification_preferences_user_id_org_id_key" ON "user_notification_preferences"("user_id", "org_id");

-- CreateIndex
CREATE INDEX "daily_report_deliveries_org_id_local_date_idx" ON "daily_report_deliveries"("org_id", "local_date");

-- CreateIndex
CREATE UNIQUE INDEX "daily_report_deliveries_user_id_org_id_kind_local_date_key" ON "daily_report_deliveries"("user_id", "org_id", "kind", "local_date");

-- AddForeignKey
ALTER TABLE "user_notification_preferences" ADD CONSTRAINT "user_notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_notification_preferences" ADD CONSTRAINT "user_notification_preferences_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_report_deliveries" ADD CONSTRAINT "daily_report_deliveries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_report_deliveries" ADD CONSTRAINT "daily_report_deliveries_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
