import { cookies } from "next/headers";
import { prisma } from "@usejunction/db";
import { jsonSafe } from "@/lib/api/app-response";
import { getWorkspaceSyncReadiness } from "@/lib/analytics/snapshots/readiness";
import { ACTIVE_ORG_COOKIE } from "@/lib/require-organization";
import type { OrganizationRole } from "@/lib/rbac/permissions";
import { computeOrgBillingStatus } from "@/lib/saas-billing/status";
import {
  buildDataSyncWatermark,
  buildPresenceSyncWatermark,
} from "@/lib/workspace-sync-watermark";

function latestIso(...values: Array<Date | null | undefined>): string | null {
  let latest: Date | null = null;
  for (const value of values) {
    if (!value) continue;
    if (!latest || value > latest) latest = value;
  }
  return latest?.toISOString() ?? null;
}

export type WorkspaceContextPayload = {
  organizations: Array<{ id: string; name: string; color: string | null; role: OrganizationRole }>;
  current: {
    id: string;
    name: string;
    color: string | null;
    role: OrganizationRole;
    onboardingCompleted: boolean;
  } | null;
  billing: ReturnType<typeof computeOrgBillingStatus> | null;
  sync: {
    deviceCount: number;
    toolCount: number;
    lastSeenAt: string | null;
    lastUsageSyncAt: string | null;
    lastAccountSyncAt: string | null;
    lastToolsSyncAt: string | null;
    lastQuotasSyncAt: string | null;
    dataWatermark: string;
    presenceWatermark: string;
    dashboardReady: boolean;
    dirtyDayCount: number;
    snapshotLagSeconds: number | null;
  };
  sessionWorkspaceSyncRequired: boolean;
};

/**
 * Full client workspace-context payload (billing + split sync watermarks).
 * Loaded only through `/api/app/workspace-context`; workspace layouts stay synchronous.
 */
export async function loadWorkspaceContextPage(userId: string, sessionOrgId: string | null | undefined) {
  const legacyOrgId = (await cookies()).get(ACTIVE_ORG_COOKIE)?.value ?? null;
  const memberships = await prisma.organizationMembership.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: {
      orgId: true,
      role: true,
      onboardingCompletedAt: true,
      organization: {
        select: {
          id: true,
          name: true,
          color: true,
          plan: true,
          subscriptionStatus: true,
          currentPeriodEnd: true,
          lemonSqueezyCustomerId: true,
          lemonSqueezySubscriptionId: true,
          lemonSqueezyQuantity: true,
          _count: {
            select: { developers: { where: { removedAt: null } } },
          },
        },
      },
    },
  });

  const legacy = legacyOrgId
    ? memberships.find((membership) => membership.orgId === legacyOrgId)
    : null;
  const selected = sessionOrgId
    ? memberships.find((membership) => membership.orgId === sessionOrgId)
    : null;
  const current = legacy ?? selected ?? memberships[0] ?? null;
  const role = (current?.role as OrganizationRole | undefined) ?? null;
  const onboardingCompleted = Boolean(current?.onboardingCompletedAt);
  const billing = current
    ? computeOrgBillingStatus(
        {
          plan: current.organization.plan,
          subscriptionStatus: current.organization.subscriptionStatus,
          currentPeriodEnd: current.organization.currentPeriodEnd,
          lemonSqueezyCustomerId: current.organization.lemonSqueezyCustomerId,
          lemonSqueezySubscriptionId: current.organization.lemonSqueezySubscriptionId,
          lemonSqueezyQuantity: current.organization.lemonSqueezyQuantity,
          usersUsed: current.organization._count.developers,
        },
        role,
      )
    : null;

  let sync = {
    deviceCount: 0,
    toolCount: 0,
    lastSeenAt: null as string | null,
    lastUsageSyncAt: null as string | null,
    lastAccountSyncAt: null as string | null,
    lastToolsSyncAt: null as string | null,
    lastQuotasSyncAt: null as string | null,
    dataWatermark: "0|0|||||0|1",
    presenceWatermark: "0|",
    dashboardReady: true,
    dirtyDayCount: 0,
    snapshotLagSeconds: null as number | null,
  };

  if (current) {
    const deviceCount = await prisma.device.count({
      where: { orgId: current.orgId, decommissionedAt: null },
    });

    if (deviceCount > 0) {
      const [deviceAgg, toolCount, readiness] = await Promise.all([
        prisma.device.aggregate({
          where: { orgId: current.orgId, decommissionedAt: null },
          _count: { id: true },
          _max: {
            lastSeenAt: true,
            lastUsageSyncAt: true,
            lastAccountSyncAt: true,
            lastToolsSyncAt: true,
            lastQuotasSyncAt: true,
          },
        }),
        prisma.toolInstallation.count({
          where: { orgId: current.orgId, detected: true },
        }),
        getWorkspaceSyncReadiness(current.orgId),
      ]);
      const lastSeenAt = latestIso(deviceAgg._max.lastSeenAt);
      const lastUsageSyncAt = latestIso(deviceAgg._max.lastUsageSyncAt);
      const lastAccountSyncAt = latestIso(deviceAgg._max.lastAccountSyncAt);
      const lastToolsSyncAt = latestIso(deviceAgg._max.lastToolsSyncAt);
      const lastQuotasSyncAt = latestIso(deviceAgg._max.lastQuotasSyncAt);
      sync = {
        deviceCount: deviceAgg._count.id,
        toolCount,
        lastSeenAt,
        lastUsageSyncAt,
        lastAccountSyncAt,
        lastToolsSyncAt,
        lastQuotasSyncAt,
        dataWatermark: buildDataSyncWatermark({
          deviceCount: deviceAgg._count.id,
          toolCount,
          lastUsageSyncAt,
          lastAccountSyncAt,
          lastToolsSyncAt,
          lastQuotasSyncAt,
          dirtyDayCount: readiness.dirtyDayCount,
          dashboardReady: readiness.dashboardReady,
        }),
        presenceWatermark: buildPresenceSyncWatermark({
          deviceCount: deviceAgg._count.id,
          lastSeenAt,
        }),
        dashboardReady: readiness.dashboardReady,
        dirtyDayCount: readiness.dirtyDayCount,
        snapshotLagSeconds: readiness.snapshotLagSeconds,
      };
    }
  }

  return jsonSafe({
    organizations: memberships.map((membership) => ({
      id: membership.organization.id,
      name: membership.organization.name,
      color: membership.organization.color,
      role: membership.role as OrganizationRole,
    })),
    current: current
      ? {
          id: current.organization.id,
          name: current.organization.name,
          color: current.organization.color,
          role: role!,
          onboardingCompleted,
        }
      : null,
    billing,
    sync,
    sessionWorkspaceSyncRequired: Boolean(
      current && (current.orgId !== sessionOrgId || legacyOrgId !== null),
    ),
  } satisfies WorkspaceContextPayload);
}
