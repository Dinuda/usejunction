import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@usejunction/db";
import { appData, appError, timingHeader } from "@/lib/api/app-response";
import { ACTIVE_ORG_COOKIE } from "@/lib/require-organization";
import type { OrganizationRole } from "@/lib/rbac/permissions";
import { computeOrgBillingStatus } from "@/lib/saas-billing/status";

export async function GET(_request: NextRequest) {
  const started = performance.now();
  const session = await auth();
  const sessionDecoded = performance.now();
  if (!session?.user?.id) {
    return appError("UNAUTHENTICATED", "Your session has expired.", 401);
  }

  const legacyOrgId = (await cookies()).get(ACTIVE_ORG_COOKIE)?.value ?? null;
  const memberships = await prisma.organizationMembership.findMany({
    where: { userId: session.user.id },
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
          trialEndsAt: true,
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
  const membershipsLoaded = performance.now();

  const legacy = legacyOrgId
    ? memberships.find((membership) => membership.orgId === legacyOrgId)
    : null;
  const selected = session.user.orgId
    ? memberships.find((membership) => membership.orgId === session.user.orgId)
    : null;
  const current = legacy ?? selected ?? memberships[0] ?? null;
  const role = (current?.role as OrganizationRole | undefined) ?? null;
  const billing = current
    ? computeOrgBillingStatus(
      {
        plan: current.organization.plan,
        trialEndsAt: current.organization.trialEndsAt,
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
  const prepared = performance.now();

  return appData(
    {
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
          role,
          onboardingCompleted: Boolean(current.onboardingCompletedAt),
        }
        : null,
      billing,
      sessionWorkspaceSyncRequired: Boolean(
        current && (current.orgId !== session.user.orgId || legacyOrgId !== null),
      ),
    },
    {
      serverTiming: timingHeader({
        session: sessionDecoded - started,
        membership: membershipsLoaded - sessionDecoded,
        data: prepared - membershipsLoaded,
        total: prepared - started,
      }),
    },
  );
}
