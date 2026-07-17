import { prisma } from "@usejunction/db";
import { defaultActivitySettings, type OrgActivitySettings } from "./contracts";

export async function getOrgActivitySettings(orgId: string): Promise<OrgActivitySettings> {
  const settings = await prisma.activitySettings.findUnique({ where: { orgId } });
  if (!settings) return defaultActivitySettings();
  return {
    teamPeriodControlsEnabled: settings.teamPeriodControlsEnabled,
    teamDeviceActivityEnabled: settings.teamDeviceActivityEnabled,
    updatedAt: settings.updatedAt.toISOString(),
  };
}

export async function upsertOrgActivitySettings(
  orgId: string,
  input: {
    teamPeriodControlsEnabled?: boolean;
    teamDeviceActivityEnabled?: boolean;
    updatedByUserId?: string | null;
  },
): Promise<OrgActivitySettings> {
  const existing = await prisma.activitySettings.findUnique({ where: { orgId } });
  const data = {
    teamPeriodControlsEnabled:
      input.teamPeriodControlsEnabled ?? existing?.teamPeriodControlsEnabled ?? false,
    teamDeviceActivityEnabled:
      input.teamDeviceActivityEnabled ?? existing?.teamDeviceActivityEnabled ?? false,
    updatedByUserId: input.updatedByUserId ?? existing?.updatedByUserId ?? null,
  };

  const settings = existing
    ? await prisma.activitySettings.update({ where: { id: existing.id }, data })
    : await prisma.activitySettings.create({ data: { orgId, ...data } });

  return {
    teamPeriodControlsEnabled: settings.teamPeriodControlsEnabled,
    teamDeviceActivityEnabled: settings.teamDeviceActivityEnabled,
    updatedAt: settings.updatedAt.toISOString(),
  };
}
