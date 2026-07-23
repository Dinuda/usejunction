import { prisma } from "@usejunction/db";
import type { AppPrincipal } from "@/lib/api/app-auth";
import { jsonSafe } from "@/lib/api/app-response";
import { getOrgActivitySettings } from "@/lib/activity/service";
import { getOrCreateNotificationPrefs } from "@/lib/notifications/preferences";
import { getOrgSignalsPolicy } from "@/lib/signals/service";
import { getOrgBillingStatus } from "@/lib/saas-billing/status";

export async function loadNotificationPreferences(principal: AppPrincipal) {
  const [user, prefs] = await Promise.all([
    prisma.user.findUnique({
      where: { id: principal.userId },
      select: { timeZone: true, timeZoneSource: true, timeZoneManual: true },
    }),
    getOrCreateNotificationPrefs(principal.userId, principal.orgId),
  ]);

  return jsonSafe({
    timeZone: user?.timeZone ?? "UTC",
    timeZoneSource: user?.timeZoneSource ?? null,
    timeZoneManual: Boolean(user?.timeZoneManual),
    role: principal.role,
    dailyPersonalEnabled: prefs.dailyPersonalEnabled,
    dailyOrgEnabled: prefs.dailyOrgEnabled,
  });
}

export async function loadOrgSettingsPage(principal: AppPrincipal) {
  const [settings, signalsPolicy, billing, billingMembers, organization] = await Promise.all([
    getOrgActivitySettings(principal.orgId),
    getOrgSignalsPolicy(principal.orgId),
    getOrgBillingStatus(principal.orgId, principal.role),
    prisma.developer.findMany({
      where: { orgId: principal.orgId, removedAt: null },
      select: { id: true, name: true, email: true },
      orderBy: [{ name: "asc" }, { email: "asc" }],
    }),
    prisma.organization.findUnique({
      where: { id: principal.orgId },
      select: { name: true, color: true },
    }),
  ]);
  return jsonSafe({
    orgId: principal.orgId,
    orgName: organization?.name ?? "Workspace",
    orgColor: organization?.color ?? null,
    settings,
    signalsPolicy,
    billing,
    billingMembers,
  });
}

/** Parallel prefs + org settings for settings RSC shell. */
export async function loadSettingsPage(principal: AppPrincipal) {
  const canManageOrg = principal.role === "owner" || principal.role === "admin";
  const [prefs, orgSettings] = await Promise.all([
    loadNotificationPreferences(principal),
    canManageOrg ? loadOrgSettingsPage(principal) : Promise.resolve(null),
  ]);
  return { prefs, orgSettings };
}
