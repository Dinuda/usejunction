import { prisma } from "@usejunction/db";
import type { OrganizationRole } from "@/lib/workspace-context";
import { activeDevicesForOrg } from "@/lib/devices/decommission";
import { canManageSettings } from "@/lib/rbac/permissions";
import {
  getDeviceLimit,
  getPlanDisplayName,
  getTrialDaysLeft,
  isPaidPlan,
  resolveEffectivePlan,
  type SaasPlan,
} from "@/lib/saas-billing/entitlements";

export type OrgBillingStatus = {
  plan: string;
  effectivePlan: SaasPlan;
  planLabel: string;
  trialDaysLeft: number | null;
  subscriptionStatus: string | null;
  devicesUsed: number;
  devicesLimit: number | null;
  coveragePercent: number | null;
  canUpgrade: boolean;
  canManage: boolean;
  isAtDeviceLimit: boolean;
  developerCount: number;
  purchasedSeats: number | null;
  seatsRemaining: number | null;
  isAtSeatCapacity: boolean;
  minCheckoutSeats: number;
};

export async function getOrgBillingStatus(
  orgId: string,
  role: OrganizationRole | null,
): Promise<OrgBillingStatus> {
  const [org, devicesUsed, developerCount] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: orgId },
      select: {
        plan: true,
        trialEndsAt: true,
        subscriptionStatus: true,
        currentPeriodEnd: true,
        lemonSqueezyCustomerId: true,
        lemonSqueezySubscriptionId: true,
        lemonSqueezyQuantity: true,
      },
    }),
    prisma.device.count({ where: activeDevicesForOrg(orgId) }),
    prisma.developer.count({ where: { orgId, removedAt: null } }),
  ]);

  if (!org) {
    throw new Error("organization not found");
  }

  const effectivePlan = resolveEffectivePlan(org);
  const devicesLimit = getDeviceLimit(effectivePlan);
  const trialDaysLeft = effectivePlan === "trial" ? getTrialDaysLeft(org.trialEndsAt) : null;
  const paid = isPaidPlan(effectivePlan);
  const isAdmin = canManageSettings(role);
  const purchasedSeats = paid ? org.lemonSqueezyQuantity : null;
  const seatsRemaining =
    purchasedSeats !== null && purchasedSeats !== undefined
      ? Math.max(0, purchasedSeats - developerCount)
      : null;
  const isAtSeatCapacity =
    paid && purchasedSeats !== null && purchasedSeats !== undefined && developerCount >= purchasedSeats;

  let coveragePercent: number | null = null;
  if (paid && purchasedSeats !== null && purchasedSeats > 0) {
    coveragePercent = Math.min(100, Math.round((developerCount / purchasedSeats) * 100));
  } else if (devicesLimit !== null) {
    coveragePercent = Math.min(100, Math.round((devicesUsed / devicesLimit) * 100));
  }

  return {
    plan: org.plan,
    effectivePlan,
    planLabel: getPlanDisplayName(effectivePlan),
    trialDaysLeft,
    subscriptionStatus: org.subscriptionStatus,
    devicesUsed,
    devicesLimit,
    coveragePercent,
    canUpgrade: isAdmin && !paid,
    canManage: isAdmin && paid && Boolean(org.lemonSqueezyCustomerId),
    isAtDeviceLimit: devicesLimit !== null && devicesUsed >= devicesLimit,
    developerCount,
    purchasedSeats,
    seatsRemaining,
    isAtSeatCapacity,
    minCheckoutSeats: Math.max(1, developerCount),
  };
}

export async function assertCanEnrollDevice(orgId: string): Promise<{ allowed: true } | { allowed: false; message: string }> {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: {
      plan: true,
      trialEndsAt: true,
      subscriptionStatus: true,
      currentPeriodEnd: true,
    },
  });

  if (!org) {
    return { allowed: false, message: "organization not found" };
  }

  const effectivePlan = resolveEffectivePlan(org);
  const limit = getDeviceLimit(effectivePlan);
  if (limit === null) {
    return { allowed: true };
  }

  const devicesUsed = await prisma.device.count({ where: activeDevicesForOrg(orgId) });
  if (devicesUsed >= limit) {
    return {
      allowed: false,
      message: `Device limit reached (${limit}). Upgrade to Team for unlimited enrolled devices.`,
    };
  }

  return { allowed: true };
}
