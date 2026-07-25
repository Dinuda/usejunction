import { prisma } from "@usejunction/db";
import { defaultActivitySettings, type OrgActivitySettings } from "./contracts";
import { enforceDeviceActivityRetention } from "./record-device-activity-event";

export async function getOrgActivitySettings(orgId: string): Promise<OrgActivitySettings> {
  const settings = await prisma.activitySettings.findUnique({ where: { orgId } });
  if (!settings) return defaultActivitySettings();
  return {
    teamDeviceActivityEnabled: settings.teamDeviceActivityEnabled,
    teamToolsBrowseEnabled: settings.teamToolsBrowseEnabled,
    updatedAt: settings.updatedAt.toISOString(),
  };
}

export async function upsertOrgActivitySettings(
  orgId: string,
  input: {
    teamDeviceActivityEnabled?: boolean;
    teamToolsBrowseEnabled?: boolean;
    updatedByUserId?: string | null;
  },
): Promise<OrgActivitySettings> {
  const existing = await prisma.activitySettings.findUnique({ where: { orgId } });
  const data = {
    teamDeviceActivityEnabled:
      input.teamDeviceActivityEnabled ?? existing?.teamDeviceActivityEnabled ?? true,
    teamToolsBrowseEnabled:
      input.teamToolsBrowseEnabled ?? existing?.teamToolsBrowseEnabled ?? true,
    updatedByUserId: input.updatedByUserId ?? existing?.updatedByUserId ?? null,
  };

  const settings = existing
    ? await prisma.activitySettings.update({ where: { id: existing.id }, data })
    : await prisma.activitySettings.create({ data: { orgId, ...data } });

  return {
    teamDeviceActivityEnabled: settings.teamDeviceActivityEnabled,
    teamToolsBrowseEnabled: settings.teamToolsBrowseEnabled,
    updatedAt: settings.updatedAt.toISOString(),
  };
}

export async function pruneDeviceActivityEvents(orgId: string) {
  return enforceDeviceActivityRetention(orgId);
}
