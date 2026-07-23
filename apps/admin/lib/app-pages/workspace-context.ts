import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@usejunction/db";
import { jsonSafe } from "@/lib/api/app-response";
import { ACTIVE_ORG_COOKIE } from "@/lib/require-organization";
import type { OrganizationRole } from "@/lib/rbac/permissions";
import { computeOrgBillingStatus } from "@/lib/saas-billing/status";
import { buildSyncWatermark } from "@/lib/workspace-sync-watermark";

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
    watermark: string;
  };
  sessionWorkspaceSyncRequired: boolean;
};

/**
 * Full client workspace-context payload (billing + sync watermark).
 * Used by both `/api/app/workspace-context` and RSC layout prefetch.
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
    watermark: "0|0|||",
  };

  if (current) {
    const [deviceAgg, toolCount] = await Promise.all([
      prisma.device.aggregate({
        where: { orgId: current.orgId, decommissionedAt: null },
        _count: { id: true },
        _max: {
          lastSeenAt: true,
          lastUsageSyncAt: true,
          lastAccountSyncAt: true,
        },
      }),
      prisma.toolInstallation.count({
        where: { orgId: current.orgId, detected: true },
      }),
    ]);
    const lastSeenAt = latestIso(deviceAgg._max.lastSeenAt);
    const lastUsageSyncAt = latestIso(deviceAgg._max.lastUsageSyncAt);
    const lastAccountSyncAt = latestIso(deviceAgg._max.lastAccountSyncAt);
    sync = {
      deviceCount: deviceAgg._count.id,
      toolCount,
      lastSeenAt,
      lastUsageSyncAt,
      lastAccountSyncAt,
      watermark: buildSyncWatermark({
        deviceCount: deviceAgg._count.id,
        toolCount,
        lastSeenAt,
        lastUsageSyncAt,
        lastAccountSyncAt,
      }),
    };
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
          onboardingCompleted: Boolean(current.onboardingCompletedAt),
        }
      : null,
    billing,
    sync,
    sessionWorkspaceSyncRequired: Boolean(
      current && (current.orgId !== sessionOrgId || legacyOrgId !== null),
    ),
  } satisfies WorkspaceContextPayload);
}

/** Convenience for RSC: auth + load in one call. Returns null if unauthenticated. */
export async function loadWorkspaceContextForSession() {
  const session = await auth();
  if (!session?.user?.id) return null;
  return loadWorkspaceContextPage(session.user.id, session.user.orgId);
}
